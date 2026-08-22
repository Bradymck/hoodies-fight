// Web Gamepad API support, polled once per frame from game.js's main loop -
// the API has no event-based "button held" notion, only a connect/
// disconnect event plus per-frame Gamepad snapshots via
// navigator.getGamepads(). Uses the W3C Standard Gamepad mapping
// (https://w3c.github.io/gamepad/#remapping) that every major controller
// (Xbox, PlayStation, most third-party USB pads) reports as once the
// browser recognizes it - no per-controller-brand special-casing needed.
//
// Purely additive to keyboard input (see withGamepad in game.js) - a
// controller plugged in mid-match just starts working alongside the
// keyboard immediately, nothing to configure or switch into.
//
// Does NOT assume a single connected pad lands at browser index 0 - verified
// live that a lone controller can show up at index 1 (likely a leftover
// phantom/virtual entry at index 0 from the OS or another app), which with a
// naive "index 0 = p1" mapping meant the pad was live and correctly read,
// just never assigned to either fighter. findGamepad() scans for whichever
// index actually has a pad instead of assuming one.

const STICK_DEADZONE = 0.35;
// A trigger (buttons[6]/[7] on most pads) reports 0-1 as an analog value,
// not a boolean - treat "mostly pressed" as pressed so a worn/imprecise
// trigger doesn't need to be floored all the way to register.
const TRIGGER_THRESHOLD = 0.5;

// Only the discrete button-triggered actions are remappable (see
// getGamepadMap/setGamepadAction below) - movement (left/right/crouch) stays
// tied to the left stick + D-pad, same as keyboard's WASD-style movement
// keys are never offered for rebinding either. Jump used to double as
// stick-up, which read as accidental jumps whenever a player was just
// tilting the stick to move/crouch - it's its own dedicated button now,
// same as every other action.
// dash split into dashForward/dashBack (stage 4, requirement 11) - two
// discrete buttons now instead of one action plus a held-direction read.
// "block" is GONE (no dedicated button anymore - see fighter.js's
// isHoldingBack/the block/blockLow branch of update(): holding the direction
// AWAY from the opponent, read off the existing left/right stick+D-pad axes
// already wired up below, is the guard trigger now). light/medium/heavy
// (the generic Light/Medium/Heavy attack ladder replacing the old punch/kick
// chains) take its place in this list instead.
export const REMAPPABLE_ACTIONS = ["jump", "uppercut", "light", "medium", "heavy", "slide", "special", "specialAlt", "dashForward", "dashBack"];

// Bumpers relocated to make room for the two dash buttons (stage 4): the
// only genuinely free index left on a standard pad is 11 (R Stick Click - 16
// "Home" is unreliable across browsers, see BUTTON_NAMES below), so slide
// moves there and special takes over L Stick Click (freed now that dash no
// longer lives there), leaving LB/RB free for dashBack/dashForward - bumpers
// are the natural physical slot for a two-way dash the same way they were
// for the old single dash. specialAlt (RT, below) still works as a
// second special trigger regardless, and is now the more ergonomic one to
// actually hold for the ground finisher's arm-window chord (see JUGGLE_
// FINISHER in fighter.js) - a stick click is awkward to hold through a
// follow-up Light/Medium press, a trigger isn't.
// jump/uppercut swapped from the previous A=uppercut/LT=jump layout - a
// fighting-game player's own instinct is A=jump (matches nearly every other
// genre too), and LT is an awkward, easy-to-miss reach for something thrown
// as often as jump is. Uppercut moves to LT instead - it's a deliberate,
// occasional input (the launcher), not a rapid-fire one, so a trigger reach
// fits it better than it ever fit jump. A(jump) deliberately untouched by
// this rework, per direct instruction.
// heavy takes over B/Circle (button 1), freed now that block no longer binds
// to a button at all - X/Y/B (light/medium/heavy) reads as a natural face-
// button trio for the three generic attacks, the same physical cluster
// punch/kick already lived on (X/Y), with heavy landing right next to them
// instead of on some unrelated, harder-to-reach index.
const DEFAULT_GAMEPAD_MAP = {
  jump: 0, // A / Cross
  uppercut: 6, // LT
  heavy: 1, // B / Circle (freed from block)
  light: 2, // X / Square
  medium: 3, // Y / Triangle
  slide: 11, // R Stick Click
  special: 10, // L Stick Click
  // RT - a real remappable entry now (was a hardcoded SPECIAL_ALT_BUTTON
  // constant OR'd straight into buildGamepadInput's special check below,
  // bypassing remaps entirely - a player who rebound another action onto RT
  // got both that action AND special firing together). Seeded to button 7
  // so existing muscle memory - RT as a convenience second special trigger,
  // naturally paired with RB - still works out of the box, but now goes
  // through the same map/remap/isPressed path as every other action, and
  // shows up in the remap UI like one.
  specialAlt: 7, // RT
  dashBack: 4, // LB / L1
  dashForward: 5, // RB / R1
};

