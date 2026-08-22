// Zero-dependency Upstash Redis client - plain fetch() against their REST
// API instead of the @upstash/redis npm package, matching the rest of this
// repo's zero-npm-dependency approach. KV_REST_API_URL/KV_REST_API_TOKEN are
// injected automatically by the Upstash-for-Redis Vercel integration.
// Prefixed with an underscore (like the whole _lib dir) so Vercel doesn't
// treat this as a route of its own - it's imported by the real handlers.

// Every api/ route funnels its Redis I/O through this one file, so a single
// timeout here protects all of them - without it, an Upstash-side stall
// would hang a serverless function until Vercel's own (much longer, and not
// ours to tune per-route) function timeout kills it. 5s is generous for a
// same-cloud REST round trip but short enough that a stuck request still
// fails fast enough for a fire-and-forget client (reportMatchResult) or a
// user-facing read (leaderboard, stats) to get a real error instead of a
// spinner that never resolves.
const REDIS_TIMEOUT_MS = 5000;

function authHeaders(token, extra) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function redisCommand(cmd, ...args) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Redis is not configured (KV_REST_API_URL/KV_REST_API_TOKEN missing)");
  }
  // Path-style form (command + every arg as its own URL segment) rather than
  // command-in-path + args-in-body - the latter looked plausible but Upstash
  // rejected it ("wrong number of arguments") for anything past a single arg.
  const path = [cmd, ...args].map((s) => encodeURIComponent(s)).join("/");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/${path}`, {
      method: "POST",
      headers: authHeaders(token),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  } finally {
    // Always clear, whether the fetch resolved, rejected, or was itself the
    // thing that fired the abort - an uncleared timer on the happy path
    // would otherwise fire pointlessly 5s later.
    clearTimeout(timer);
  }
}

// Upstash's documented /multi-exec endpoint - real MULTI/EXEC semantics,
// not just a batched round trip. Body is a JSON array of command arrays
// (e.g. [["INCR","hoodie:1:wins"],["ZINCRBY","leaderboard:wins","1","1"]]).
// This is what match-result.js needs for its atomic write batch: a prior
// version used Upstash's /pipeline endpoint, which only batches the network
// round trip and explicitly does NOT roll back or guarantee atomicity across
// commands - a mid-batch abort or per-command error there could leave some
// of a match's writes applied and others not, i.e. exactly the tearing bug
// this whole rewrite exists to eliminate. /multi-exec queues every command
// on the Redis side and executes them as a single atomic unit, so either the
// full batch lands or none of it does. Response body is a JSON array, one
// entry per command, each `{result: ...}` or `{error: "..."}` in order.
async function redisMultiExec(commands) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Redis is not configured (KV_REST_API_URL/KV_REST_API_TOKEN missing)");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/multi-exec`, {
      method: "POST",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error((data && data.error) || "Unexpected response from Redis multi-exec");
    }
    // Surface the first per-command error as a real thrown Error rather
    // than silently returning partial/garbage results.
    return data.map((entry) => {
      if (entry && entry.error) throw new Error(entry.error);
      return entry ? entry.result : undefined;
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { redisCommand, redisMultiExec };
