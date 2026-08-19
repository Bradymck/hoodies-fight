const { redisCommand } = require("../../_lib/redis");

// Matches OnChainHoodies' own token ID range (0-5999, see their openapi.json)
// - same duplicated constant every other route file here already keeps its
// own copy of, no shared _lib module for it.
const MAX_TOKEN_ID = 5999;

// Canonical lower/higher ordering so the same matchup always lands on the
// same hash key regardless of which fighter was p1 vs p2 in a given match;
// hash fields are the token IDs themselves (win count for that ID within
// this pairing), so HMGET on the two IDs reads both sides at once. No legacy
// unprefixed-key exception (unlike hoodie:{id}:wins in match-result.js) -
// rivalry records are a brand-new feature, there's no pre-existing data at
// a different key shape to stay compatible with.
function rivalryKey(tokenIdA, tokenIdB) {
  const lower = Math.min(tokenIdA, tokenIdB);
  const higher = Math.max(tokenIdA, tokenIdB);
  return `rivalry:${lower}:${higher}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const a = Number(req.query.tokenIdA);
  const b = Number(req.query.tokenIdB);

  if (!Number.isInteger(a) || a < 0 || a > MAX_TOKEN_ID || !Number.isInteger(b) || b < 0 || b > MAX_TOKEN_ID) {
    res.status(400).json({ error: `tokenIdA/tokenIdB must be integers 0-${MAX_TOKEN_ID}` });
    return;
  }
  // No self-pairing - a token can't have a head-to-head record against itself.
  if (a === b) {
    res.status(400).json({ error: "tokenIdA and tokenIdB must differ" });
    return;
  }

  try {
    const [winsA, winsB] = await redisCommand("hmget", rivalryKey(a, b), String(a), String(b));
    const wa = Number(winsA) || 0;
    const wb = Number(winsB) || 0;
    res.status(200).json({ tokenIdA: a, tokenIdB: b, wins: { [a]: wa, [b]: wb }, matches: wa + wb });
  } catch (err) {
    console.error("[rivalry]", err);
    res.status(502).json({ error: "Could not load rivalry record right now" });
  }
};
