# Backlog

Source: a full 7-dimension site audit (combat engine, AI, input, frontend, backend/infra, docs-vs-reality, security), a first fix pass on the top findings, then a second fable-build pass covering everything else the audit found. Last updated 2026-08-21.

## Backlog (designed/discussed, not started)

- **Local 2-human-player mode**: fully built end-to-end (dedicated p2 keymap, per-frame second-gamepad polling in `src/gamepad.js`) but 100% unreachable — `src/main.js` hardcodes `p2AI: true`, no UI entry point exists to turn it on. Deliberately out of scope for the bug-fix passes — this is a feature decision, not a bug.
- **Mobile support**: zero touch-control layer for a keyboard/gamepad-only game, and zero messaging telling a phone visitor they can't actually play. Either build touch controls or at minimum detect and message it.
- **Cosmetic packs** (`tasks/prd-fighter-arena-cosmetic-packs.md`): a full PRD exists, zero implementation scaffolding in the real code yet. Genuinely not started, not "unfinished."
- **2.0-VISION.md / CHARACTER-AGENT-VISION.md**: decay curves, soulbound achievements, marketplace, character-agent features — documented as intentionally unscoped future work, not a near-term gap.
- **`GET /api/rivalry/...`**: fully built and documented, but permanently returns empty data today — rivalry writes require BOTH sides wallet-verified, and P2 is currently always a randomly-sampled token (no real PvP exists yet). This is expected/dormant, not broken; wiring up real PvP (or deciding to retire the endpoint) is a product call, not a bug fix.
- **`GET /api/matches/recent`**: built and documented, zero client callers in `src/`. Left as-is — not worth wiring up or removing until there's a reason to.

## Needs a product call

- Server-side "verified" claim: `openapi.json` documents that a non-null `winnerId`/`loserId` means that side was wallet-verified, but the server itself doesn't enforce this — it trusts whatever the client sends (unauthenticated by design, same trust model as the rest of the game). A direct API caller could POST any tokenId. Current stance: stats are an explicit "ambient signal, not a competitive record" (see `api/match-result.js`'s own comment) — revisit only if that trust model ever needs to change.

## Could do better (non-blocking polish)

- AI's "gets harder as it takes damage" framing (`src/ai.js` difficulty scaling) only actually varies defense/reaction speed — offensive mix changes some now (offensive uppercut, juggle-pursuit, the fixed potshot ladder) but isn't difficulty-scaled beyond what already shipped.
- No build/deploy-time check that `KV_REST_API_URL`/`KV_REST_API_TOKEN` are actually set — a misconfigured Vercel-Upstash integration currently looks identical to "Redis is briefly down," with no loud failure anywhere.
- p1's keyboard layout (`f`/`g`/`h`/`y` for Light/Medium/Heavy/Special) crowds the attack cluster off home row relative to p2's cleanly separated arrow-key layout.
- AI juggle-pursuit: at low difficulty, `THINK_INTERVAL` can occasionally exceed the jump window the air-attack follow-up needs, causing a jump/land retry loop before it connects. Self-corrects on the next think tick — not a hard failure, flagged by review as non-blocking, left as-is.
- Cancellation via the deploy `concurrency` guard can't recall a `vercel deploy --prod` that Vercel already accepted mid-cancel — consider a `vercel promote`/alias-pin step keyed to `github.sha` for a harder guarantee, if this class of race ever actually bites in practice.
- Stale `block: false` field still carried in `Fighter.prevInput` (`src/fighter.js`) — left in place; it turned out to still be load-bearing (edge-triggers the juggle burst-escape via `justPressed.block`), not actually dead.

## Fixed (this pass — uncommitted, verified live before commit)

