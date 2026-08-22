#!/usr/bin/env node
// One-time data reset for the pre-idempotency match-result bug.
//
// The old client (src/game.js's endRound) fired reportMatchResult() TWICE
// per round - once "win", once "loss" - for up to 6 POSTs in a single
// best-of-3 match, each one an independent, unauthenticated, un-deduped
// write. Every counter it ever touched (hoodie:{id}:wins/losses,
// rivalry:{lo}:{hi}, leaderboard:wins, matches:recent) is inflated by an
// unknown, unrecoverable multiple - there's no way to tell from the numbers
// alone which fraction of a given count was real. Decision: corrupted data
// cannot be reconstructed, so wipe it rather than try to "fix" it. The new
// match-result.js (single report per completed match, idempotent, pipelined)
// starts every one of these keys fresh from zero going forward.
//
// Run ONCE, manually, after the match-result rewrite is deployed:
//
//   KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/reset-corrupt-stats.js --confirm
//
// (or just `node scripts/reset-corrupt-stats.js --confirm` if KV_REST_API_URL/
// KV_REST_API_TOKEN are already in the shell's env - e.g. after
// `vercel env pull`, which is the same source Vercel injects them from for
// the live api/ functions).
//
// --confirm is required and the target host is printed before anything is
// deleted - this is a destructive, irreversible wipe against whatever
// KV_REST_API_URL happens to be set in the shell, and a stale `vercel env
// pull` from an unrelated project would otherwise silently point this at
// the wrong database.

const { redisCommand, redisMultiExec } = require("../api/_lib/redis");

if (!process.argv.includes("--confirm")) {
  console.error(
    "[reset-corrupt-stats] refusing to run without --confirm " +
      "(this permanently deletes rivalry/leaderboard/match-history data)",
  );
  process.exit(1);
}

const SCAN_COUNT = 200;
const DEL_BATCH_SIZE = 200;

// SCAN is cursor-based and never guaranteed to return everything in one
// call (even with a generous COUNT hint) - loop until Redis hands back
// cursor "0", which is what actually means "done", not "the first empty-
// looking page".
async function scanKeys(pattern) {
  let cursor = "0";
  const keys = [];
  do {
    const [nextCursor, batch] = await redisCommand(
      "scan",
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      String(SCAN_COUNT),
    );
    cursor = nextCursor;
    keys.push(...(batch || []));
  } while (cursor !== "0");
  return keys;
}

// DEL accepts multiple keys in a single command, so each batch is one
// pipeline call containing one DEL with up to DEL_BATCH_SIZE keys - not one
// pipeline call per key, and not one DEL per key inside the pipeline either.
async function deleteKeys(keys) {
  if (!keys.length) return;
  for (let i = 0; i < keys.length; i += DEL_BATCH_SIZE) {
    const batch = keys.slice(i, i + DEL_BATCH_SIZE);
    await redisMultiExec([["DEL", ...batch]]);
  }
}

async function main() {
  console.log(`[reset-corrupt-stats] target: ${process.env.KV_REST_API_URL || "(KV_REST_API_URL not set)"}`);
  console.log("[reset-corrupt-stats] scanning for corrupted keys...");

  // Per-hoodie and per-matchup counters - unbounded key spaces, hence SCAN
  // rather than a fixed name.
  const rivalryKeys = await scanKeys("rivalry:*");
  const hoodieWinKeys = await scanKeys("hoodie:*:wins");
  const hoodieLossKeys = await scanKeys("hoodie:*:losses");

  console.log(
    `[reset-corrupt-stats] found ${rivalryKeys.length} rivalry:* keys, ` +
      `${hoodieWinKeys.length} hoodie:*:wins keys, ${hoodieLossKeys.length} hoodie:*:losses keys`,
  );

  // Fixed single keys, not patterns:
  //   - matches:recent: the old per-round/per-side feed (up to 6 entries
  //     pushed per best-of-3, half of them phantom "loss" entries for
  //     rounds that were still mid-match).
  //   - leaderboard:wins: a sorted set ZINCRBY-inflated by the exact same
  //     buggy call site as hoodie:{id}:wins - easy to miss in a first pass
  //     because it isn't a hoodie:* key, but it was written from the same
  //     place and is exactly as corrupted.
  const fixedKeys = ["matches:recent", "leaderboard:wins"];

  const allKeys = [...rivalryKeys, ...hoodieWinKeys, ...hoodieLossKeys, ...fixedKeys];
  if (allKeys.length === 0) {
    console.log("[reset-corrupt-stats] nothing found to delete.");
    return;
  }

  await deleteKeys(allKeys);
  console.log(`[reset-corrupt-stats] deleted ${allKeys.length} keys. Done.`);
}

main().catch((err) => {
  console.error("[reset-corrupt-stats] failed:", err);
  process.exit(1);
});
