const { redisCommand } = require("./_lib/redis");

// Matches OnChainHoodies' own token ID range (0-5999, see their openapi.json).
const MAX_TOKEN_ID = 5999;
// Recent-match feed is a rolling window, not a full archive - old entries
// fall off the end via LTRIM rather than growing the list forever.
const RECENT_MATCHES_CAP = 200;
// leaderboard:wins is a sorted set (score = win count, member = tokenId) -
// see api/leaderboard.js, which reads it with ZREVRANGE...WITHSCORES.
const LEADERBOARD_KEY = "leaderboard:wins";
// Canonical lower/higher ordering so the same matchup always lands on the
// same hash key regardless of which fighter was p1 vs p2 - see
// api/rivalry/[tokenIdA]/[tokenIdB].js, which reads this same key shape.
function rivalryKey(tokenIdA, tokenIdB) {
  const lower = Math.min(tokenIdA, tokenIdB);
  const higher = Math.max(tokenIdA, tokenIdB);
  return `rivalry:${lower}:${higher}`;
}

// Unauthenticated by design, same trust model as the rest of the game (no
// wallet writes, nothing on-chain, purely social) - anyone can POST a fake
// result. Stats here are a fun ambient signal, not a competitive record, so
// that tradeoff is fine; see openapi.json's description for this endpoint.
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

  const { tokenId, opponentTokenId, result } = req.body || {};
  const id = Number(tokenId);
  const oppId = opponentTokenId === undefined || opponentTokenId === null ? null : Number(opponentTokenId);

  if (!Number.isInteger(id) || id < 0 || id > MAX_TOKEN_ID) {
    res.status(400).json({ error: `tokenId must be an integer 0-${MAX_TOKEN_ID}` });
    return;
  }
  if (result !== "win" && result !== "loss") {
    res.status(400).json({ error: 'result must be "win" or "loss"' });
    return;
  }
  if (oppId !== null && (!Number.isInteger(oppId) || oppId < 0 || oppId > MAX_TOKEN_ID)) {
    res.status(400).json({ error: `opponentTokenId must be an integer 0-${MAX_TOKEN_ID}` });
    return;
  }

  const field = result === "win" ? "wins" : "losses";

  // count stays at index 0 - everything conditional gets appended after it.
  const writes = [
    redisCommand("incr", `hoodie:${id}:${field}`),
    redisCommand(
      "lpush",
      "matches:recent",
      JSON.stringify({ tokenId: id, opponentTokenId: oppId, result, ts: Date.now() }),
    ),
  ];
  // Solo/practice reports omit opponentTokenId, and a token can't have a
  // head-to-head record against itself - both leave no valid rivalry pairing.
  if (oppId !== null && oppId !== id) {
    const winnerId = result === "win" ? id : oppId;
    writes.push(redisCommand("hincrby", rivalryKey(id, oppId), String(winnerId), "1"));
  }
  // Leaderboard ranks by wins only, so it moves in lockstep with the wins
  // counter above rather than firing on every result.
  if (result === "win") {
    writes.push(redisCommand("zincrby", LEADERBOARD_KEY, "1", String(id)));
  }

  try {
    const [count] = await Promise.all(writes);
    await redisCommand("ltrim", "matches:recent", "0", String(RECENT_MATCHES_CAP - 1));
    res.status(200).json({ ok: true, tokenId: id, [field]: count });
  } catch (err) {
    console.error("[match-result]", err);
    res.status(502).json({ error: "Could not record match result right now" });
  }
};
