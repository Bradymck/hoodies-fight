const { redisCommand } = require("./_lib/redis");

// Matches OnChainHoodies' own token ID range (0-5999, see their openapi.json)
// - same duplicated constant every other route file here already keeps its
// own copy of, no shared _lib module for it.
const MAX_TOKEN_ID = 5999;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
// leaderboard:wins is a sorted set (score = win count, member = tokenId),
// written alongside the existing hoodie:{id}:wins counter in match-result.js
// - ZREVRANGE...WITHSCORES gives a ranked leaderboard in one round trip
// instead of scanning every hoodie:*:wins key.
const LEADERBOARD_KEY = "leaderboard:wins";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const limitRaw = Number(req.query.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= MAX_LIMIT ? limitRaw : DEFAULT_LIMIT;

  try {
    // WITHSCORES flattens to [member, score, member, score, ...] - Upstash's
    // REST layer doesn't restructure this into pairs for us.
    const raw = await redisCommand("zrevrange", LEADERBOARD_KEY, "0", String(limit - 1), "WITHSCORES");
    const fighters = [];
    for (let i = 0; i < (raw || []).length; i += 2) {
      const tokenId = Number(raw[i]);
      if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > MAX_TOKEN_ID) continue;
      fighters.push({ tokenId, wins: Number(raw[i + 1]) || 0 });
    }
    res.status(200).json({ fighters });
  } catch (err) {
    console.error("[leaderboard]", err);
    res.status(502).json({ error: "Could not load leaderboard right now" });
  }
};
