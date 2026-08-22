const { redisCommand } = require("../_lib/redis");

// Entries in matches:recent are match-level now (one LPUSH per completed
// match from match-result.js: {winnerId, loserId, ts}, either ID possibly
// null for a one-side-verified match), not the old per-round/per-side shape
// ({tokenId, opponentTokenId, result, ts}, up to 6 pushed per best-of-3).
// This handler just parses and forwards whatever's stored, so it needed no
// change for that - but any consumer of this endpoint needs to read the new
// field names.
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const limitRaw = Number(req.query.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 25;

  try {
    const raw = await redisCommand("lrange", "matches:recent", "0", String(limit - 1));
    const matches = (raw || [])
      .map((entry) => {
        try {
          return JSON.parse(entry);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    res.status(200).json({ matches });
  } catch (err) {
    console.error("[matches-recent]", err);
    res.status(502).json({ error: "Could not load recent matches right now" });
  }
};