**Match-result protocol** — full rewrite, not a patch (two prior patch attempts were blocked by adversarial review for real regressions):
- Client now reports exactly once per **completed match** (not per round) — `src/game.js`'s old two-POST-per-round calls are gone; `src/main.js`'s `runMatch()` fires a single `reportMatchResult(winnerId, loserId)` when the match ends.
- Each side is only ever a real tokenId when that side came from a wallet-verified pool; a randomly-sampled free-play token is sent as `null`, never attributed a result. Skipped entirely when neither side is verified.
- Server (`api/match-result.js`) validates strictly (no `Number()` coercion — rejects `null`/`''`/`[]`/`false` coercing to token `0`, rejects `"0x10"`-style strings) and writes all stats (wins/losses/rivalry/leaderboard/recent-feed) in one real atomic transaction via Upstash's `/multi-exec` (not `/pipeline`, which only batches the round trip and doesn't roll back — an earlier draft of this fix used it and a reviewer caught that it didn't actually deliver the "no torn writes" guarantee it claimed).
- No idempotency/matchId layer — the client call is fire-and-forget with no retry, so there was never a real double-submit scenario to guard against; an earlier draft added a `SET NX`/`DEL` idempotency key anyway and a reviewer found it could itself cause both silent match loss and double-counting under partial failure, plus an unbounded attacker-writable key space. Dropped entirely in favor of just making the writes atomic.
- `MAX_TOKEN_ID = 5999` extracted to `api/_lib/constants.js`, imported by all 4 backend files that used to hardcode it.
- All outbound Upstash fetches (`api/_lib/redis.js`) now have a 5s `AbortController` timeout, applied once at the shared choke point so every `api/` route inherits it.
- `scripts/reset-corrupt-stats.js` — one-time wipe of the historical Redis data corrupted by the old double/6x-counting bug (`rivalry:*`, `hoodie:*:wins/losses`, `matches:recent`, `leaderboard:wins`). Requires `--confirm` and prints the target `KV_REST_API_URL` before deleting anything, so a stale `vercel env pull` from another project can't silently wipe the wrong database. Not yet run against production — run once after this branch deploys.
- CSP fix: `fetchTransparentHeadDataUri` (`src/api.js`) no longer `fetch()`s a `data:` URI when the on-chain fallback already hands it one inline — decodes it locally instead. A `fetch()` on a `data:` URI is CSP-blocked unless `connect-src` explicitly allows it, which would've broken every fighter selection the moment the OnChainHoodies API went down (the exact scenario that fallback exists for).

**Gameplay/AI/input:**
- Blocked melee hits (both `checkHit` and `checkAirPunchHit` in `src/game.js`) now set a distinct `-blocked` `lastEvent` instead of reusing the landed-hit value — no more impact + block sound firing together.
- AI's `HOLD_BACK_POSES` (`src/ai.js`) now includes the air-finisher pose, closing the last gap vs. its own "every airborne pose" comment.
- AI's stale `power >= 20` gate on Medium attacks removed (Medium's real cost is 0).
- AI's dodge-odds comment corrected to note it's a per-think-tick roll, not a flat probability.
- AI's potshot logic (the `dist > ENGAGE_RANGE` branch) converted to the same shared-roll-ladder convention used elsewhere, **and** a genuine probability bug in that conversion (slide firing ~40% instead of ~15% whenever AI power was in `[30, 50)` — a reviewer caught it numerically) was fixed by bounding slide's roll window on both sides instead of just the top.
- Gamepad Start/Select are now reserved (`RESERVED_BUTTONS`) and rejected by the remap-capture flow — can no longer bind an action onto Select and get reloaded mid-match.
- `SPECIAL_ALT_BUTTON` (hardcoded RT-as-special) replaced with a real `specialAlt` remappable binding, integrated into the actual remap system instead of bypassing it.
- Escape now closes the controls panel and the gamepad remap panel (cancels an in-progress rebind capture instead, if one's active).
- Race condition in `src/main.js`'s fighter-select flow: fast card-switching could leave `selectedData` (and now the `verified` flag that feeds match reporting) pointing at a token that isn't the one actually highlighted. Added the same `selectedId !== tokenId` guard already used for the stats fetch just above it.

**Cleanup:**
- Security headers added (`vercel.json`): CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- README and in-game controls tips rewritten to describe the current Light/Medium/Heavy/Special system with real power costs (no more "high kick"/"sweep kick"/"kick costs power").
- Dead sprite states (`punch2`/`kick2`/`kick3`/`airPunch2`) and the orphaned `highKick` sheet preload removed from `src/body.js`.
- Dead CSS selectors removed (`#character-grid`, `.select-title`, `#free-play-btn`, `#setup-status`). `.grid-loading`/`.grid-loading p` deliberately left — still created dynamically via `grid.innerHTML`.
- `src/wallet.js`'s `onAccountsChanged` wired up — wallet chip now updates on account switch, hides on disconnect, never interrupts a match in progress or retroactively changes an in-flight fighter's `verified` flag.

**Not yet done:** none of the above is committed yet — still sitting uncommitted in the working tree on `fix/8-bug-fixes-batch`, next step is to split into logical commits (Pixelpushin identity) and open a PR.

## Already fixed in the prior session pass (for reference)

XSS in character-card rendering, AI juggle-awareness (burst-escape + aerial pursuit + occasional offensive launcher), deploy concurrency guard, jump height vs. juggle peak, free punch/kick with block-cost-on-guard, A=jump gamepad mapping, DBFZ-style Light/Medium/Heavy attack ladder, block-on-back.
