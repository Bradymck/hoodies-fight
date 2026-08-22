const { redisMultiExec } = require("./_lib/redis");
const { MAX_TOKEN_ID } = require("./_lib/constants");

// Recent-match feed is a rolling window, not a full archive - old entries
// fall off the end via LTRIM rather than growing the list forever.
const RECENT_MATCHES_CAP = 200;
// leaderboard:wins is a sorted set (score = win count, member = tokenId) -
// see api/leaderboard.js, which reads it with ZREVRANGE...WITHSCORES.
const LEADERBOARD_KEY = "leaderboard:wins";

// Canonical lower/higher ordering so the same matchup always lands on the
// same hash key regardless of which fighter won - see
// api/rivalry/[tokenIdA]/[tokenIdB].js, which reads this same key shape.
function rivalryKey(tokenIdA, tokenIdB) {
  const lower = Math.min(tokenIdA, tokenIdB);
  const higher = Math.max(tokenIdA, tokenIdB);
  return `rivalry:${lower}:${higher}`;
}

// Deliberately NOT `Number(value)` - that coerces null/''/[]/false all to
// 0 (a real NFT, not "absent"), and parses hex-looking strings like "0x10"
// as 16 instead of rejecting them. A tokenId is only ever a real integer
// (already-parsed JSON number) or a plain base-10 digit string; anything
// else - floats, whitespace, leading zeros aside, hex, booleans, arrays -
// is not a tokenId and must fail validation rather than silently become 0
// or some other in-range number.
function parseStrictTokenId(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

// A side is either `null`/absent (this fighter's token was never
// wallet-verified - see src/main.js's `verified` flag - so no result can
// truthfully be attributed to it) or a real in-range tokenId. Anything else
// (a malformed string, a float, a boolean, an out-of-range number) is a
// validation failure, not silently treated as "no side" - only an explicit
// null/undefined means that.
function validateSide(raw, label) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const parsed = parseStrictTokenId(raw);
  if (parsed === null || parsed < 0 || parsed > MAX_TOKEN_ID) {
    return { ok: false, error: `${label} must be null or an integer 0-${MAX_TOKEN_ID}` };
  }
  return { ok: true, value: parsed };
}

// Unauthenticated by design, same trust model as the rest of the game (no
// wallet writes, nothing on-chain, purely social) - anyone can POST a fake
// result. Stats here are a fun ambient signal, not a competitive record, so
// that tradeoff is fine; see openapi.json's description for this endpoint.
// No idempotency key and no IP-based rate limiting: the client call is
// fire-and-forget with no retry (src/api.js's reportMatchResult), so a
// duplicate/retried POST for the same match isn't a real scenario worth
// building machinery for - it would just add an unbounded, attacker-writable
// key for every spammed request without actually preventing anything a
// motivated spammer couldn't already do by POSTing distinct fake results.
// What actually matters - a single match's writes landing all-or-nothing -
// is handled below by redisMultiExec, a real atomic transaction.
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const body = req.body || {};
  const { winnerId: rawWinnerId, loserId: rawLoserId } = body;

  const winnerSide = validateSide(rawWinnerId, "winnerId");
  if (!winnerSide.ok) {
    res.status(400).json({ error: winnerSide.error });
    return;
  }
  const loserSide = validateSide(rawLoserId, "loserId");
  if (!loserSide.ok) {
    res.status(400).json({ error: loserSide.error });
    return;
  }
  const winnerId = winnerSide.value;
  const loserId = loserSide.value;

  if (winnerId === null && loserId === null) {
    res.status(400).json({ error: "winnerId and loserId cannot both be null - nothing to report" });
    return;
  }
  if (winnerId !== null && loserId !== null && winnerId === loserId) {
    res.status(400).json({ error: "winnerId and loserId cannot be the same tokenId" });
    return;
  }

  try {
    // All stat writes derived from this one call, batched into ONE
    // multi-exec transaction so they land atomically - either the full
    // batch applies or none of it does. This is what prevents "tearing" (a
    // report where e.g. the winner's INCR lands but the rivalry HINCRBY
    // doesn't because of a mid-batch failure).
    const commands = [];
    // Winner's win count + leaderboard rank only move for a verified
    // winner - an unverified (randomly-sampled) token never gets a win
    // attributed to it.
    if (winnerId !== null) {
      commands.push(["INCR", `hoodie:${winnerId}:wins`]);
      commands.push(["ZINCRBY", LEADERBOARD_KEY, "1", String(winnerId)]);
    }
    // Same for the loser's loss count.
    if (loserId !== null) {
      commands.push(["INCR", `hoodie:${loserId}:losses`]);
    }
    // Rivalry is a head-to-head record between two REAL identities - it
    // only makes sense (and only gets written) when BOTH sides are
    // verified. Today P2 is never verified (see src/main.js), so this
    // branch is dormant until real PvP exists; that's expected, not a bug -
    // the server logic stays correct and ready for when it isn't dormant.
    if (winnerId !== null && loserId !== null) {
      commands.push(["HINCRBY", rivalryKey(winnerId, loserId), String(winnerId), "1"]);
    }
    // Match-level feed entry - one per match now, not one per side/round.
    // Shape intentionally changed from the old per-round
    // {tokenId, opponentTokenId, result} to a match-level
    // {winnerId, loserId, ts}; either field can be null for a
    // one-side-verified match. api/matches/recent.js just parses and
    // forwards whatever's stored here, so it needed no code change, but any
    // future reader must expect this shape, not the old one.
    commands.push([
      "LPUSH",
      "matches:recent",
      JSON.stringify({ winnerId, loserId, ts: Date.now() }),
    ]);
    commands.push(["LTRIM", "matches:recent", "0", String(RECENT_MATCHES_CAP - 1)]);

    await redisMultiExec(commands);
    res.status(200).json({ ok: true, winnerId, loserId });
  } catch (err) {
    console.error("[match-result]", err);
    res.status(502).json({ error: "Could not record match result right now" });
  }
};