const STORAGE_KEY = "pfpbrawl-gamepad-map";

// Select/Start are wired to fixed system-level actions in gamepad-nav.js
// (Select = exit-match/reload during live combat, Start = toggle the
// controls panel) - completely outside REMAPPABLE_ACTIONS, so nothing in
// this file's own remap flow ever offers them, but nothing enforced that
// externally either: setGamepadAction/waitForButtonPress had zero exclusion
// of their own, so a player free-binding an action (in whatever future UI,
// or a saved map hand-edited in localStorage) onto button 8 or 9 would get
// silently thrown into live combat or have the panel pop open mid-match the
// next time they pressed it. Exported as the single source of truth -
// gamepad-nav.js imports SELECT_BUTTON/START_BUTTON from here instead of
// keeping its own separate copies of the same two indexes.
export const SELECT_BUTTON = 8;
export const START_BUTTON = 9;
export const RESERVED_BUTTONS = new Set([SELECT_BUTTON, START_BUTTON]);

// W3C Standard Gamepad button-index names, for the controls-panel display
// and the remap UI's "press a button" prompt - covers every index a real
// standard-mapped pad reports (face buttons, bumpers/triggers, stick
// clicks, D-pad, start/select). Anything outside this list (a pad with more
// buttons than the standard 17) just shows its raw index instead of a name.
const BUTTON_NAMES = [
  "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Select", "Start",
  "L Stick Click", "R Stick Click", "D-Up", "D-Down", "D-Left", "D-Right", "Home",
];

export function buttonName(index) {
  return BUTTON_NAMES[index] ?? `Button ${index}`;
}

function loadGamepadMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    // Stale-map migration (stage 4 dash remap) - a saved single "dash" bind
    // from before dashForward/dashBack existed at all predates this rework
    // entirely; carry it over as the forward bind (the old dash's own
    // default meaning - a bare press burns toward the opponent) rather than
    // silently dropping a player's own prior rebind. A no-op for anyone who
    // never touched dash's own binding in the first place, since
    // DEFAULT_GAMEPAD_MAP's own dashForward already covers them without this.
    if (saved.dash !== undefined && saved.dashForward === undefined) {
      saved.dashForward = saved.dash;
    }
    delete saved.dash;
    // Same idea, for the Light/Medium/Heavy rework - a saved punch/kick
    // rebind from before this rework predates light/medium entirely; carry
    // it over onto light/medium (their direct 1:1 replacements) rather than
    // silently dropping a player's own prior rebind. block has no
    // replacement to carry forward to at all (see REMAPPABLE_ACTIONS above -
    // block isn't a button anymore), so it's just dropped. A no-op for
    // anyone who never touched punch/kick/block's own bindings, since
    // DEFAULT_GAMEPAD_MAP's own light/medium/heavy already cover them.
    if (saved.punch !== undefined && saved.light === undefined) {
      saved.light = saved.punch;
    }
    if (saved.kick !== undefined && saved.medium === undefined) {
      saved.medium = saved.kick;
    }
    delete saved.punch;
    delete saved.kick;
    delete saved.block;
    return { ...DEFAULT_GAMEPAD_MAP, ...saved };
  } catch {
    return { ...DEFAULT_GAMEPAD_MAP };
  }
}

let gamepadMap = loadGamepadMap();

export function getGamepadMap() {
  return gamepadMap;
}

export function setGamepadAction(action, buttonIndex) {
  // Defense-in-depth alongside waitForButtonPress's own reserved-button
  // skip below - that's what actually stops a live remap capture from ever
  // producing a reserved index in normal play, but this guard means this
  // function can never bind Select/Start onto a gameplay action no matter
  // what calls it with, now or later.
  if (RESERVED_BUTTONS.has(buttonIndex)) {
    console.warn(`[gamepad] refused to bind "${action}" to reserved button ${buttonIndex} (Select/Start)`);
    return;
  }
  gamepadMap = { ...gamepadMap, [action]: buttonIndex };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gamepadMap));
}

export function resetGamepadMap() {
  gamepadMap = { ...DEFAULT_GAMEPAD_MAP };
  localStorage.removeItem(STORAGE_KEY);
}

