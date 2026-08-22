// Shared across every CJS route under api/ that needs OnChainHoodies' own
// token ID range (0-5999, see their openapi.json). Previously duplicated as
// a literal `5999` in 4 separate files (match-result.js, leaderboard.js,
// hoodie/[tokenId]/stats.js, rivalry/[tokenIdA]/[tokenIdB].js) - one shared
// module now, required via a relative path from each (see api/_lib/redis.js
// for the precedent this follows).
//
// NOT shared with src/main.js's own client-side MAX_TOKEN_ID - that file is
// ESM served straight to the browser, this is CJS bundled per-route by
// Vercel, and there's no build step in this repo that bridges the two. See
// the comment next to that copy.
module.exports = { MAX_TOKEN_ID: 5999 };