// Exported (not just used internally) so gamepad-nav.js's menu/UI
// navigation can read raw button state the same way buildGamepadInput does,
// instead of re-implementing the same trigger-analog-value handling twice.
export function isPressed(gp, index) {
  const b = gp.buttons[index];
  if (!b) return false;
  return typeof b === "object" ? b.pressed || b.value > TRIGGER_THRESHOLD : b > TRIGGER_THRESHOLD;
}

function emptyInput() {
  return {
    left: false, right: false, crouch: false, jump: false,
    uppercut: false, slide: false, light: false, medium: false, heavy: false, special: false,
    dashForward: false, dashBack: false,
  };
}

// Logged once per gamepad (not every frame) so opening devtools console
// immediately shows whether the browser detected the device at all, and
// whether it got recognized as "standard" mapping - the W3C button-index
// layout this file assumes only holds for pads Chrome/Firefox actually
// map that way. A non-standard pad (older/unusual hardware, some
// Bluetooth pads, some OS/driver combos) still shows up in
// navigator.getGamepads() but its button indices can mean anything,
// which reads to a player as "nothing happens" even though the pad is
// technically detected.
const loggedIndices = new Set();
function logGamepadOnce(gp) {
  if (loggedIndices.has(gp.index)) return;
  loggedIndices.add(gp.index);
  console.log(`[gamepad] detected index ${gp.index}: "${gp.id}", mapping="${gp.mapping || "(none)"}"`);
  if (gp.mapping !== "standard") {
    console.warn(
      `[gamepad] "${gp.id}" did not report standard mapping - button positions (A/B/X/Y/etc) ` +
        "may not match what this game assumes. Try a different USB port/cable, or a different pad " +
        "if this one is older/unusual hardware.",
    );
  }
}

// Returns whichever connected Gamepad object comes first in browser index
// order, skipping excludeIndex (already claimed by the other player, in a
// real 2-controller local match). Not gating on gp.connected - it's
// supposed to flip false on disconnect, but some browser/OS/driver combos
// leave it undefined rather than true even while the pad is live and
// reporting real button data. A missing entry (nothing at that index at
// all) is the only case that actually means "no pad here."
export function findGamepad(excludeIndex = -1) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (gp && i !== excludeIndex) {
      logGamepadOnce(gp);
      return gp;
    }
  }
  return null;
}

// Movement/crouch stay on the left stick + D-pad (not remappable, see
// REMAPPABLE_ACTIONS above); every other action reads from the current
// gamepadMap so a player's rebinds apply immediately without needing a
// page reload.
export function buildGamepadInput(gp) {
  const input = emptyInput();
  const map = gamepadMap;
  const stickX = gp.axes[0] ?? 0;
  const stickY = gp.axes[1] ?? 0;

  input.left = stickX < -STICK_DEADZONE || isPressed(gp, 14);
  input.right = stickX > STICK_DEADZONE || isPressed(gp, 15);
  input.crouch = stickY > STICK_DEADZONE || isPressed(gp, 13);
  input.jump = isPressed(gp, map.jump);
  input.uppercut = isPressed(gp, map.uppercut);
  input.light = isPressed(gp, map.light);
  input.medium = isPressed(gp, map.medium);
  input.heavy = isPressed(gp, map.heavy);
  input.slide = isPressed(gp, map.slide);
  input.special = isPressed(gp, map.special) || isPressed(gp, map.specialAlt);
  input.dashForward = isPressed(gp, map.dashForward);
  input.dashBack = isPressed(gp, map.dashBack);

  return input;
}

// The Gamepad API fires this the moment the browser recognizes a pad -
// independent of navigator.getGamepads() ever returning anything, and
// independent of the "press a button once to activate" quirk some browsers
// have. Wiring this up unconditionally (not just under the debug overlay)
// means opening devtools console alone answers "did the browser see this
// at all" without needing to add a URL param first.
window.addEventListener("gamepadconnected", (e) => logGamepadOnce(e.gamepad));
window.addEventListener("gamepaddisconnected", (e) => {
  loggedIndices.delete(e.gamepad.index);
  console.log(`[gamepad] disconnected index ${e.gamepad.index}: "${e.gamepad.id}"`);
});

// Opt-in live readout (add ?gamepaddebug to the URL) showing what's
// actually driving each fighter right now - using the same findGamepad()
// scan the real game loop uses, not a raw index 0/1 dump, so this can't
// show "nothing at index 0" while a pad that IS driving p1 sits at some
// other index. Updated every frame - the fastest way to tell "browser sees
// nothing at all" apart from "sees it, but button 2 doesn't mean punch on
// this pad" apart from "it's working, the player just hasn't pressed
// anything yet." Not shown by default so it doesn't clutter the game.
export function initGamepadDebugOverlay() {
  if (!new URLSearchParams(location.search).has("gamepaddebug")) return;
  const el = document.createElement("pre");
  el.style.cssText =
    "position:fixed;bottom:8px;left:8px;z-index:9999;background:#000c;color:#0f0;" +
    "font:11px monospace;padding:8px;max-width:90vw;white-space:pre-wrap;pointer-events:none;";
  document.body.appendChild(el);

  function describe(gp) {
    if (!gp) return "(none)";
    const pressed = gp.buttons.map((b, i) => (isPressed(gp, i) ? i : null)).filter((i) => i !== null);
    const axes = gp.axes.map((a) => a.toFixed(2)).join(", ");
    return `index ${gp.index}: "${gp.id}"\n  mapping: ${gp.mapping || "(none)"}\n  buttons pressed: [${pressed.join(", ")}]\n  axes: [${axes}]`;
  }

  function tick() {
    const p1Gamepad = findGamepad();
    const p2Gamepad = findGamepad(p1Gamepad ? p1Gamepad.index : -1);
    el.textContent = `GAMEPAD DEBUG\np1: ${describe(p1Gamepad)}\np2: ${describe(p2Gamepad)}`;
    requestAnimationFrame(tick);
  }
  tick();
}

// Used by the remap UI (src/gamepad-nav.js) - resolves to a Promise for the
// index of the next button pressed on any connected pad, or null if the
// player waits out the timeout without pressing anything (so a remap
// prompt can't get stuck open forever). Polls via requestAnimationFrame
// rather than a gamepadconnected-style event, since there's no
// "buttondown" event in this API at all - per-frame snapshots are the only
// way to detect a press.
//
// A press of a RESERVED_BUTTONS index (Select/Start) never resolves the
// capture - those two are permanently wired to system-level actions
// (exit-match, controls-panel toggle - see gamepad-nav.js), so binding a
// gameplay action onto either would mean pressing it later either fires
// that action AND reloads the match / pops the panel open, or the remap
// silently swallows the system action's own button. The prompt just keeps
// waiting instead, same as if nothing had been pressed at all; the optional
// onReservedPress callback lets the caller (the remap UI) show a brief
// "reserved" state so the press doesn't look ignored.

// Set while a waitForButtonPress() promise is in flight, cleared once it
// settles - lets cancelButtonWait() (below) resolve whichever capture is
// currently pending from outside this module, e.g. gamepad-nav.js's Escape
// handler backing out of an in-progress rebind without needing its own
// separate press-driven cancel path.
let pendingCancel = null;

export function waitForButtonPress(timeoutMs = 8000, { onReservedPress } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    function settle(value) {
      if (settled) return;
      settled = true;
      pendingCancel = null;
      resolve(value);
    }
    pendingCancel = () => settle(null);

    const startedAt = performance.now();
    // Buttons already held down when the prompt opens shouldn't immediately
    // resolve it - a player holding a bumper while navigating into the
    // remap screen would otherwise instantly "press" whatever they were
    // already holding. Require a release-then-press instead.
    const alreadyHeld = new Set();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      gp.buttons.forEach((_, i) => {
        if (isPressed(gp, i)) alreadyHeld.add(`${gp.index}:${i}`);
      });
    }

    function tick() {
      if (settled) return;
      if (performance.now() - startedAt > timeoutMs) {
        settle(null);
        return;
      }
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of pads) {
        if (!gp) continue;
        for (let i = 0; i < gp.buttons.length; i++) {
          const key = `${gp.index}:${i}`;
          if (isPressed(gp, i)) {
            if (!alreadyHeld.has(key)) {
              if (RESERVED_BUTTONS.has(i)) {
                // Mark held so this doesn't fire onReservedPress every
                // single frame the player keeps it pressed - only once per
                // press, same release-then-press bookkeeping every other
                // button already gets below.
                alreadyHeld.add(key);
                onReservedPress?.(i);
                continue;
              }
              settle(i);
              return;
            }
          } else {
            alreadyHeld.delete(key);
          }
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// Backs an in-progress waitForButtonPress() out early with a null result -
// same outcome as the timeout branch above, just triggered by a keyboard
// Escape (see gamepad-nav.js's rebindInProgress guard) instead of the clock.
// A no-op if nothing is currently waiting.
export function cancelButtonWait() {
  pendingCancel?.();
}
