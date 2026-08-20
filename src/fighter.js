export const MOVE_SPEED = 3;
// Bumped from 100 (stage 5, requirement 13) - the direct lever for making
// matches run ~30% longer without touching every single move's own damage
// number individually. Health bars (game.js's updateHud) already render as a
// ratio against this.maxHealth (itself MAX_HEALTH * archetype scaling, see
// the constructor below), never a hardcoded 100, so this one change alone
// stretches every fight out proportionally.
export const MAX_HEALTH = 130;
export const MAX_POWER = 100;

// Canvas is 800 wide. `x` is a fighter's LEFT edge (see BODY_CENTER_OFFSET
// in game.js), and the widest a drawn sprite ever gets on screen is ~125px
// (86px raw frameSize * 1.4 CHARACTER_SCALE, the biggest of any sheet - even
// specialLow/death's own extra scale multipliers land under that on their
// own smaller sheets). ARENA_MAX_X used to be 750, which let the right edge
// of the sprite land at x+125=875 - 75px past the canvas's own 800px edge,
// clipping the fighter half off-screen. 50px margin on the left (unchanged)
// mirrored on the right: 800 - 50 - 125 = 625. Symmetric, and the sprite
// can never render outside the visible canvas on either side. Exported
// (previously a local, unexported pair of duplicated-by-value constants in
// both game.js AND here) so there's exactly one source of truth for it -
// applyMove/knockback below and game.js's own collision/slide/uppercut
// clamps all reference the same two numbers now instead of three separate
// hardcoded copies that could (and did) drift out of sync.
export const ARENA_MIN_X = 50;
export const ARENA_MAX_X = 625;

// Ranges need to clear MIN_FIGHTER_GAP (game.js) - the closest the solid-body
// collision will ever let two fighters stand - or the attack could never
// connect at point-blank range. Sprite bodies render ~60px wide at full
// scale, so the enforced gap is ~68px; these all clear it with margin.
//
// Generic Light/Medium/Heavy ladder (DBFZ-style) replacing the old same-
// button punch/kick chains - three fixed, directly-selectable moves, one per
// button, instead of a repeated-press cycle on two buttons. Each button is
// ONE move/kind, not "this family's light version vs that family's light
// version" (that was a since-discarded MvC-style design) - a player thinks
// "Light/Medium/Heavy", never "which attack type". The existing high/mid/low
// guard rule (see takeDamage's blockedByStanding/blockedByLowGuard below)
// still keys entirely off `kind`, so which of these three is punch-family vs
// kick-family is what actually decides what blocks it, not the button label.
// Light and Heavy are both kind "punch" (mid - either guard stops them);
// Medium is kind "kick" (high - only a standing guard stops it, crouching
// dodges it clean, same as ever). No move here gets a variant of the other
// family - that's the entire point of the generic ladder.
//
// Light reuses the old PUNCH_CHAIN[0]/"punch1" (jab) pose/timing/damage
// verbatim, just entered directly off its own button now instead of chain
// index 0 - same reasoning, still this engine's one truly free, fastest poke
// (cost: 0).
export const LIGHT_ATTACK = { state: "punch1", duration: 18, activeStart: 5, activeEnd: 11, damage: 4, range: 90, cost: 0 };
// Medium reuses the old KICK_CHAIN[0]/"kick" pose/timing/damage verbatim -
// kick-family, so it's the one of the three that's a HIGH threat standing
// (only a standing guard stops it) and dodged clean by a crouching hurtbox
// (checkHit's own box.kind==="kick" exclusion, game.js) rather than blocked
// low - pressing this while already crouching still goes to the separate,
// pre-existing CROUCH_MEDIUM move below instead (unchanged from before this
// rework), not this standing spec.
export const MEDIUM_ATTACK = { state: "kick", duration: 34, activeStart: 10, activeEnd: 22, damage: 8, range: 84, cost: 0 };
// Heavy reuses the old PUNCH_CHAIN[2]/"punch3" (elbow, the old chain's ender)
// pose/timing/damage verbatim - a slower, harder punch-family hit, now a
// move a player can throw straight from neutral on its own button instead of
// only reaching it by first landing two prior chain hits.
export const HEAVY_ATTACK = { state: "punch3", duration: 24, activeStart: 7, activeEnd: 16, damage: 7, range: 88, cost: 0 };
// Aerial counterparts of the grounded Light/Heavy (see LIGHT_ATTACK/
// HEAVY_ATTACK's own comment above for the shape this follows) - one fixed,
// directly-selectable move per button, thrown mid-jump (see the combined
// jump/air-attack branch of update() below), replacing the old same-button
// airPunch1->airPunch2->airPunch3 cycle the exact same way the grounded
// rework replaced PUNCH_CHAIN. airPunch2 (the old cycle's middle hit) is
// gone as an AERIAL pose - its own sheet (punchCross) is reused by the new
// CROUCH_HEAVY below instead, same "an old chain-middle-hit's sheet gets
// repurposed once nothing enters that hit anymore" precedent PUNCH_POSES'
// own comment already sets for grounded punch2. Costs zeroed (were 8/8) -
// same reasoning MEDIUM_ATTACK's comment gives for the grounded kick: an
// ordinary poke, grounded or airborne, shouldn't drain the meter just to
// throw it, only getting BLOCKED should cost the attacker anything (see
// checkAirPunchHit in game.js).
//
// AIR_LIGHT reuses the old chain-opener's (airPunch1) own pose/timing/damage
// verbatim - still this engine's fastest, lowest-committal aerial swing.
export const AIR_LIGHT = { state: "airPunch1", duration: 16, activeStart: 4, activeEnd: 11, damage: 5, range: 85, cost: 0 };
// AIR_HEAVY reuses the old chain's own THIRD hit (airPunch3) verbatim - used
// to be reachable only after landing two prior chain hits, now a real button
// of its own straight from a fresh jump, same "the old chain-ender becomes a
// directly-selectable move" step HEAVY_ATTACK already took on the ground.
export const AIR_HEAVY = { state: "airPunch3", duration: 16, activeStart: 4, activeEnd: 11, damage: 6, range: 88, cost: 0 };
// The old chain's own dedicated overhead-slam finisher - deliberately NOT
// folded into the Light/Medium/Heavy ladder (there's no separate "aerial
// finisher button"; per spec this stays its own move, untouched in every way
// except HOW it's reached). Same pose/timing/damage/cost as before, still
// the one hit in this whole file that forcibly ends an existing juggle into
// a hard knockdown instead of continuing it (see checkAirPunchHit in
// game.js, which calls applyJuggleSpike on a landed AIR_FINISHER against an
// already-juggled defender - requirement 2's "slam ends the juggle").
// Its old gate (only reachable once the chain had already thrown 3 prior
// hits this same airtime, via airPunchChainIndex) is gone along with the
// chain itself, since there's no longer a chain to build up in the first
// place - reachable directly now via holding crouch (down) + Light while
// airborne (see the airborne branch of update() below), the exact same
// "modifier + button" input shape CROUCH_LIGHT/CROUCH_MEDIUM/CROUCH_HEAVY
// below already use on the ground for their own dedicated moves, rather than
// a press-count that would have to be tracked and reset per jump.
export const AIR_FINISHER = { state: "punchDown", duration: 20, activeStart: 6, activeEnd: 13, damage: 10, range: 90, cost: 15 };
// Light and Heavy's crouching counterparts (CROUCH_LIGHT/CROUCH_HEAVY,
// replacing the old singular CROUCH_PUNCH) - both punch-family, so both
// report kind "punch" from attackHitbox() below exactly like their standing
// counterparts do: crouching changes nothing about what guard stops them,
// only the pose thrown (see the high/mid/low guard rule in takeDamage far
// below, and LIGHT_ATTACK/HEAVY_ATTACK's own comment above for why "mid" is
// the whole point of the punch family). CROUCH_LIGHT reuses the old
// CROUCH_PUNCH's own pose/timing/damage verbatim (state stays "crouchPunch",
// still the punchDown sheet - see body.js's ANIMS.crouchPunch) - a fast,
// free low poke, same role LIGHT_ATTACK plays standing.
export const CROUCH_LIGHT = { state: "crouchPunch", duration: 20, activeStart: 6, activeEnd: 13, damage: 7, range: 80, cost: 0 };
// CROUCH_HEAVY is genuinely new - the old crouch system only ever had two
// entries (a punch and a kick), never a third. Own dedicated state
// ("crouchPunchHeavy") and own reused sheet (punchCross, body.js's
// SHEETS/ANIMS - currently orphaned as a GROUNDED pose since punch2, the
// old chain-middle-hit it used to belong to, is no longer reachable, same
// "punch2" PUNCH_POSES' own comment already documents) rather than
// piggybacking on CROUCH_LIGHT's own punchDown sheet a second time - two
// differently-weighted crouching punches sharing one literal pose would
// read as the exact same move twice. Slower and harder-hitting than
// CROUCH_LIGHT - own literal numbers (not derived off HEAVY_ATTACK's), same
// "these are independently tuned, not a formula off the standing move"
// precedent CROUCH_PUNCH/CROUCH_KICK's own comments already set - but still
// following the same "Heavy costs more time, pays more damage" shape
// HEAVY_ATTACK itself follows standing.
export const CROUCH_HEAVY = { state: "crouchPunchHeavy", duration: 24, activeStart: 8, activeEnd: 15, damage: 9, range: 84, cost: 0 };
// Free, always-available low kick - fold of the old "specialLow" idea (a
// dedicated Hodler-only ground sweep) into a real universal crouch normal,
// same move as requirement 3's own "crouch+kick, no gate" framing. Reuses
// the specialLow sheet/timing wholesale (see body.js's ANIMS.crouchKick) -
// duration/active window lifted directly from the old HODLER_SPECIAL
// numbers (still defined below, until stage 3 deletes it) but damage cut
// from 26 (a resource-gated special) down to 8 (a free normal) - own literal
// numbers here, NOT a reference to HODLER_SPECIAL, since that constant goes
// away entirely once stage 3 lands. Kind stays its own "crouchKick" (never
// folds into plain "kick" - see attackHitbox below) since this is the one
// genuinely LOW attack in the whole roster (see takeDamage's own
// blockedByLowGuard) - unchanged from when this constant was still named
// CROUCH_KICK.
export const CROUCH_MEDIUM = { state: "crouchKick", duration: 28, activeStart: 20, activeEnd: 27, damage: 8, range: 92, cost: 0 };
// Ranged, not a melee hitbox - the cast animation plays out over `release`
// frames, then game.js reads "special-release" off lastEvent and spawns a
// projectile of its own that travels and hits independently. `duration`
// leaves a few recovery frames after release for the throw's follow-through
// before control returns. damage bumped well past kick's (10) - at the old
// value (25, only ~2.5x kick before archetype multipliers) it didn't feel
// meaningfully different from a kick landing, despite costing 50 power and
// a full cast animation to throw.
//
// knockback (stage 3, requirement 7) - a landed, UNBLOCKED grounded special
// now shoves the defender back a real distance instead of just chipping
// health in place (see takeDamage's own kind==="special" branch below,
// which routes into the same "knockback" state/setKnockbackMotion pipeline
// SLIDE already uses) - the single biggest ranged hit in any kit should
// also be the one that visibly repositions its target, not just the
// hardest-hitting jab. Exported (unlike every other bare constant in this
// section) since game.js's updateProjectiles needs the number directly to
// actually call setKnockbackMotion on a landed hit.
// damage trimmed 32 -> 22 (stage 5, requirement 13) - on the new 130-point
// bar this still lands as the single biggest RANGED hit in any kit (~17% of
// a bar) without also being the single biggest hit of ANY kind now that it
// carries real knockback on top (requirement 7) - a pure damage number that
// big alongside a real shove would have made it strictly better than
// committing to the ground finisher for no added risk.
export const SPECIAL = { duration: 42, release: 30, damage: 22, cost: 50, knockback: 110 };
// Flat fallback only - real hitstun is scaled per-hit by computeHitstunFrames
// below (see takeDamage). Kept around as the "hitstun" state's default in
// the one case nothing set fighter.hitstunFrames yet.
const HITSTUN_FRAMES = 24;

// --- Hitstop + scaled hitstun -----------------------------------------
// Standard fighting-game "impact frame" technique (Street Fighter, Guilty
// Gear): the instant a hit lands, BOTH fighters (and the round timer) freeze
// for a handful of frames before knockback/hitstun actually starts playing
// out. Sells a hit as a real impact instead of a silent health-bar tick.
// Actual freeze/pause orchestration lives in game.js (it's the one thing
// that touches both fighters + the clock at once) - these two are just the
// pure damage->frames formulas, shared by every call site that lands a hit
// (checkHit/updateSlide/checkUppercutHit/updateProjectiles in game.js) so
// hitstop and hitstun scale off the exact same "how big was this hit"
// reading and never drift apart from each other.
//
// Tunable constants for whoever builds combos on top of this: raise
// HITSTOP_PER_DAMAGE/HITSTUN_PER_DAMAGE to make big hits feel even heavier,
// or lower the *_MAX caps if a combo system needs shorter windows to chain
// moves. Damage in is always the already-archetype-scaled number (box.damage,
// attacker.slideDamage, etc), never the raw base constant.
const HITSTOP_BASE_FRAMES = 2;
const HITSTOP_PER_DAMAGE = 0.25;
// Caps how long the freeze can ever get (a special/builder-special at max
// archetype scaling would otherwise push past this) - keeps even the
// biggest hit's freeze readable as "impactful pause", not "the game hung".
const HITSTOP_MAX_FRAMES = 16;
export function computeHitstopFrames(damage) {
  return Math.min(HITSTOP_MAX_FRAMES, Math.round(HITSTOP_BASE_FRAMES + damage * HITSTOP_PER_DAMAGE));
}

// Same shape as hitstop, longer range - this is the actual "how long is the
// defender locked in the hurt state" window (see the "hitstun" branch of
// update()'s durations map below), not just a cosmetic freeze. Always
// finite and always counts down every real (non-hitstop) tick regardless of
// input - there's no path that can leave a fighter parked in "hitstun"
// forever, so this can't soft-lock a match no matter how it's tuned.
const HITSTUN_BASE_FRAMES = 14;
const HITSTUN_PER_DAMAGE = 0.6;
const HITSTUN_MAX_FRAMES = 42;
export function computeHitstunFrames(damage) {
  return Math.min(HITSTUN_MAX_FRAMES, Math.round(HITSTUN_BASE_FRAMES + damage * HITSTUN_PER_DAMAGE));
}
// --- Combo scaling --------------------------------------------------------
// Standard fighting-game damage scaling: a hit that lands while the defender
// is still locked in hitstun/knockback from the PREVIOUS hit (no gap - see
// takeDamage's wasChaining check) counts as a continuation of the same
// combo and does progressively less. Without this, hitstop+hitstun+input
// buffering above already make chaining moves together easy - so easy that
// an unscaled combo would turn "landed one jab" into "free full-combo kill".
// Feeding the SCALED amount back into computeHitstunFrames (not the raw
// one) is deliberate, not just damage bookkeeping: it makes hitstun shrink
// alongside damage on later combo hits, which self-limits how long a string
// can realistically stay chained (the defender's stun window gets tighter
// than the attacker's own recovery+startup can reliably beat) instead of
// needing a hard hit-count cap to prevent infinite strings.
const COMBO_DAMAGE_DECAY = 0.82;
// Never scales below this fraction of a hit's real damage, no matter how
// long the combo runs - a combo should still meaningfully punish, just not
// linearly stack into a one-touch kill.
const COMBO_DAMAGE_FLOOR = 0.25;
// hitIndex is 1-based (1 = the combo's opening hit, unscaled).
export function computeComboDamageScale(hitIndex) {
  return Math.max(COMBO_DAMAGE_FLOOR, Math.pow(COMBO_DAMAGE_DECAY, hitIndex - 1));
}

// Ender-only scaling floor (stage 5, requirement 13) - without this, the raw
// 0.82^n decay above kills the whole POINT of committing to punchDown/the
// ground finisher as a combo's payoff: a realistic jab -> uppercut -> 3-hit
// air chain -> grab -> finisher string lands the finisher around hit #7-8,
// where computeComboDamageScale alone would already be down near ~0.37x -
// the "biggest hit in the game" (JUGGLE_FINISHER.damage 22) would land
// SMALLER than an unscaled uppercut (10), not the payoff it's supposed to
// be. Only these two ender kinds get the floor - every other hit in a string
// (including the plain punchDown/finisher-less combo enders like uppercut/
// slide/special) keeps the honest, uncapped decay, which is what already
// prevents runaway strings elsewhere.
const ENDER_SCALE_FLOOR = 0.6;
const ENDER_SCALE_FLOOR_KINDS = new Set(["finisher", "punchDown"]);
function computeDamageScale(hitIndex, kind) {
  const scale = computeComboDamageScale(hitIndex);
  return ENDER_SCALE_FLOOR_KINDS.has(kind) ? Math.max(scale, ENDER_SCALE_FLOOR) : scale;
}

// --- Combo freeze-hold + enders -------------------------------------------
// Damage-based hitstop above already makes a single big hit feel heavy, but
// it's flat per-hit - it doesn't know or care that this is hit #4 of an
// unbroken string. Real fighting games hold the freeze noticeably longer the
// deeper a combo goes, on top of whatever the hit itself already earned, so
// landing hit #4 reads as heavier to land than hit #1 even at equal damage.
// This is a pure bonus ADDED to computeHitstopFrames' own result (see
// triggerHitstop in game.js) - never a replacement for it. comboCount === 1
// is just "a hit landed", not a combo yet (matches computeComboDamageScale's
// own 1-based "opening hit" framing above), so it earns no bonus at all.
const COMBO_FREEZE_PER_DEPTH = 1.5;
// Capped well under HITSTOP_MAX_FRAMES' own ceiling (16) so even an
// absurdly long string can't push the combined freeze into "the game hung"
// territory - see COMBO_HITSTOP_TOTAL_MAX_FRAMES in game.js for the combined
// backstop this and computeHitstopFrames' own cap add up to.
const COMBO_FREEZE_MAX_BONUS = 14;
export function computeComboFreezeBonus(comboCount) {
  if (comboCount < 2) return 0;
  return Math.min(COMBO_FREEZE_MAX_BONUS, Math.round((comboCount - 1) * COMBO_FREEZE_PER_DEPTH));
}

// What actually counts as a combo "ender" for the bigger freeze/shake
// escalation in game.js (see each checkHit/updateSlide/checkUppercutHit/
// checkAirAttackHit/checkAirPunchHit/applyHomingHit hit branch's own
// lastComboEnder-gated shake/flash/triggerHitstop calls). A hit is an ender
// if it's EITHER (a) the killing
// blow, full stop, regardless of how it landed, OR (b) it lands at real
// combo depth (>= COMBO_ENDER_MIN_DEPTH - a two-hit string is just "a
// combo", not yet a finisher-worthy one) AND it's one of this engine's few
// "hard-knockdown" class hits - uppercut/slide (both already give the
// defender a real knockback flight instead of just hitstun, or - now - a
// real airborne launch) or special (the single biggest, most
// resource-committed hit in any kit). A pure jab/kick string never
// qualifies on its own, no matter how deep it runs - real fighting games
// reserve the big freeze/flourish for actually landing the hardest part of
// the sequence, not just for mashing long enough, which is also what keeps
// a dropped/incomplete combo reading as visibly smaller than one carried to
// a real ender without needing any separate "was this dropped" tracking -
// an incomplete string simply never reaches this gate.
const COMBO_ENDER_MIN_DEPTH = 3;
// "punchDown" added alongside the pre-existing three - the airborne juggle
// finisher (see AIR_FINISHER above) is exactly this engine's kind of
// hard-hitting, resource-committed closer, and game.js explicitly slams it
// into hard knockdown via applyJuggleSpike on a juggled target (requirement
// 2) - it needs to read as an ender for the shake/flash escalation the same
// way uppercut/slide/special already do. "finisher" (stage 3, requirement 9)
// is the same story one level up - the ground finisher IS this engine's
// biggest committed closer, full stop.
const ENDER_KINDS = new Set(["uppercut", "slide", "special", "punchDown", "finisher"]);
export function isComboEnder(comboCount, kind, isKO) {
  if (isKO) return true;
  return comboCount >= COMBO_ENDER_MIN_DEPTH && ENDER_KINDS.has(kind);
}

// --- Punch/kick family classification --------------------------------------
// Light/Heavy (LIGHT_ATTACK/HEAVY_ATTACK above, states "punch1"/"punch3") are
// the two punch-family entries reachable from neutral now that the old 3-hit
// chain is gone - "punch2" is deliberately absent, it was only ever the
// chain's middle hit and nothing enters it anymore. PUNCH_POSES/KICK_POSES
// stay real exported lists (not bare per-state checks) because attackHitbox()
// below and checkHit's contact-height branch in game.js both need a single
// place to classify "is this state a punch-family attack" without caring
// which of the two buttons threw it.
export const PUNCH_POSES = ["punch1", "punch3"];
// Just MEDIUM_ATTACK's own state now - "kick2"/"kick3" were the old chain's
// 2nd/3rd hits, never reachable since Medium is a single direct-entry move,
// not a chain (see MEDIUM_ATTACK above). Kept as a real list (not a bare
// `this.state === "kick"` check) for the same future-proofing reason
// PUNCH_POSES is - every OTHER call site (checkHit's contact-height branch in
// game.js, the passive-regen pause below, ai.js's own opponentAttacking read)
// only needs "is this fighter in a kick-family pose", not which one.
export const KICK_POSES = ["kick"];

// Tall/long enough that the arc actually clears over the other fighter's
// full standing height (~109px at CHARACTER_SCALE) instead of just a hop in
// place - see resolveCollision in game.js, which now lets fighters pass
// through each other horizontally while either is airborne, so this is what
// makes "jump over them" a real, usable option instead of just a dodge.
const JUMP_DURATION = 48;
// Raised from 140 - measured against JUGGLE_LAUNCH_VELOCITY/JUGGLE_GRAVITY's
// own peak (15^2 / (2*0.55) =~ 204), a jump-follow chasing a freshly-launched
// opponent topped out ~57px below where they actually floated, so the two
// never visually "hung together" the way a real air combo should - the
// attacker looked like they were hopping while the defender soared. 195
// brings the jumper's own peak close to the juggle's, without exceeding it
// (so a juggled opponent still reads as genuinely higher/more vulnerable at
// the very top of a fresh launch).
const JUMP_HEIGHT = 195;
// Ground-closing move: moves forward on its own the whole time it's active
// (see updateSlide in game.js) rather than reading movement input. Exported
// (along with UPPERCUT below) since game.js's updateSlide/checkUppercutHit
// need the timing/range numbers directly - unlike damage, none of this
// varies by archetype, so plain constants rather than a getter.
// Deliberately short - this is a close-range "get under a jump" dodge/
// punish, not a full-screen gap closer. duration * SLIDE_SPEED (game.js)
// covers roughly one engage-range gap (~175px), not the ~700px arena the
// old version could cross - that was a mistake, it turned slide into a
// free win button from anywhere on screen instead of a real close-range
// mixup. Used to be free and hit for real damage (12) - that turned it into
// a spammable kill button since it also bypasses block (see takeDamage
// below) and paid back MORE power than it cost to use (nothing, since it
// was free). Now it costs a real chunk of power and does barely more than
// chip damage - the actual payoff is the dodge/reposition (get under a
// jump, close distance) and the brief stun on landing, not the damage.
export const SLIDE = { duration: 11, damage: 4, knockback: 90, cost: 30 };
// Pure repositioning burst - no hitbox, no damage, distinct from SLIDE
// (which IS an attack with its own cost/knockback/hit window). Direction is
// read once on activation (see the dash branch of update() below): held
// left/right at the moment of the press, defaulting to this.facing (a bare
// press with no direction burns forward, toward the opponent) so it works
// as both a quick approach and, held the opposite way, a retreat. Duration/
// distance sized to roughly match slide's own footprint (~175px over 11
// frames) so the two read as comparable-weight movement options rather than
// one trivially outclassing the other. Costs a small amount of power - free
// would make it a strictly-better replacement for ordinary walking (no
// downside, no reason not to spam it everywhere); a real cost keeps it a
// deliberate tool.
const DASH_DURATION = 10;
const DASH_DISTANCE = 100;
const DASH_COST = 12;
// How long the "hit by a slide" reaction pose holds before returning to
// idle - see takeDamage's kind==="slide" branch.
const KNOCKBACK_DURATION = 28;
// Arc height for the knockback flight - a real launch-and-land trajectory
// (see jumpOffset and setKnockbackMotion below) rather than the old instant
// teleport-then-freeze. Shorter than a real jump's arc (140) since this is a
// reaction, not a voluntary leap.
const KNOCKBACK_ARC_HEIGHT = 55;
// Anti-air counter: rises like a (shorter, faster) jump with an active
// hitbox partway through, specifically so it can catch an opponent mid-jump
// - see checkUppercutHit in game.js, which deliberately does NOT exclude a
// jumping defender the way every other melee hit does. range needs to clear
// MIN_FIGHTER_GAP (68, game.js) same as every melee range does - a range of
// 60 here missed every time (verified live: two grounded fighters can never
// stand closer than 68px apart in the first place, so a 60px range could
// never reach anyone even standing right next to you). Sheet swapped again
// to a clearer 3-frame version (from 4) - crouch, strike (a motion-blur
// streak on the swipe that actually reads as a hit), recovery - duration
// shortened to match (6 game-frames per sheet frame, same pacing the old
// 4-frame/24-duration sheet used), active window re-timed to the strike
// frame specifically (frame 1, verified against the art).
//
// cost/damage: this move was free (no `cost` at all) for a long time - a
// real balance bug, not a deliberate design choice, and the single most
// common complaint across every fork of this game. Free meant it strictly
// dominated kick (14 damage vs kick's 10, PLUS anti-air, PLUS knockback,
// for zero resource cost) - there was no reason to ever throw a kick
// instead. Now costs more than kick (a stronger commit, given the anti-air/
// knockback utility on top) and does the same damage as kick rather than
// more - the payoff for landing one is still real (knockback, catching a
// jump), it just isn't also free chip damage on top.
export const UPPERCUT = { duration: 18, activeStart: 6, activeEnd: 11, damage: 10, range: 80, height: 90, knockback: 100, cost: 25 };

// --- Airborne juggle (the real launcher) -----------------------------------
// Every other "big" hit in this engine (slide, the two melee specials) just
// plays a reaction pose and/or shoves the defender sideways along the
// ground - uppercut now does something categorically different when it
// connects: it launches the defender into THIS state, "juggled", a genuine
// airborne physics state (a real juggleY/juggleVY pair, integrated once a
// real tick in update()'s own "juggled" branch below - not a cosmetic
// parabola sampled off stateT the way jump/uppercut/knockback's own
// jumpOffset arcs are) rather than the flat, ground-locked "hitstun" every
// other hit still uses. See takeDamage far below: `kind === "uppercut"` is
// now the ONLY thing that routes into applyJuggleLaunch() instead of the
// plain setState("hitstun") branch - so there is no remaining case where a
// connecting uppercut still produces the old grounded reaction; every
// uppercut hit, fresh anti-air opener or a follow-up landed while the
// defender is already airborne (a "relaunch"), takes this path.
// checkUppercutHit in game.js deliberately never excludes a "juggled"
// defender the same way it already never excluded "jump" - that lack of an
// exclusion IS the relaunch mechanic, no separate flag needed.
//
// Horizontal position is a deliberate, fully-frozen non-choice, not
// "drifting slightly" - update()'s "juggled" branch never touches this.x at
// all. A juggled fighter staying exactly where they were launched from is
// what keeps checkUppercutHit's own fixed-range check (UPPERCUT.range,
// x-only, same as every other melee hitbox in this file) a reliable way to
// land a follow-up uppercut on someone already in the air, and keeps this
// phase's scope to "the physics state exists and is truly bounded" rather
// than also having to reason about a moving mid-air target.
const JUGGLE_GRAVITY = 0.55;
// Peak height ≈ v²/(2·g) ≈ 15²/(2·0.55) ≈ 205px - taller than a real jump's
// arc (JUMP_HEIGHT 140) or uppercut's own old rise (UPPERCUT.height 90) on
// purpose: this needs to read as a real launch, not just a slightly bigger
// hop, and needs enough hang time for a follow-up (attacker's own jump, or a
// relaunch) to plausibly land before gravity brings them back down on its
// own. Time to return to the ground from a fresh launch (2v/g) is
// ≈ 2·15/0.55 ≈ 55 frames, well inside MAX_JUGGLE_FRAMES below.
const JUGGLE_LAUNCH_VELOCITY = 15;
// Every relaunch after the very first hit of a sequence decays off this
// SAME original velocity via Math.pow(DECAY, hits-1) in applyJuggleLaunch
// below - never off the previous hit's own already-decayed velocity.
// Compounding hit-over-hit decay (each relaunch scaled down from the last
// one, not from the original) only asymptotically approaches zero and never
// mathematically reaches it - a soft decay that trends toward zero is NOT an
// acceptable substitute for a hard cap. MAX_JUGGLE_HITS below is the actual
// hard stop; this just makes each hit leading up to it feel less generous
// than the one before, same shape as every real air-combo game's own
// proration.
const JUGGLE_RELAUNCH_DECAY = 0.6;
// Hard, unconditional cap #1 (hit-count axis): the 6th hit of any single
// juggle sequence (juggleHits > 5, i.e. hits 1-5 still launch, decayed, hit 6
// onward never do - see applyJuggleLaunch) grants ZERO further upward
// velocity, full stop, no matter what move lands it or how much power the
// attacker has. A capped hit still deals its (already combo-decayed)
// damage and can still land while the defender happens to still be
// airborne from momentum - it just can never add height again, so gravity
// alone (already running every real tick regardless of hits) guarantees
// they come down.
const MAX_JUGGLE_HITS = 5;
// Hard, unconditional cap #2 (time axis) - the actual backstop, independent
// of hit count entirely. Tracked via a dedicated juggleAirborneFrames
// counter (NOT this.stateT, which setState() zeroes on every relaunch's own
// setState("juggled") call and would therefore silently reset this exact
// guarantee right when it matters most) that only ever gets zeroed at the
// start of a genuinely FRESH sequence (defender wasn't already "juggled")
// and otherwise counts every real tick straight through every relaunch in
// between. Once it's hit, applyJuggleLaunch grants no more velocity
// regardless of juggleHits - even a sequence that somehow kept landing hits
// 1 frame apart forever (it structurally can't - see MAX_JUGGLE_HITS above)
// would still be capped here. 150 frames (2.5s at 60fps) comfortably covers
// even a full 5-hit relaunch chain (each relaunch both shortens its own
// hang time via the velocity decay above AND has to happen inside whatever
// hang time is left) with real margin - verified live with a scripted
// aggressive-mashing bot as part of this port's own stress test.
const MAX_JUGGLE_FRAMES = 150;

// --- Juggle spike (hard-knockdown ender) -----------------------------------
// Landing on the DEFAULT juggle outcome (gravity quietly bringing the
// defender back down into the same brief "knockback" hold every ordinary
// landing gets, see update()'s "juggled" branch below) makes even a full,
// well-played launcher->air-combo sequence read as "one more hit that
// happened to be airborne", not the genuinely bigger moment it should be.
//
// A "spike" is a hit that qualifies as this juggle sequence's own closer -
// reusing isComboEnder's own shape (a hit only counts as a finisher-worthy
// moment past some minimum real depth, not on an early beat) rather than
// inventing a parallel concept, but measured on the axis that actually
// matters here: how many times THIS airborne sequence has already been
// extended (juggleHits, applyJuggleLaunch's own per-sequence counter), not
// the overall comboCount isComboEnder itself reads - comboCount also counts
// whatever grounded cancel-string opened the launcher in the first place
// (see CANCEL_ROUTES below), so gating a JUGGLE-specific finisher off it
// would let a long-enough ground opener spike the very FIRST airborne hit.
// JUGGLE_SPIKE_MIN_HITS mirrors COMBO_ENDER_MIN_DEPTH's own "3" (a 2-hit
// string isn't finisher-worthy yet) on this juggle-local counter instead -
// the launch itself is juggleHits===1, so requiring the PRE-this-hit count
// to already be >= 3 means a spike is only reachable on the sequence's 4th
// airborne hit at the earliest (launch + two real extensions + the spike),
// leaving genuine room for the jump-follow air attacks below to actually
// extend a juggle before this finisher can fire.
const JUGGLE_SPIKE_MIN_HITS = 3;
// Every kind that can EVER land on an already-"juggled" defender in the
// first place is, by construction, one of this engine's few genuinely
// hard-hitting moves - there's no "weak jab" that can even reach a juggled
// opponent to begin with. Ordinary punch/kick/slide/the plain bolt's own
// dodge logic in game.js all still exclude an airborne target outright;
// the ground finisher (kind "finisher", stage 3) is the one deliberate
// grounded exception (see checkHit's own box.kind !== "finisher" carve-out
// there) - it isn't listed below because it forces its OWN dedicated spike
// via an explicit applyJuggleSpike() call in game.js instead of going
// through this automatic check at all (same override punchDown already
// uses). This list is kept
// anyway, same reasoning ENDER_KINDS above documents its own short list
// for, so the design intent (a spike is specifically a CLOSER-class hit,
// not just "whatever happened to connect") stays explicit in code even
// though today it happens to cover every kind that could reach this check.
const JUGGLE_SPIKE_KINDS = new Set(["uppercut", "special", "airKick"]);
export function isJuggleSpike(wasAlreadyJuggled, juggleHitsBeforeThisHit, kind) {
  return wasAlreadyJuggled && juggleHitsBeforeThisHit >= JUGGLE_SPIKE_MIN_HITS && JUGGLE_SPIKE_KINDS.has(kind);
}
// A real, forceful SLAM - not the ordinary relaunch decay trending toward
// zero, and not just letting gravity finish off whatever velocity was
// already left the way a MAX_JUGGLE_HITS-capped hit does either. Bigger in
// magnitude than the original upward launch (15) on purpose - the closer
// should feel more violent coming down than the opener felt going up.
// Sign is negative (this file's own juggleVY convention - positive lifts,
// see JUGGLE_GRAVITY above) - applied directly as this.juggleVY, not
// blended/decayed from whatever velocity was already there, so the slam
// reads the same forceful speed regardless of exactly when in the fall it
// lands.
const JUGGLE_SPIKE_VELOCITY = 24;
// The actual "real window of continued advantage" reward for completing a
// full sequence - a hard-knockdown recovery, not the same brief
// KNOCKBACK_DURATION (28) hold every ordinary juggle landing (or a plain
// slide hit) already gets. Meaningfully longer (>2x) - the payoff for
// actually landing the finisher has to be a real, usable window (walk up,
// keep pressuring, mix up the next opener) not just a bigger number on the
// health bar. Read by the "knockback" branch of update()'s shared durations
// map below via this.hardKnockdownFrames - see that field's own constructor
// comment for why it's a per-instance override rather than a second
// hardcoded state entry.
const HARD_KNOCKDOWN_DURATION = 65;

// --- Ender push-out (stage 4, requirement 10) -------------------------------
// Every "ender"-class hit (isComboEnder above - uppercut/slide/special/
// punchDown/finisher at real depth, or any killing blow) should leave a real
// gap the attacker has to walk/dash back across to keep pressuring, not just
// chip damage in place. Bigger than SLIDE's own baseline knockback (90) on
// purpose - an ender is supposed to read as a bigger, more decisive shove
// than an ordinary connecting slide. Exported (unlike most bare move
// constants in this file) because BOTH this file and game.js need the exact
// same number: this file applies it directly at the moment a SPIKED juggle
// (punchDown/finisher) lands (see the "juggled" branch's own landing check
// above) - the only place with both "was this hit's own ender-class slam"
// knowledge AND the opponent reference needed to compute which way to push -
// while game.js applies it at its own two ender-class call sites (a
// real-depth slide hit, and the grounded special's own unblocked-hit
// knockback, stage 3B) that don't touch this file's state machine directly.
export const ENDER_PUSHOUT = 160;

// --- Juggle burst (stage 4, requirement 15) ---------------------------------
// The one, single escape mechanism out of a juggle sequence - reusing the
// EXISTING block input/power resource rather than adding a new binding (see
// the burst check at the top of the "juggled" branch above/below). Reactive-
// only (can only ever fire while genuinely "juggled" - it structurally can't
// be thrown out proactively/whiffed the way a real move could), so the only
// real lever a player has to make it more available is playing defense
// EARLIER in the exchange (blocking/parrying banks real power - see
// BLOCK_POWER_GAIN/PARRY_POWER_GAIN below - passive regen alone, 0.03/frame,
// can't refill 40 power mid-combo).
// Exported (unlike most bare move constants in this file) so ai.js's own
// self-juggled escape branch can gate its burst attempts on the exact same
// power threshold this file checks below, instead of duplicating the
// number as a magic literal that could silently drift out of sync.
export const BURST_COST = 40;
// Full damage immunity for this many real ticks after a successful burst -
// covers the entire KNOCKBACK_DURATION (28) flight this same burst puts the
// fighter into, plus a couple frames of margin, so landing back in
// "knockback" can't immediately eat a follow-up hit (or get re-launched)
// before they've even finished flying out of the juggle they just escaped.
const BURST_IMMUNITY_FRAMES = 30;
// Real distance, not a token nudge - meaningfully more than an ordinary
// slide's own knockback (90), on the same order as ENDER_PUSHOUT above,
// since escaping a juggle for a real 40-power cost needs to buy a real gap,
// not just a half-second of invincibility standing in place.
const BURST_PUSHOUT = 140;

// --- Aerial attacks (airKick/flyingKick) ------------------------------------
// The move that actually USES the launcher/juggle system above - and, on its
// own, the classic fighting-game "jump-in". Upstream wires this into two
// dedicated freeze-frame sprites (airKick/flyingKick) - OnChainHoodies has no
// equivalent art, so both states are registered in body.js against the
// EXISTING grounded "kick" sheet instead (a held kick-pose frame while
// airborne, same "reuse what already exists" approach every other adapted
// system in this file takes - see PUNCH_POSES/KICK_POSES above). The MOVE
// itself - a real air-to-air/air-to-ground hitbox, its own power cost, and
// the ability to extend an existing juggle - is fully real regardless; only
// the sprite is reused. One shared move spec - airKick vs flyingKick is a
// COSMETIC choice (see pickAirAttackState below), not two different moves
// with their own separately-tuned numbers.
//
// duration (16) matches airKick/flyingKick's own ANIMS durationFrames in
// body.js exactly - this is the pose's full hold, same convention as every
// other move constant in this file already follows (see KICK's own comment
// on activeStart/activeEnd being read against this same duration).
// activeStart/activeEnd carve out the middle of that 16-frame hold as the
// live hitbox window, leaving real windup before it and recovery after -
// same shape as every other melee move here, just compressed to fit the
// shorter pose.
//
// range (88) clears MIN_FIGHTER_GAP (68, game.js) with real margin, same
// requirement every melee range in this file already has to clear - sized a
// touch past KICK's own 84 since a jump-in's reach reading as slightly more
// generous than a grounded kick is standard genre feel.
//
// damage (11) sits just above MEDIUM_ATTACK's own damage (8) - enough that
// committing to a jump-in (real power cost, real whiff risk landing you
// exposed - see cost below) pays off a little better than the grounded
// equivalent, without being so far ahead of Medium/Light that it obsoletes
// them as a neutral tool.
//
// cost (18) - real power, same reasoning UPPERCUT/SLIDE's own comments give
// for why these stopped being free: a committed aerial swing
// that can whiff and leave you landing with nothing to show for it needs to
// cost something. Now slightly OVER kick's opening hit cost (15, stage 2 -
// was 20 pre-chain) rather than under it - the real risk here isn't the
// cost, it's landing recovery if it misses, so the resource price alone
// doesn't need to be the sole deterrent the way it is for a safer grounded
// poke.
// damage trimmed 11 -> 8 (stage 5, requirement 13) - this is juggle FILLER,
// it shouldn't out-damage a real grounded chain hit now that the health pool
// is bigger and the finisher needs headroom to read as the biggest single
// chunk of any string.
export const AIR_MEDIUM = { duration: 16, activeStart: 5, activeEnd: 13, damage: 8, range: 88, cost: 18 };
export const AIR_KICK_POSES = ["airKick", "flyingKick"];
// Every aerial punch-family move's own state (AIR_LIGHT/AIR_HEAVY/
// AIR_FINISHER above) - real array, not a bare per-state check, same
// future-proofing reason PUNCH_POSES/KICK_POSES stay real lists. Built off
// the three move objects directly now that there's no chain array to map
// over - the combined jump/air-attack branch of update() below needs this to
// recognize "is this fighter currently in one of the three aerial
// punch-family poses" without listing all three states inline at every call
// site.
const AIR_PUNCH_STATES = [AIR_LIGHT.state, AIR_HEAVY.state, AIR_FINISHER.state];
// Per-state pose-hold duration lookup for that same branch's landing/return-
// to-jump check - airKick/flyingKick both share AIR_MEDIUM.duration (16),
// but AIR_LIGHT/AIR_HEAVY/AIR_FINISHER each own their own real duration, so
// a single shared constant can't cover all five poses the way it could when
// airKick/flyingKick were the only two aerial attack poses that existed.
const AIR_ATTACK_STATE_DURATIONS = {
  airKick: AIR_MEDIUM.duration,
  flyingKick: AIR_MEDIUM.duration,
  [AIR_LIGHT.state]: AIR_LIGHT.duration,
  [AIR_HEAVY.state]: AIR_HEAVY.duration,
  [AIR_FINISHER.state]: AIR_FINISHER.duration,
};

// --- Aerial homing special --------------------------------------------------
// The actual "ranged attack from the air, auto-aimed" move - see
// spawnHomingProjectile/updateProjectiles in game.js for the steering math
// and hit resolution, which reuses the existing projectiles array/
// updateProjectiles loop (same array the bolt/rat-rush already live in,
// drawn with body.js's existing drawSurgeBlast art - no new art needed for
// this one at all, ranged FX was never character-likeness-specific to begin
// with) rather than a second parallel projectile system. Only the move DATA
// (cost/damage, same convention every other move constant in this file
// follows) lives here.
//
// No cast animation of its own, same reasoning AIR_MEDIUM's own comment
// gives for reusing existing art rather than inventing a new pose:
// jumpOffset only samples a real height for "jump"/"airKick"/"flyingKick"
// (see that getter below), so transitioning into any OTHER state mid-flight
// would snap the sprite to ground level for the pose's duration, then jump
// back up once "jump" resumed - an obvious visual teleport. Instead this
// fires instantly off a buffered/justPressed special input while
// this.state === "jump" (see the combined jump/airKick/flyingKick branch of
// update() below) - this.state never changes, so jumpOffset keeps reading
// the same continuous flight arc it already was, and only lastEvent
// ("air-special-release") signals game.js to actually spawn the projectile
// that frame. Same "no windup, pure resource commitment" shape DASH already
// uses on the ground.
//
// Gated on this.state === "jump" specifically, not "airKick"/"flyingKick"
// too - those are already a committed 16-frame melee swing of their own (see
// AIR_MEDIUM.duration), and letting a second, entirely different action fire
// out of the middle of one would need its own cancel-window reasoning this
// phase doesn't take on. A player gets one aerial special OR one aerial
// melee swing per airborne beat, same as a grounded fighter only ever
// commits to one grounded attack at a time.
//
// cost (30) sits between AIR_MEDIUM's 18 and the grounded SPECIAL's 50 -
// real commitment, but this move's actual power is the TRACKING (can't be
// juked by ordinary positioning the way a straight-line bolt can, and -
// unlike every other grounded ranged attack - can reach an already-juggled
// defender at all, see updateProjectiles' own dodge-exclusion comment)
// rather than a bigger number, so it doesn't need to cost as much as the
// grounded special to stay balanced.
//
// damage (10, trimmed from 14 - stage 5, requirement 13) is a single hit -
// sized in the same low tier as AIR_MEDIUM's own (8) and kick's opening
// chain hit (8, stage 2), rather than anywhere near the grounded SPECIAL's
// (22, also trimmed this stage). Same reasoning: this move's own payoff is
// now explicitly the GRAB (stage 3, requirement 8), not raw damage - it's
// the tool that resets/extends a juggle, not a bigger hit than the moves
// that build the juggle in the first place.
export const AIR_SPECIAL = { damage: 10, cost: 30 };
// Cumulative push applied on a landed homing hit - matches the same
// "nudge, don't shove" magnitude every other special call site in game.js
// already uses on a landed hit. Only ever applied to a GROUNDED target now
// (see game.js's applyHomingHit) - a still-juggled one gets the real x-
// reposition pull described below instead.
export const AIR_SPECIAL_KNOCKBACK = 20;
// Requirement 8 - once a juggle sequence is open, this move becomes a real
// "grab and return" tool (see game.js's applyHomingHit for the actual x
// reposition/relaunch): the FIRST cast against an already-juggled opponent
// this sequence still only costs AIR_SPECIAL.cost (30, refunded back on a
// landed hit - see the economy comment on juggleGrabsUsed in the
// constructor below), but every cast AFTER that first one requires this
// much power already banked before it can even fire (checked, not spent -
// spendPower below is still only ever AIR_SPECIAL.cost) - a real resource
// buffer, not just a flat higher price, so repeat grabs need genuine
// power management rather than just being slightly more expensive.
export const AIR_SPECIAL_REGRAB_MIN_POWER = 45;

// --- Cancel windows: move-specific "special cancel" routes -----------------
// Before this, ANY attack connecting while the defender was still
// hitstun/knockback-locked counted as a combo continuation, with zero
// regard for which move the ATTACKER threw or in what order (see
// takeDamage's wasChaining check far below in this file - that's still
// exactly how a landed hit gets SCORED as a combo continuation once it
// lands; nothing here touches that). This section is entirely about whether
// the ATTACKER is even allowed to throw the next move early enough to land
// it in the first place. Classic Street Fighter/King of Fighters "special
// cancel": each grounded attack gets a short window LATE in its own
// recovery (after its active hitbox frames, near the very end of the move,
// not the instant recovery starts) during which a specific, limited
// follow-up input cuts the rest of that recovery short and starts the next
// move immediately - see update()'s attack-state branch below for where
// this actually gets checked, right before the plain
// `if (this.stateT >= durations[this.state]) this.setState("idle")`
// fallback that's still the only way out of a move for anything NOT in this
// graph (or anything whose input didn't land inside the window).
//
// The route graph (deliberately small, not "everything cancels into
// everything" - that would just be the old bug with extra steps). Re-keyed
// off the new Light/Medium/Heavy states (punch1/kick/punch3 - see
// LIGHT_ATTACK/MEDIUM_ATTACK/HEAVY_ATTACK above) now that the old chain is
// gone. Two kinds of outgoing route live here side by side:
//   - the launcher bail every grounded attack already had (a late-recovery
//     escape into uppercut-charge, unchanged from before this button-to-
//     button phase)
//   - the DBFZ-style auto-combo string itself: Light -> Medium -> Heavy,
//     PLUS the shorter Light -> Heavy skip-route (skipping Medium entirely
//     is a deliberately valid, shorter route - not a bug), giving the
//     player the "mash toward the string" feel the user specifically asked
//     for, while pressing the SAME button twice (punch1->punch1, kick->kick,
//     punch3->punch3) is deliberately absent from every entry below - see
//     BUFFERABLE_ACTIONS above for why that non-route still isn't a dead
//     press: a repeated press just sits in the one-slot input buffer and
//     fires a fresh copy of the same move the instant this move's own
//     natural duration (not this cancel window) runs out and the neutral
//     entry point re-reads it, exactly DBFZ's own "L,L,L doesn't chain,
//     L,M,H does" convention.
//   punch1   -> medium, heavy, uppercut   Light: the string's own opener,
//                           routes into both later rungs (Medium, or the
//                           Heavy skip-route) plus the same launcher bail
//                           every attack gets
//   kick     -> heavy, uppercut           Medium: continues the string into
//                           Heavy, plus the launcher bail. Nothing routes
//                           BACK into Light - the string only ever climbs
//   punch3   -> uppercut                  Heavy: the string's natural end
//                           (per spec - "Heavy -> nothing" beyond the
//                           launcher bail every attack already had). Landing
//                           this on an already-juggled opponent is the exact
//                           same ender path the old punch3/kick3 chain-ender
//                           always was - see takeDamage's isComboEnder below,
//                           which keys off `kind`/comboCount, not off HOW
//                           punch3 got entered
//   slide    -> uppercut                  slide, the LOW starter, converges
//                           on the exact same launcher route every attack
//                           above does - see takeDamage's high/low guard
//                           mixup below. Not part of the L/M/H string itself
//                           (its own dedicated button, out of scope per the
//                           instructions)
//   uppercut -> (nothing)  already this engine's biggest "ender" class hit
//                           (see isComboEnder above) - it's the string's
//                           natural stopping point, not a step to cancel out
//                           of
const CANCEL_ROUTES = {
  punch1: ["medium", "heavy", "uppercut"],
  kick: ["heavy", "uppercut"],
  punch3: ["uppercut"],
  slide: ["uppercut"],
  uppercut: [],
};

// Frame range (inclusive, read against this.stateT the same way
// activeStart/activeEnd are elsewhere in this file) each STATE's cancel
// window opens during - always AFTER that move's own real activeEnd (can't
// cancel a hit that's still live) and always the LATE portion of what's
// left, not the instant recovery starts, per "late in its own recovery"
// above. Derived directly off each move's own real duration
// (LIGHT_ATTACK/MEDIUM_ATTACK/HEAVY_ATTACK/SLIDE/UPPERCUT above) rather than
// invented numbers - identical windows to what each of these three states
// had back when they were chain entries, since the underlying duration/
// activeEnd numbers themselves never changed, only how the state gets
// entered.
const CANCEL_WINDOWS = {
  // duration 18, activeEnd 11 -> 6 recovery frames (12-17). Window is the
  // last 4.
  punch1: { start: LIGHT_ATTACK.duration - 4, end: LIGHT_ATTACK.duration - 1 },
  // duration 34, activeEnd 22 -> 11 recovery frames (23-33). Window is the
  // last 5 - unchanged from the old single-move KICK's own window.
  kick: { start: MEDIUM_ATTACK.duration - 5, end: MEDIUM_ATTACK.duration - 1 },
  // duration 24, activeEnd 16 -> 7 recovery frames (17-23). Window is the
  // last 4.
  punch3: { start: HEAVY_ATTACK.duration - 4, end: HEAVY_ATTACK.duration - 1 },
  // duration 11, no separate activeEnd (its hit check runs off distance
  // every tick it's active in updateSlide, game.js - not a frame window) -
  // window is just the last 2 frames of its already-short total duration.
  slide: { start: SLIDE.duration - 2, end: SLIDE.duration - 1 },
  // duration 18, activeEnd 11 -> 6 recovery frames (12-17). Window is the
  // last 3. Defined for consistency (every grounded attack gets one) even
  // though CANCEL_ROUTES.uppercut is empty today - nothing currently reads
  // this as a real gate, only future-proofing for whenever uppercut itself
  // gets an outgoing cancel route.
  uppercut: { start: UPPERCUT.duration - 3, end: UPPERCUT.duration - 1 },
};

// Archetype specials rework (stage 3, requirement 6) - Builder/Hodler no
// longer get their own dedicated melee states (specialHigh/specialLow are
// GONE as move states; body.js keeps the two SHEETS themselves since kick3/
// crouchKick already repurposed them wholesale in stage 2). ALL FOUR
// archetypes now enter the exact same shared ranged "special" cast pose
// (see the special branch of update() below) - the only real archetype
// split left is which of this engine's two existing PROJECTILES spawns off
// the back of it (see spawnProjectile in game.js): Flipper+Hodler throw the
// ground-level rat rush, Builder+Collector throw the head-height bolt. True
// minimal churn - Flipper already had the rat, Collector already had the
// bolt, only the two former-melee archetypes (Builder, Hodler) pick up a
// projectile they didn't have before, and nobody who already had one has it
// swapped out from under them.
//
// Ground finisher (requirement 9) - a "get over here" gap-close + slam,
// only reachable while the OPPONENT is still airborne in a juggle. Reached
// via a real 2-button HOLD (Heavy + Special together, order-agnostic) -
// see the finisher-macro branch in the grounded neutral part of update()
// below, and FINISHER_MACRO_GRACE_FRAMES' own comment, for the full design.
// gapCloseFrames is the pull-in window
// (see the dedicated physics branch in the shared durations block below);
// activeStart/activeEnd carve the live hitbox window out of the back half
// of duration, after the pull has already closed the gap. damage (22) is
// this engine's single biggest one-hit payoff - see the ENDER_SCALE_FLOOR
// note on takeDamage's combo-scaling for why that's true even after normal
// combo decay would otherwise shrink a deep string's later hits below it.
// cost (60) is real - more than the plain SPECIAL.cost (50) it's gated
// behind arming, on top of the whole risk of a 34-frame commitment that can
// simply whiff for nothing if the target escapes (see stage 4's juggle
// burst) before the active window opens.
export const JUGGLE_FINISHER = { duration: 34, gapCloseFrames: 12, activeStart: 14, activeEnd: 24, damage: 22, range: 70, cost: 60 };
// Grace window (order-agnostic) for treating "Heavy AND Special pressed
// within a hair of each other" as one genuine simultaneous hold rather than
// two separate presses - see the finisher-macro branch of update() below
// for the full design. This only needs to absorb ordinary human press
// jitter between two fingers landing on two different buttons "at the same
// time" (a handful of ms), not carry a whole extra discrete follow-up-
// button decision the way the old arm-then-choose-Light-or-Medium window
// did - shorter than that old FINISHER_ARM_FRAMES value (8) it replaces.
const FINISHER_MACRO_GRACE_FRAMES = 6;
// Power now mostly comes from actually fighting - landing a hit or holding
// a block - rather than sitting still. Passive trickle is deliberately
// slow (was 0.15/frame, ~9/sec - fast enough that special was basically
// always available for free) so the special reads as something you earn,
// not something you wait out. special itself grants nothing back (already
// the most expensive thing you can do) - the resource wall is the point.
const PASSIVE_REGEN_PER_FRAME = 0.03; // ~1.8/sec at 60fps
// slide's gain used to be the highest of all of these (14) despite costing
// nothing to use - meaning landing one didn't just cost nothing, it was the
// fastest power battery in the game. Now that slide has a real cost (30),
// its gain is deliberately small so landing one still nets a real loss
// (30 - 6 = 24 power gone) rather than paying for itself - it should stay a
// deliberate, occasional tool, not something worth spamming even on a hit.
// punch's gain trimmed 10 -> 8 now that it's a 3-hit chain (chains land more
// hits per commitment than the old single poke did, so each one pays out a
// little less). airPunch/punchDown/crouchPunch are new - punchDown pays the
// most of the three since it's the resource-gated juggle finisher, and
// crouchPunch (the free low poke) is currently unreachable via its own key
// (crouchPunch hits resolve with kind "punch", see checkHit in game.js) but
// kept here for whichever future call site ends up reading it directly.
// kick trimmed 12 -> 10 back when it was still a 3-hit chain, each hit
// costing real power on its own already (unlike punch's free chain) - kept
// at 10 now that Medium (MEDIUM_ATTACK above) is a single direct-entry move
// again, same as punch's own trimmed value stays put. crouchKick gets its OWN
// real key (unlike crouchPunch above) - see attackHitbox's own kind
// assignment for why crouchKick reports a distinct "crouchKick" kind rather
// than folding into "kick".
// finisher: 0 - same reasoning special already gives (the biggest, most
// committed payoff move in any kit never self-refunds).
const POWER_GAIN = { punch: 8, kick: 10, slide: 6, uppercut: 16, special: 0, airKick: 12, airPunch: 10, punchDown: 14, crouchPunch: 8, crouchKick: 8, finisher: 0 };
// Bumped 8 -> 10 (stage 5, requirement 12 polish) - feeds the stage-4 juggle
// burst's own economy: BURST_COST is 40, so this means ~4 blocked strings
// banks one full escape instead of 5, matching the plan's own "defense-
// literate players escape, mashers don't" framing without making blocking
// alone trivially refill a burst off a single exchange.
const BLOCK_POWER_GAIN = 10;

// --- Perfect parry ---------------------------------------------------------
// "Just block"/parry pattern layered on top of ordinary block rather than
// replacing it: the block state already exists (see update()'s block branch
// and takeDamage below), and stateT already tracks "how many frames have I
// been continuously holding block" for free - setState only zeroes it on the
// actual TRANSITION into "block", not every frame it's held (see setState).
// A perfect parry therefore requires the guard to have gone up recently -
// tapping it right as the hit lands - not just holding it through the whole
// exchange, which is what keeps a turtling "hold block forever" player from
// ever seeing this trigger and makes it a real timing read instead of a
// strictly-better version of plain block.
//
// 8 frames (~133ms at 60fps): PUNCH's activeStart is 6 frames into its own
// wind-up and KICK's is 10 - both clear this window with margin if the
// defender raises block only once the swing is visibly already committed,
// so it can't be satisfied just by pre-emptively guarding the instant an
// attack animation starts.
const PARRY_WINDOW_FRAMES = 8;
// Meaningfully more than BLOCK_POWER_GAIN (8) - same reasoning as a landed
// hit's onLandedHit gain always outweighing a chip-damage block: the bigger
// resource swing is what makes eating a swing on purpose feel like a real
// turnaround instead of "block, but slightly better." No cap needed beyond
// MAX_POWER - spendPower/the passive regen clamp already handle that.
const PARRY_POWER_GAIN = 22;
// How long the attacker is left open after getting parried - long enough for
// the parrying player to land a real punish (a punch's own startup is only a
// few frames), short enough it isn't a free full combo on its own. NOT run
// through computeHitstunFrames - a parry's punish window is a fixed reward
// for the read, not something that should scale off how hard the parried
// attack would have hit.
const PARRY_STAGGER_FRAMES = 26;

// --- Input buffering -----------------------------------------------------
// A button pressed slightly before the current move's recovery/hitstun ends
// used to just be silently dropped (justPressed only fires on the exact
// frame the physical edge happens, and every locked state below returns
// before ever checking it). Now the most recent press of one of these gets
// remembered for INPUT_BUFFER_FRAMES real ticks and fires the instant the
// state machine is actually free to act, same idea as every modern
// fighting game's buffer window. ~5 frames at 60fps (~83ms) - generous
// enough to catch "pressed a hair early", nowhere near long enough to read
// as a queued-up combo string.
//
// uppercut is deliberately excluded, same reasoning as justPressed below:
// holding it is the real charge mechanic, not a discrete press to buffer.
const INPUT_BUFFER_FRAMES = 5;
// Priority order when two actions are pressed the same tick - most
// committal move wins and gets buffered (arbitrary but consistent; a real
// simultaneous double-press is rare and this just needs to be deterministic).
// dashForward/dashBack sit right after jump - both are non-damaging
// repositioning tools, ahead of the attacks that actually matter to
// prioritize if two buttons land the same frame. Split from the old single
// "dash" action (stage 4, requirement 11) - two discrete buttons now, not
// one action plus a held-direction read. "block" is deliberately NOT in this
// list - the juggle burst it drives (see BURST_COST above) is reactive-only,
// checked directly off justPressed.block at the top of the "juggled" branch,
// never queued/buffered the way a grounded attack's early press is.
const BUFFERABLE_ACTIONS = ["special", "jump", "dashForward", "dashBack", "slide", "heavy", "medium", "light"];

// One mechanical trait per Hood archetype - matches their own "Builders,
// Collectors, Flippers and HODLers" framing directly rather than inventing
// something disconnected from the actual collection identity. Exported so
// the character-select tooltip (main.js) can read the real numbers instead
// of hardcoding a second copy that could drift out of sync.
export const ARCHETYPES = {
  Builder: { damageMult: 1.25, speedMult: 1, healthMult: 1, blockMult: 1 },
  Flipper: { damageMult: 1, speedMult: 1.3, healthMult: 1, blockMult: 1 },
  Hodler: { damageMult: 1, speedMult: 1, healthMult: 1.25, blockMult: 1 },
  Collector: { damageMult: 1, speedMult: 1, healthMult: 1, blockMult: 0.5 },
};
const DEFAULT_ARCHETYPE = { damageMult: 1, speedMult: 1, healthMult: 1, blockMult: 1 };
export const RARE_TRAIT_HEALTH_BONUS = 0.02;

export class Fighter {
  constructor(data, x, facing) {
    this.data = data;
    this.headImg = new Image();
    this.headImg.crossOrigin = "anonymous";
    this.headImg.src = data.imageUrl;

    this.archetype = ARCHETYPES[data.hoodieType] ?? DEFAULT_ARCHETYPE;
    this.maxHealth = Math.round(
      MAX_HEALTH *
        this.archetype.healthMult *
        (1 + RARE_TRAIT_HEALTH_BONUS * (data.rareTraitCount ?? 0)),
    );

    this.x = x;
    this.facing = facing;
    this.state = "idle";
    this.stateT = 0;
    this.health = this.maxHealth;
    // Starting empty against an AI that can already fight back from frame
    // one felt unwinnable, not tense - starting full gives both sides an
    // opening special/kick to actually work with.
    this.power = MAX_POWER;
    this.hasHit = false;
    // Set by the caller (game.js) right after a hit/action lands, so it can
    // trigger the matching sound effect without fighter.js knowing about audio.
    this.lastEvent = null;
    // Rising-edge tracking for every discrete action - see _trackInput()'s
    // justPressed block. Holding a button down must not auto-repeat it the
    // instant the previous one ends; each activation needs its own fresh
    // press, same as a real arcade cabinet. `block` isn't a physical button
    // anymore (see isHoldingBack below) - it's still tracked here the same
    // way, just fed a DERIVED value (holding back) instead of a raw input
    // flag, so the juggle-burst edge-trigger built on top of it (see
    // BURST_COST above) keeps working unchanged.
    this.prevInput = { light: false, medium: false, heavy: false, slide: false, special: false, jump: false, dashForward: false, dashBack: false, block: false };
    // See the combo-scaling block above - how many hits in a row have
    // landed on THIS fighter with no gap (still locked in hitstun/knockback
    // each time the next one connected). Reset to 1 the moment a hit lands
    // that ISN'T a continuation (see takeDamage) - never needs an explicit
    // "combo ended" reset elsewhere, since the only way a future hit reads
    // as chained is if this fighter is still genuinely stunned when it
    // lands, which state itself already guarantees.
    this.comboCount = 0;
    // airKickChainIndex is purely a COSMETIC pose-cycle counter (see
    // pickAirAttackState below) - the aerial Medium move (AIR_MEDIUM) is a
    // single fixed hitbox/damage/cost regardless of which press count throws
    // it, this only picks which of the two identically-statted poses
    // (airKick vs the more committed-looking flyingKick) renders it. The old
    // airPunchChainIndex field this comment used to describe is gone
    // entirely - AIR_LIGHT/AIR_HEAVY are single direct-entry moves with no
    // chain index of their own now (see their own comment above), same as
    // LIGHT_ATTACK/MEDIUM_ATTACK/HEAVY_ATTACK already are on the ground.
    // Reset per-jump (see the airborne branch and jump-entry point below)
    // rather than time-gated - a fresh jump always starts fresh.
    this.airKickChainIndex = 0;
    // Airborne juggle physics - see the "Airborne juggle" block above (near
    // UPPERCUT) for the full design. juggleY/juggleVY are only ever
    // meaningful while state === "juggled" (integrated once a real tick in
    // update()'s own branch for that state); juggleHits/juggleAirborneFrames
    // persist across an entire juggle SEQUENCE (including every relaunch,
    // not just the fresh opener) and are exactly what MAX_JUGGLE_HITS/
    // MAX_JUGGLE_FRAMES are checked against in applyJuggleLaunch -
    // deliberately separate fields from comboCount above, which is the
    // older, broader "how many hits in a row with no gap" counter this file
    // already uses for damage scaling/FX tiers and keeps being fed by every
    // kind of chained hit (grounded or airborne), not just juggle ones.
    this.juggleY = 0;
    this.juggleVY = 0;
    this.juggleHits = 0;
    this.juggleAirborneFrames = 0;
    // Spike-ender bookkeeping - see the big "Juggle spike" comment block
    // above for the full design. `spiked` is a single-use flag (same
    // lifecycle as lastComboEnder/lastHitKind below): applyJuggleSpike sets
    // it true, and the ONLY place it's ever read is the instant this
    // fighter's own fall actually ends (update()'s "juggled" branch), which
    // consumes it back to false right there - so a later, ordinary
    // (non-spiked) knockback can never accidentally inherit a stale true
    // from an earlier sequence. `hardKnockdownFrames` is the actual duration
    // override this decides between (HARD_KNOCKDOWN_DURATION vs null, i.e.
    // "fall back to the plain KNOCKBACK_DURATION constant") - kept as its
    // own field rather than a second hardcoded state entry since
    // "knockback" is reused wholesale for both a spike's hard-knockdown
    // landing and an ordinary slide hit's much shorter one (see takeDamage's
    // own explicit reset of this field on the slide path, the only OTHER
    // place "knockback" ever gets entered from).
    this.spiked = false;
    this.hardKnockdownFrames = null;
    // Requirement 8's grab economy - how many times THIS fighter has already
    // grabbed the CURRENT juggle sequence with the aerial homing special
    // (see AIR_SPECIAL_REGRAB_MIN_POWER above and the airborne branch of
    // update() below). Lives on the ATTACKER (not the defender the way
    // juggleHits/spiked above do), since it's tracking this fighter's OWN
    // resource usage across a sequence, not anything about what's happening
    // to whoever they're juggling - reset in game.js's own uppercut hit
    // resolution whenever THIS fighter's uppercut opens a genuinely fresh
    // juggle (not a relaunch), never here in the constructor-adjacent
    // per-hit bookkeeping the way defender-side juggle fields are.
    this.juggleGrabsUsed = 0;
    // Requirement 9's finisher macro grace window - see
    // FINISHER_MACRO_GRACE_FRAMES and JUGGLE_FINISHER above for the full
    // design. Real per-fighter countdown (this engine has no global frame
    // counter), decremented once per real update() tick while the window is
    // open, zeroed the instant it either fires the finisher or falls back to
    // whichever single move the arming button would have thrown alone.
    // finisherMacroArmedBy records WHICH of the two buttons (heavy/special)
    // arrived first, so that fallback knows which single move to resolve
    // into - null whenever the grace window itself isn't open.
    this.finisherMacroGraceT = 0;
    this.finisherMacroArmedBy = null;
    // Real "how long has THIS fighter been continuously off the ground"
    // counter for a voluntary jump - see the combined jump/airKick/
    // flyingKick branch of update() below for the full design. Deliberately
    // separate from stateT: stateT gets zeroed by setState() every time the
    // state machine moves from "jump" into "airKick"/"flyingKick" (throwing
    // an air attack) and potentially back into "jump" again afterward (still
    // airtime left) - if jumpOffset sampled stateT instead, the height arc
    // would snap back to its own t=0 (ground level) the instant an air
    // attack was thrown, then jump straight back up to a fresh full-height
    // arc once "jump" resumed, an obviously broken teleport rather than one
    // continuous flight with a strike in the middle of it. airborneT only
    // ever resets at the START of a fresh jump (see the jump-start branch
    // below) and counts every real tick straight through however many air
    // attacks get thrown along the way - same "persists across the whole
    // sequence, not just one sub-state" shape juggleAirborneFrames above
    // already uses for the same reason.
    this.airborneT = 0;
    // Requirement 11's backward jump - set once, at jump-entry, from whatever
    // direction was held at the moment of the press (see the jump-start
    // branch below): true only when that held direction is genuinely AWAY
    // from the opponent, false for a neutral or toward-opponent jump (a
    // plain forward/vertical jump is byte-identical to before this field
    // existed - see jumpOffset/applyMove's own reads of it). A real boolean
    // rather than a second jump state string - every existing
    // `state === "jump"` check (isAirborne in game.js, jumpOffset here, the
    // combined jump/air-attack branch below) stays valid unchanged.
    this.jumpBack = false;
    // Requirement 11's air dash - true only while state is "dash" AND that
    // dash was thrown mid-air (see the airborne branch below vs the plain
    // grounded dash entry point, which never sets this true). Distinguishes
    // the two so an air dash can keep draining airborneT and hand control
    // back to "jump" on exit, while a grounded dash still returns straight
    // to "idle" through the ordinary shared duration-map branch, unchanged.
    this.dashWasAirborne = false;
    // Input buffer state - see INPUT_BUFFER_FRAMES above. At most one
    // pending action at a time (the latest press wins); consumeBuffered()
    // clears it the moment it actually fires.
    this.bufferedAction = null;
    this.bufferTtl = 0;
    // Requirement 15's juggle burst - see BURST_IMMUNITY_FRAMES above. Real
    // per-fighter countdown (this engine has no global frame counter),
    // decremented once per real update() tick, checked first thing in
    // takeDamage below (a full ignore, not a discount, while > 0).
    this.burstImmunityT = 0;
    // Fix for the juggle-burst reliability bug caught in post-build review:
    // block was checked via a bare justPressed.block with no buffering at
    // all, so a press landing during a hitstop-frozen tick (update()'s
    // "juggled" branch below doesn't run on frozen ticks - see
    // tickInputOnly()) was silently discarded even though _trackInput()
    // still captured the edge that same tick. Dedicated countdown (not
    // folded into the shared bufferedAction/bufferTtl slot used by
    // BUFFERABLE_ACTIONS) so a queued burst can never be evicted by an
    // unrelated punch/kick/special press racing it for the one shared slot.
    this.burstBufferT = 0;
    // Single-frame-lived flags, same lifecycle as lastEvent (reset to a
    // neutral value at the top of every update(), only ever set true inside
    // takeDamage for the exact frame a real hit lands on this fighter) - see
    // game.js's per-hit shake/flash/triggerHitstop calls, which read these
    // the same frame they're set and don't need them to persist past it.
    this.lastComboEnder = false;
    this.lastHitKind = null;
    this.lastHitWasSpike = false;
  }

  get name() {
    return this.data.name;
  }

  setState(state) {
    this.state = state;
    this.stateT = 0;
    this.hasHit = false;
  }

  spendPower(amount) {
    if (this.power < amount) return false;
    this.power -= amount;
    return true;
  }

  // Called by game.js right after takeDamage sets state to "knockback" -
  // records the launch point/direction/distance so update() can fly the
  // fighter there over KNOCKBACK_DURATION instead of snapping instantly.
  setKnockbackMotion(dir, total) {
    this.knockbackStartX = this.x;
    this.knockbackDir = dir;
    this.knockbackTotal = total;
  }

  // Facing-relative "holding back" (away from the opponent) - the sole
  // trigger for both guard stances now (see the block/blockLow branch of
  // update() below - no dedicated block button exists anymore), and also
  // what feeds _trackInput's own justPressed.block/burstBufferT edge (the
  // juggle burst - see BURST_COST above - still reads "block" as a discrete
  // tap, now piggybacking on the same back-hold instead of a button: tap
  // away from the attacker to burst out).
  //
  // Reads this.facing rather than recomputing a fresh Math.sign(opponent.x -
  // this.x) the way this.jumpBack's own entry-point calc does, specifically
  // because this ALSO has to run from _trackInput during a hitstop-frozen
  // tick (see tickInputOnly below), which is never handed an opponent
  // reference at all - this.facing is already refreshed once every real,
  // non-frozen tick by game.js's own loop(), straight off both fighters'
  // true x, right after both fighters' update() calls for that tick (see the
  // "Keep both fighters facing each other" block there), so it can never be
  // more than the one frame stale every other "away from opponent" read in
  // this file already tolerates - and simply holds, same as everything else,
  // for the exact duration a hitstop freeze holds.
  isHoldingBack(input) {
    return (input.left && this.facing > 0) || (input.right && this.facing < 0);
  }

  // Rising-edge detection + input-buffer bookkeeping, factored out so it can
  // run every real tick regardless of whether the rest of update() actually
  // gets to execute that tick - called from update() itself below, AND from
  // tickInputOnly() during a hitstop freeze frame (game.js), so a press that
  // lands mid-freeze still gets captured into the buffer instead of the
  // fighter simply never seeing it (update() isn't called at all on frozen
  // frames - see game.js's loop()). Computed unconditionally, before any
  // state-gated early return in update() below - otherwise a button held
  // straight through an attack/hitstun/etc. would read as a "fresh press"
  // the instant that state happens to end, which is exactly the
  // hold-to-spam behavior this exists to prevent. uppercut is deliberately
  // excluded from both edge-tracking and buffering - holding it is the
  // actual charge mechanic, not something that needs edge-triggering or
  // queueing.
  _trackInput(input) {
    const holdingBack = this.isHoldingBack(input);
    const justPressed = {
      light: input.light && !this.prevInput.light,
      medium: input.medium && !this.prevInput.medium,
      heavy: input.heavy && !this.prevInput.heavy,
      slide: input.slide && !this.prevInput.slide,
      special: input.special && !this.prevInput.special,
      jump: input.jump && !this.prevInput.jump,
      // Split from the old single "dash" (stage 4, requirement 11) - two
      // discrete edge-triggered buttons now instead of one action plus a
      // held-direction read at activation time.
      dashForward: input.dashForward && !this.prevInput.dashForward,
      dashBack: input.dashBack && !this.prevInput.dashBack,
      // Requirement 15's juggle burst - block is still LEVEL-read everywhere
      // else in this file (the ordinary block/blockLow stance below never
      // switches to edge-triggering), this is purely an ADDITIONAL edge
      // reading of the exact same derived `holdingBack` value, used only by
      // the burst check at the top of the "juggled" branch - a player has to
      // actually tap back fresh while airborne, not just already be holding
      // it down for an unrelated reason from before the launch connected.
      block: holdingBack && !this.prevInput.block,
    };
    this.prevInput = {
      light: input.light,
      medium: input.medium,
      heavy: input.heavy,
      slide: input.slide,
      special: input.special,
      jump: input.jump,
      dashForward: input.dashForward,
      dashBack: input.dashBack,
      block: holdingBack,
    };

    // Ages the buffer down every real tick this runs on - including
    // hitstop-frozen ticks - so the window is measured against real
    // elapsed frames, not just frames the state machine happened to be free
    // to act on. That's what keeps this from ever turning into an
    // indefinite queue.
    if (this.bufferTtl > 0) {
      this.bufferTtl--;
      if (this.bufferTtl <= 0) this.bufferedAction = null;
    }
    // Same aging rule as bufferTtl above, kept as its own dedicated
    // countdown (see the constructor comment on burstBufferT) rather than
    // sharing BUFFERABLE_ACTIONS' single slot.
    if (this.burstBufferT > 0) this.burstBufferT--;
    if (justPressed.block) this.burstBufferT = INPUT_BUFFER_FRAMES;
    // A fresh press always overwrites whatever was previously buffered and
    // resets the window - latest press wins, checked in BUFFERABLE_ACTIONS
    // priority order so two buttons hit the same tick buffer the more
    // committal one.
    for (const action of BUFFERABLE_ACTIONS) {
      if (justPressed[action]) {
        this.bufferedAction = action;
        this.bufferTtl = INPUT_BUFFER_FRAMES;
        break;
      }
    }
    return justPressed;
  }

  // Non-consuming check - true if `action` is still live in the buffer.
  // Used ahead of a power-cost gate (see the special/dash/slide/kick
  // branches in update() below): those branches must NOT clear the buffer
  // via consumeBuffered() until they've confirmed the fighter can actually
  // afford the move, or a buffered press that arrives a frame before enough
  // power has regenerated would get silently eaten - the buffer cleared,
  // nothing happening, and the real press effectively lost - instead of
  // staying queued to retry on the next tick like an unbuffered fresh press
  // checked every frame would.
  hasBuffered(action) {
    return this.bufferedAction === action && this.bufferTtl > 0;
  }

  // Consumed from the free-to-act branch of update() below (ORed alongside
  // the real-time justPressed check) - treats a still-live buffered press
  // the same as a fresh edge, then clears it so it can't double-fire on a
  // later frame. Returns false (no side effect) if nothing buffered matches
  // `action`, so trying every action in turn is safe. Only call this once
  // the action is actually about to fire (see hasBuffered above for the
  // non-consuming pre-check power-gated branches need) - if the branch also
  // has a `&& this.power >= cost` guard, that guard must already be known
  // to pass before this runs, or a call here would consume the buffer even
  // when the move doesn't happen.
  consumeBuffered(action) {
    if (this.bufferedAction === action && this.bufferTtl > 0) {
      this.bufferedAction = null;
      this.bufferTtl = 0;
      return true;
    }
    return false;
  }

  // Called instead of update() for a hitstop-frozen frame (see game.js's
  // loop()) - keeps edge-detection/buffering alive so a press during the
  // freeze itself isn't silently lost, without touching state/stateT/
  // position/health at all, which is the entire point of the freeze.
  tickInputOnly(input) {
    this._trackInput(input);
  }

  // opponent (optional - callers with no opponent concept, if any ever show
  // up, still work fine) is accepted for pickAirAttackState below (see that
  // method's own comment for why it's currently unused there) - it never
  // affects hit detection, damage, or state timing, all of which stay
  // exactly the caller's own responsibility via attackHitbox()/checkHit
  // (game.js) same as before.
  update(input, opponent) {
    this.lastEvent = null;
    this.lastComboEnder = false;
    this.lastHitKind = null;
    this.lastHitWasSpike = false;
    const justPressed = this._trackInput(input);

    if (this.state === "ko") {
      this.stateT++;
      return;
    }

    this.stateT++;
    // Same countdown, same reasoning, for the juggle burst's own damage
    // immunity window (see BURST_IMMUNITY_FRAMES above).
    if (this.burstImmunityT > 0) this.burstImmunityT--;

    // Power slowly refills on its own except while in a kick-family pose -
    // jump is free (it's the dodge tool, including for the ranged special,
    // so it can't be gated behind a resource you might not have when you
    // need to dodge). KICK_POSES.includes (not a literal "kick" check) for
    // the same future-proofing reason every other KICK_POSES/PUNCH_POSES
    // call site in this file uses the list instead of a bare string compare.
    if (!KICK_POSES.includes(this.state)) {
      this.power = Math.min(MAX_POWER, this.power + PASSIVE_REGEN_PER_FRAME);
    }

    // Airborne juggle physics - see the big "Airborne juggle" comment block
    // above (near UPPERCUT) for the full design. Deliberately its own early-
    // return branch, same pattern as uppercut-charge just below, rather than
    // folded into the shared durations-map branch further down: exit
    // condition here is "gravity actually brought them back to the ground"
    // (a real physics predicate), not "stateT reached some fixed duration"
    // the way every state in that shared branch works, so it can't reuse
    // that machinery. No input is read at all - same as hitstun/knockback,
    // the defender is locked out for the whole time they're airborne, only
    // able to act again once they land (see the "knockback" landing-
    // recovery transition below).
    if (this.state === "juggled") {
      // Juggle burst (stage 4, requirement 15) - checked FIRST, ahead of the
      // ordinary gravity integration just below, so a successful burst this
      // tick fully replaces that tick's own physics rather than running both
      // (a burst that also fell a frame first would read as a stutter).
      // Reactive-only - this whole branch is only ever reachable while
      // genuinely "juggled" in the first place, so there's no way to throw
      // it out early/whiff it the way a real move could be. opponent (this
      // fighter's actual attacker in this exact matchup) is what
      // BURST_PUSHOUT's own direction is computed away from.
      if ((justPressed.block || this.burstBufferT > 0) && this.power >= BURST_COST) {
        this.burstBufferT = 0;
        this.spendPower(BURST_COST);
        this.juggleY = 0;
        this.juggleVY = 0;
        // A burst is never a spike, regardless of whether one was already
        // banked from an earlier hit this same sequence (see applyJuggleSpike
        // above) - escaping is a deliberate escape, not a slam, so it must
        // never inherit HARD_KNOCKDOWN_DURATION's much longer hold. This is
        // the one other explicit clear of both fields besides the ordinary
        // landing check right below and takeDamage's own slide/special
        // staleness guard.
        this.spiked = false;
        this.hardKnockdownFrames = null;
        // A clean escape, not a punish landed ON this fighter - the very
        // next hit that connects (on either side) should read as a fresh
        // count, not inherit whatever depth this juggle sequence had already
        // reached.
        this.comboCount = 0;
        // AWAY from the attacker, not toward - `|| -this.facing` only ever
        // matters in the (practically unreachable, since a juggle requires a
        // real launch that already moved this fighter off the opponent's own
        // x) degenerate case the two share an exact x.
        const pushDir = opponent ? Math.sign(this.x - opponent.x) || -this.facing : -this.facing;
        this.setState("knockback");
        this.setKnockbackMotion(pushDir, BURST_PUSHOUT);
        this.burstImmunityT = BURST_IMMUNITY_FRAMES;
        this.lastEvent = "juggle-burst";
        return;
      }
      // Counts every real tick of this entire juggle SEQUENCE, straight
      // through relaunches - unlike this.stateT (zeroed by every setState,
      // including the one applyJuggleLaunch itself calls on a relaunch),
      // this is exactly what MAX_JUGGLE_FRAMES needs to check against to be
      // a real, unconditional backstop. See its own comment above.
      this.juggleAirborneFrames++;
      this.juggleVY -= JUGGLE_GRAVITY;
      this.juggleY += this.juggleVY;
      if (this.juggleY <= 0) {
        this.juggleY = 0;
        this.juggleVY = 0;
        // Reuses the existing "knockback" pose/timer as the landing
        // recovery - a real hard-knockdown beat (this engine's own closest
        // thing to one already), not a straight-back-to-idle teleport, and
        // free (no new art/state-duration wiring needed): knockbackDir is
        // never set here, so the eased x-flight branch in the shared
        // durations block below (`if (this.state === "knockback" &&
        // this.knockbackDir)`) is simply never entered - this plays as a
        // pure landing-recovery hold in place, not a knockback slide.
        //
        // A SPIKED fall (see applyJuggleSpike/isJuggleSpike above) earns the
        // longer HARD_KNOCKDOWN_DURATION hold instead of this same branch's
        // usual plain fallback - `this.spiked` is consumed (reset false)
        // right here, the one and only read site, so it can never leak into
        // a later, unrelated ordinary landing. lastEvent fires exactly once,
        // the frame a spiked fall actually ends - see handleSounds in
        // game.js, which reacts to it with the real ground-impact shake/
        // thud/FX a slam this hard deserves, distinct from (and a beat
        // after) whatever hit did the spiking itself up in the air.
        const wasSpiked = this.spiked;
        this.hardKnockdownFrames = wasSpiked ? HARD_KNOCKDOWN_DURATION : null;
        this.spiked = false;
        if (this.hardKnockdownFrames) {
          this.lastEvent = "hard-knockdown-land";
          // Ender push-out (stage 4, requirement 10) - a spiked landing
          // (punchDown/finisher's own closer) composes the SAME real
          // horizontal shove every other ender-class hit gets (see
          // ENDER_PUSHOUT's own comment above) with this hold, instead of
          // just sitting still through the whole hard-knockdown recovery -
          // the attacker still has to walk/dash back across real ground to
          // keep pressuring after landing the slam that put them here. Away
          // from wherever the opponent actually is right now, same
          // reasoning the burst's own pushDir above uses.
          if (opponent) {
            const pushDir = Math.sign(this.x - opponent.x) || -this.facing;
            this.setKnockbackMotion(pushDir, ENDER_PUSHOUT);
          }
        }
        this.setState("knockback");
        return;
      }
      return;
    }

    // Air dash (stage 4, requirement 11) - forward chases a juggle, back
    // bails out. Deliberately its own early-return branch, same pattern as
    // "juggled" above/"uppercut-charge" below, rather than folded into the
    // grounded dash's own shared duration-map branch further down:
    // dashWasAirborne is what tells the two apart (only ever set true by the
    // air-dash entry points in the combined jump/air-attack branch below,
    // always false for a grounded dash) and a grounded dash always returns
    // straight to "idle", while this one has to keep draining the SAME
    // airborneT flight budget the surrounding jump was already using (see
    // that field's own constructor comment) and hand control back to "jump"
    // if there's still airtime left when the burst ends - exactly the same
    // "still airborne? return to jump, not idle" rule airKick/flyingKick's
    // own exit already follows - never landing early just because this
    // particular pose's own short timer ran out.
    if (this.state === "dash" && this.dashWasAirborne) {
      this.airborneT++;
      // Same eased-burst motion the grounded dash branch below uses -
      // duplicated here (not shared via a helper) since this branch's own
      // exit condition/return-to-jump logic is otherwise entirely different
      // from that branch's plain "hit duration, go to idle" shape.
      if (this.dashDir) {
        const t = Math.min(1, this.stateT / DASH_DURATION);
        const eased = 1 - (1 - t) * (1 - t);
        this.x = Math.max(
          ARENA_MIN_X,
          Math.min(ARENA_MAX_X, this.dashStartX + this.dashDir * DASH_DISTANCE * eased),
        );
      }
      if (this.stateT >= DASH_DURATION) {
        const stillAirborne = this.airborneT < JUMP_DURATION;
        this.dashWasAirborne = false;
        this.setState(stillAirborne ? "jump" : "idle");
        if (!stillAirborne) {
          this.airKickChainIndex = 0;
        }
      }
      return;
    }

    // Held to charge, released to launch - freezes on the wind-up's very
    // first frame for as long as the key is down, so an anti-air can
    // actually be timed against an opponent's jump instead of committing
    // the instant the key is pressed. Resetting stateT back to 0 every
    // frame (rather than skipping the increment above) is what keeps
    // body.js's frame lookup pinned to frame 0 the whole time.
    if (this.state === "uppercut-charge") {
      if (input.uppercut) {
        this.stateT = 0;
        return;
      }
      this.setState("uppercut");
      this.lastEvent = "uppercut-start";
      return;
    }

    // slide and uppercut both hold their pose/travel on their own timers -
    // game.js's updateSlide/checkUppercutHit own the actual x movement and
    // hit detection for them, this just counts down back to idle. knockback
    // is never entered via input at all (see takeDamage), only ever reached
    // by getting hit by a slide.
    if (["punch1", "punch3", "crouchPunch", "crouchPunchHeavy", "kick", "crouchKick", "special", "finisherPunch", "hitstun", "slide", "knockback", "uppercut", "dash"].includes(this.state)) {
      const durations = {
        punch1: LIGHT_ATTACK.duration,
        punch3: HEAVY_ATTACK.duration,
        crouchPunch: CROUCH_LIGHT.duration,
        crouchPunchHeavy: CROUCH_HEAVY.duration,
        kick: MEDIUM_ATTACK.duration,
        crouchKick: CROUCH_MEDIUM.duration,
        special: SPECIAL.duration,
        // The finisher macro (Heavy + Special held together) always resolves
        // into this one pose now - see the finisher-macro branch above.
        finisherPunch: JUGGLE_FINISHER.duration,
        // Scaled per-hit by takeDamage (see this.hitstunFrames there) - a
        // jab locks the defender out for far less than an uppercut/special
        // does. HITSTUN_FRAMES is only ever the fallback for the
        // (unreachable in normal play) case nothing set it yet.
        hitstun: this.hitstunFrames ?? HITSTUN_FRAMES,
        slide: SLIDE.duration,
        // this.hardKnockdownFrames is only ever non-null for the frames
        // right after a spiked juggle lands (see the "juggled" branch's own
        // landing check above, and takeDamage's slide branch below for the
        // only other place this ever gets explicitly cleared back to null) -
        // falls back to the plain constant for every ordinary knockback (a
        // ground slide hit, or a juggle that fell out without ever being
        // spiked).
        knockback: this.hardKnockdownFrames ?? KNOCKBACK_DURATION,
        uppercut: UPPERCUT.duration,
        dash: DASH_DURATION,
      };
      // Fires exactly once, the frame the cast animation completes - this is
      // what game.js listens for to actually spawn the projectile.
      if (this.state === "special" && this.stateT === SPECIAL.release) {
        this.lastEvent = "special-release";
      }
      // Real launch-and-land flight instead of the old instant teleport -
      // eased out (fast launch, decelerating into the landing) toward the
      // total distance set by setKnockbackMotion, driven off absolute t so
      // there's no drift/accumulation error frame to frame.
      if (this.state === "knockback" && this.knockbackDir) {
        const t = Math.min(1, this.stateT / KNOCKBACK_DURATION);
        const eased = 1 - (1 - t) * (1 - t);
        this.x = Math.max(
          ARENA_MIN_X,
          Math.min(ARENA_MAX_X, this.knockbackStartX + this.knockbackDir * this.knockbackTotal * eased),
        );
      }
      // Same eased-burst shape as knockback's flight above, just player-
      // initiated instead of a hit reaction - see the dash entry point below
      // for where dashStartX/dashDir get set.
      if (this.state === "dash" && this.dashDir) {
        const t = Math.min(1, this.stateT / DASH_DURATION);
        const eased = 1 - (1 - t) * (1 - t);
        this.x = Math.max(
          ARENA_MIN_X,
          Math.min(ARENA_MAX_X, this.dashStartX + this.dashDir * DASH_DISTANCE * eased),
        );
      }
      // Ground finisher's own "Scorpion pull" gap-close (requirement 9) - the
      // first JUGGLE_FINISHER.gapCloseFrames ticks of the finisher pose
      // lerp this.x toward the OPPONENT's current x (re-read fresh every
      // tick, not a fixed distance snapshotted once at entry the way
      // knockback/dash's own eased bursts above are - a juggled opponent's
      // own x is otherwise frozen, see the "juggled" branch far above, so
      // this is what actually walks the attacker underneath them instead of
      // whiffing a fixed-range hitbox thrown from wherever the arm-window
      // press happened to land). `remaining` shrinks by exactly 1 every
      // tick, so this converges to (opponent.x - facing*40) precisely by the
      // gapCloseFrames'th tick regardless of how far away the attacker
      // started - same one-way-door math a converging lerp always uses,
      // just spelled out per-tick instead of pre-computing a fixed eased
      // curve, since the target itself can still move underneath it.
      if (this.state === "finisherPunch" && this.stateT <= JUGGLE_FINISHER.gapCloseFrames && opponent) {
        const targetX = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, opponent.x - this.facing * 40));
        const remaining = JUGGLE_FINISHER.gapCloseFrames - this.stateT + 1;
        this.x = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, this.x + (targetX - this.x) / remaining));
      }
      // Cancel check - see CANCEL_ROUTES/CANCEL_WINDOWS above for the full
      // route graph and window math. CANCEL_WINDOWS[this.state] is undefined
      // for every state that flows through this same shared branch but isn't
      // a cancelable grounded attack (special/finisherPunch/hitstun/
      // knockback/dash) - this whole block is a no-op for those, same
      // as it always was before cancels existed. Three checks now instead of
      // one: the string continuation into Medium/Heavy (the actual DBFZ-style
      // auto-combo body) is checked FIRST, edge-triggered/buffered the exact
      // same way every neutral entry point in this file already reads its
      // own button, so a real, held-down-for-a-beat opponent-facing press
      // still lands even if it arrives a couple frames before the window
      // opens (see hasBuffered's own comment above) - then the pre-existing
      // launcher bail into uppercut-charge, unchanged from before this phase.
      const cancelWindow = CANCEL_WINDOWS[this.state];
      if (cancelWindow && this.stateT >= cancelWindow.start && this.stateT <= cancelWindow.end) {
        const routes = CANCEL_ROUTES[this.state] || [];
        // Light -> Medium (punch1 -> kick) and Medium -> Heavy (kick ->
        // punch3) both spend/gate off MEDIUM_ATTACK.cost exactly like
        // Medium's own neutral entry point does above (currently 0, kept as
        // a real gate for whenever it's re-tuned) - consumeBuffered only
        // once the power check has actually passed, same
        // hasBuffered/consumeBuffered split every other power-gated action
        // in this file uses so an unaffordable press stays queued to retry
        // next tick instead of being eaten for nothing.
        if (routes.includes("medium") && (justPressed.medium || this.hasBuffered("medium")) && this.power >= MEDIUM_ATTACK.cost) {
          this.consumeBuffered("medium");
          this.spendPower(MEDIUM_ATTACK.cost);
          this.setState(MEDIUM_ATTACK.state);
          return;
        }
        // Light -> Heavy (the skip-Medium shorter route) and Medium -> Heavy
        // both land here - Heavy is free (HEAVY_ATTACK.cost 0), same as its
        // own neutral entry point above, so no power gate to check.
        if (routes.includes("heavy") && (justPressed.heavy || this.consumeBuffered("heavy"))) {
          this.setState(HEAVY_ATTACK.state);
          return;
        }
        // Not edge-triggered/buffered, same as every other uppercut check in
        // this file (see INPUT_BUFFER_FRAMES above) - holding it is the real
        // charge mechanic, so this cancels straight into "uppercut-charge"
        // exactly like the neutral entry point does, not directly into
        // "uppercut" itself.
        if (routes.includes("uppercut") && input.uppercut && this.power >= UPPERCUT.cost) {
          this.spendPower(UPPERCUT.cost);
          this.setState("uppercut-charge");
          return;
        }
      }
      if (this.stateT >= durations[this.state]) this.setState("idle");
      return;
    }

    // Jump + the two aerial-attack poses share one branch, same pattern as
    // "juggled" above getting its own early return instead of the shared
    // durations-map branch - all three need airborneT's own real-flight-time
    // logic (see its constructor comment), not a fixed-duration lookup keyed
    // off stateT the way every grounded attack pose is.
    if (this.state === "jump" || this.state === "airKick" || this.state === "flyingKick" || AIR_PUNCH_STATES.includes(this.state)) {
      // One tick of real airtime, regardless of which of these states this
      // is - a fighter thrusting into an air attack mid-jump hasn't touched
      // the ground, so their total flight budget (JUMP_DURATION) keeps
      // draining exactly like it would if they'd just kept falling. Backward
      // jump (requirement 11, this.jumpBack - see the jump-entry point below
      // for how it's decided) drains it a little FASTER (1.25x) - the whole
      // point of a back-jump is a quicker, shorter escape hop, not the same
      // full hang time a forward/neutral jump gets.
      this.airborneT += this.jumpBack ? 1.25 : 1;

      if (this.state === "jump") {
        this.applyMove(input);
        // Backward jump's own locked baseline drift (requirement 11) - a
        // small constant push AWAY from the facing direction every tick,
        // layered on top of whatever applyMove's own left/right input already
        // did, so even a neutral (no held direction) back-jump still visibly
        // carries the fighter backward through the air, not just up and
        // straight back down in place.
        if (this.jumpBack) {
          this.x = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, this.x - this.facing * 2));
        }
        // Air dash (requirement 11) - same two edge-triggered checks the
        // grounded neutral branch below uses, gated the same
        // justPressed-or-buffered-and-affordable way every other power-gated
        // aerial action in this same "jump" sub-block already is (see the
        // air-kick check just below). dashWasAirborne is what the dedicated
        // early-return branch above reads to keep draining airborneT and
        // hand control back to "jump" instead of returning straight to
        // "idle" the way a grounded dash does.
        if ((justPressed.dashForward || this.hasBuffered("dashForward")) && this.power >= DASH_COST) {
          this.consumeBuffered("dashForward");
          this.spendPower(DASH_COST);
          this.dashDir = this.facing;
          this.dashStartX = this.x;
          this.dashWasAirborne = true;
          this.setState("dash");
          this.lastEvent = "dash-start";
          return;
        }
        if ((justPressed.dashBack || this.hasBuffered("dashBack")) && this.power >= DASH_COST) {
          this.consumeBuffered("dashBack");
          this.spendPower(DASH_COST);
          this.dashDir = -this.facing;
          this.dashStartX = this.x;
          this.dashWasAirborne = true;
          this.setState("dash");
          this.lastEvent = "dash-start";
          return;
        }
        // The actual aerial-attack input: a real, move-specific hitbox (see
        // AIR_MEDIUM above and checkAirAttackHit in game.js), not a cosmetic
        // reskin of the grounded kick - costs its own power, has its own
        // active-frame window, and is what lets the attacker follow a
        // launched opponent into the air to extend a juggle (see
        // takeDamage's launch-routing below) as well as functioning as a
        // standalone jump-in against a grounded opponent. Bound to Medium -
        // this is the kick-family aerial attack, same family split
        // LIGHT_ATTACK/MEDIUM_ATTACK/HEAVY_ATTACK use on the ground.
        // Buffered/hasBuffered the same way every other power-gated attack in
        // this file already is (see INPUT_BUFFER_FRAMES above) - a press a
        // couple frames before the jump animation itself starts, or before
        // enough power has regenerated, still fires the instant this branch
        // can honor it instead of being silently dropped.
        if ((justPressed.medium || this.hasBuffered("medium")) && this.power >= AIR_MEDIUM.cost) {
          this.consumeBuffered("medium");
          this.spendPower(AIR_MEDIUM.cost);
          this.setState(this.pickAirAttackState(opponent));
          this.lastEvent = "air-attack-start";
          return;
        }
        // Aerial Light/Heavy/finisher - bound to the SAME Light/Heavy buttons
        // the grounded ladder uses (see LIGHT_ATTACK/HEAVY_ATTACK above),
        // matching real fighting-game convention that the button doesn't
        // change per stance, only which move comes out (same reasoning
        // block-on-back already applies regardless of grounded/crouching/
        // airborne stance - see isHoldingBack above). AIR_FINISHER (the old
        // chain's overhead-slam ender, requirement 2's "slam ends the
        // juggle") is checked FIRST, gated on crouch (down) being held - see
        // that constant's own comment above for why a modifier+button input
        // replaces its old press-count gate now that there's no more chain to
        // build up. Falls through to the plain AIR_LIGHT entry when crouch
        // isn't held, or when it IS held but the fighter can't afford the
        // finisher (hasBuffered("light") still needs to retry as ordinary
        // AIR_LIGHT next tick rather than being eaten for nothing - same
        // reasoning every other power-gated hasBuffered/consumeBuffered split
        // in this file already follows).
        if (input.crouch && justPressed.light && this.power >= AIR_FINISHER.cost) {
          this.spendPower(AIR_FINISHER.cost);
          this.setState(AIR_FINISHER.state);
          this.lastEvent = "air-attack-start";
          return;
        }
        if ((justPressed.light || this.hasBuffered("light")) && this.power >= AIR_LIGHT.cost) {
          this.consumeBuffered("light");
          this.spendPower(AIR_LIGHT.cost);
          this.setState(AIR_LIGHT.state);
          this.lastEvent = "air-attack-start";
          return;
        }
        // AIR_HEAVY - the old chain's own 3rd hit, now a real button of its
        // own straight from a fresh jump (see AIR_HEAVY's own comment above).
        // Heavy previously had no aerial binding at all; this closes that gap
        // now that Light/Medium/Heavy each need a real stance-independent
        // counterpart.
        if ((justPressed.heavy || this.hasBuffered("heavy")) && this.power >= AIR_HEAVY.cost) {
          this.consumeBuffered("heavy");
          this.spendPower(AIR_HEAVY.cost);
          this.setState(AIR_HEAVY.state);
          this.lastEvent = "air-attack-start";
          return;
        }
        // The homing aerial special - see AIR_SPECIAL's own comment above
        // for why this fires instantly (no pose change, no `return`-into-a-
        // new-state) rather than following the kick/punch branches' pattern
        // just above. Deliberately falls through to the shared
        // stillAirborne/landing logic right below instead of returning
        // early - casting mid-flight must not skip the "did this jump's
        // airtime just run out" check the same way throwing nothing at all
        // wouldn't skip it either.
        //
        // Requirement 8's grab economy: the ELIGIBILITY check (not the real
        // spend, which stays AIR_SPECIAL.cost either way - see
        // spendPower below) is gated behind a higher power floor
        // (AIR_SPECIAL_REGRAB_MIN_POWER) once this fighter has already
        // grabbed the opponent's CURRENT juggle sequence at least once
        // (this.juggleGrabsUsed >= 1, see game.js's applyHomingHit for where
        // that increments, and checkUppercutHit for where it resets on a
        // fresh launch) - a real banked-power requirement for a second/
        // third grab, not just a flat higher price.
        const isRegrab = opponent && opponent.state === "juggled" && this.juggleGrabsUsed >= 1;
        const requiredPower = isRegrab ? AIR_SPECIAL_REGRAB_MIN_POWER : AIR_SPECIAL.cost;
        if ((justPressed.special || this.hasBuffered("special")) && this.power >= requiredPower) {
          this.consumeBuffered("special");
          this.spendPower(AIR_SPECIAL.cost);
          this.lastEvent = "air-special-release";
        }
      }

      // Whether there's still real flight time left in this jump/juggle-
      // chase - used both to decide when a plain jump lands AND, below, to
      // decide whether an air attack's own pose should hand control back to
      // "jump" (still airborne, can keep drifting/attacking again) or
      // straight to "idle" (out of airtime, the fall is over) once its own
      // hold finishes.
      const stillAirborne = this.airborneT < JUMP_DURATION;
      if (this.state === "jump") {
        if (!stillAirborne) {
          this.setState("idle");
          // Landed - a fresh jump gets a fresh aerial pose cycle (see
          // airKickChainIndex's own constructor comment); also reset at
          // fresh-jump entry below, belt-and-suspenders - a fresh jump always
          // opens back on airKick, never picks up flyingKick from a previous
          // flight.
          this.airKickChainIndex = 0;
        }
        return;
      }

      // airKick/flyingKick/AIR_LIGHT/AIR_HEAVY/AIR_FINISHER: held for the
      // move's own fixed pose duration (AIR_ATTACK_STATE_DURATIONS[this.state])
      // regardless of whether it actually connected - hasHit only ever gates
      // a SECOND hit from the same active window (see attackHitbox's own
      // equivalent gate for grounded punch/kick), never the pose's own
      // timing, so a whiffed air attack recovers on exactly the same clock a
      // landed one does and can never leave the attacker stuck mid-animation
      // waiting on something that isn't coming.
      if (this.stateT >= (AIR_ATTACK_STATE_DURATIONS[this.state] ?? AIR_MEDIUM.duration)) {
        this.setState(stillAirborne ? "jump" : "idle");
        if (!stillAirborne) {
          this.airKickChainIndex = 0;
        }
      }
      return;
    }

    // Block-on-back (per-frame, no dedicated button) - see isHoldingBack
    // above for the facing-relative "away from the opponent" math this reads.
    // Computed once here, reused by both the state-exit checks immediately
    // below and the state-entry checks right after them, so the two can never
    // disagree about what "still holding back" means this tick.
    const holdingBack = this.isHoldingBack(input);
    if (this.state === "block" && !holdingBack) {
      this.setState("idle");
    }
    if (this.state === "blockLow" && !(holdingBack && input.crouch)) {
      this.setState("idle");
    }
    if (this.state === "crouch" && !input.crouch) {
      this.setState("idle");
    }

    // Crouching guard - the other half of the high/low mixup (see
    // takeDamage's block gate below for what it actually stops). Holding
    // back AND crouch together reads as this dedicated stance rather than
    // just standing block ignoring the crouch input, so it's checked ahead
    // of the plain block branch below - same input-priority pattern that
    // branch already used against a simultaneous attack input (holding guard
    // suppresses everything else, nothing new here). Reuses body.js's
    // existing "crouch" sheet/head-anchors for rendering (see body.js's own
    // ANIMS.blockLow comment) - no new art needed, only a real second guard
    // state with its own block-gate behavior.
    if (holdingBack && input.crouch) {
      if (this.state !== "blockLow") this.setState("blockLow");
      return;
    }
    // Holding back with no crouch - standing guard. Neither this nor the
    // blockLow branch above ever runs applyMove (both return before reaching
    // it further down) - per the reference control scheme this replaces
    // ("Move backward = High guard"), holding back is ALWAYS a stationary
    // guard, never a backward walk. A player who wants to retreat without
    // guarding simply can't with this scheme - that trade-off is the whole
    // point of tying block to back instead of a dedicated button.
    if (holdingBack) {
      if (this.state !== "block") this.setState("block");
      return;
    }
    // Crouch locks you in place - no shuffling while ducked, and it doesn't
    // engage over any actual attack/jump input.
    if (
      input.crouch &&
      !input.light &&
      !input.medium &&
      !input.heavy &&
      !input.special &&
      !input.jump &&
      !input.slide &&
      !input.uppercut &&
      !input.dashForward &&
      !input.dashBack
    ) {
      if (this.state !== "crouch") this.setState("crouch");
      return;
    }
    // Every check below is ORed with a buffer check - a press that landed up
    // to INPUT_BUFFER_FRAMES ago, while the fighter was still locked in an
    // attack/hitstun/etc, fires the instant control actually returns here
    // instead of having been silently dropped. Medium is the one of the
    // three gated by a power cost (kick-family, same as the old kick chain's
    // own opening hit always was - see MEDIUM_ATTACK above) and uses the
    // non-consuming hasBuffered() for the OR, only calling consumeBuffered()
    // once the cost check has already passed - if a buffered press consumed
    // (cleared) the buffer before the cost check, a press that arrives a
    // frame or two before enough power has regenerated would be eaten for
    // nothing instead of staying queued to retry next tick, same as an
    // unbuffered fresh press checked every frame would. jump/Light/Heavy have
    // no cost gate, so consumeBuffered() (which is a no-op returning false if
    // nothing of that exact action is buffered) is safe to call directly in
    // the OR.
    // Ground finisher macro (formalized as a real 2-button HOLD - see
    // JUGGLE_FINISHER's own comment above for the move's full design). Used
    // to be an order-dependent "hold special, THEN press Light/Medium within
    // an 8-frame window" chord - a genuine execution trap (get the order or
    // the window wrong and it just threw a plain special instead), exactly
    // the kind of complex simultaneous press the reference control material
    // this session's own instructions point at says belongs on a deliberate
    // held combination instead. Heavy + Special replaces it: two buttons a
    // player just holds together, order-agnostic - MUST be checked before
    // both the plain special branch below AND the standing Heavy entry much
    // further down, for the same reason the old design had to intercept
    // ahead of the plain special branch: whichever button's own neutral
    // entry point ran first would otherwise commit to its own ordinary move
    // before the other button could ever join it.
    //
    // Whichever of the two is pressed first arms a short grace window
    // (FINISHER_MACRO_GRACE_FRAMES) for its partner to join - the same
    // "absorb a few frames of real human press jitter" idea every fighting
    // game's own simultaneous-press detection already relies on (two
    // fingers landing on two different buttons "at the same time" are
    // rarely on the literal same input frame), not a second discrete
    // decision the player has to get right. If the partner never joins (or
    // the arming button gets released, or the opponent simply lands out of
    // the juggle first), this falls back to whichever single move the
    // arming button would have thrown on its own - a player who wasn't
    // actually going for the macro never loses their real input, it just
    // resolves a few frames later than an unbuffered press would have.
    // Gated on JUGGLE_FINISHER.cost specifically (not the cheaper
    // SPECIAL.cost) up front, same reasoning the old arm-window used -
    // arming for a finisher that can't actually be afforded would just be a
    // more confusing way to whiff.
    if (this.finisherMacroGraceT > 0) {
      this.finisherMacroGraceT--;
      if (input.heavy && input.special && this.power >= JUGGLE_FINISHER.cost) {
        this.finisherMacroGraceT = 0;
        this.finisherMacroArmedBy = null;
        this.spendPower(JUGGLE_FINISHER.cost);
        this.setState("finisherPunch");
        this.lastEvent = "finisher-start";
        return;
      }
      // Still worth waiting only while the button that armed this IS still
      // physically held AND the opponent is still airborne to grab - the
      // instant either goes false, or this countdown itself simply runs
      // out, the window closes. A released arming button is ITSELF a
      // closing condition, not a reason to abandon the fallback below (same
      // "gate the fallback on cost, never on the live button level" fix the
      // old single-button arm window needed - a quick tap-and-release well
      // within the grace window must still resolve into that button's own
      // ordinary move, not get silently eaten).
      const armingButtonStillHeld = this.finisherMacroArmedBy === "heavy" ? input.heavy : input.special;
      const stillWorthWaiting = armingButtonStillHeld && opponent && opponent.state === "juggled" && this.finisherMacroGraceT > 0;
      if (!stillWorthWaiting) {
        const armedBy = this.finisherMacroArmedBy;
        this.finisherMacroGraceT = 0;
        this.finisherMacroArmedBy = null;
        if (armedBy === "heavy") {
          this.setState(HEAVY_ATTACK.state);
          return;
        }
        // armedBy === "special"
        if (this.power >= SPECIAL.cost) {
          this.spendPower(SPECIAL.cost);
          this.setState("special");
          this.lastEvent = "special-start";
        }
        return;
      }
      // Still armed, still worth it - eat this tick entirely rather than
      // falling through to any of the checks below while waiting.
      return;
    }
    if ((justPressed.heavy || justPressed.special) && opponent && opponent.state === "juggled" && this.power >= JUGGLE_FINISHER.cost) {
      // Both landed on the exact same tick - a real simultaneous hold, no
      // need to even arm a grace window for it.
      if (input.heavy && input.special) {
        this.spendPower(JUGGLE_FINISHER.cost);
        this.setState("finisherPunch");
        this.lastEvent = "finisher-start";
        return;
      }
      // Arm instead of firing immediately - see the finisherMacroGraceT
      // branch above for what happens on every following tick. Deliberately
      // does NOT spend power or consume any input buffer yet - arming isn't
      // a commitment on its own, only actually throwing the finisher or the
      // arming button's own fallback move is.
      this.finisherMacroArmedBy = justPressed.heavy ? "heavy" : "special";
      this.finisherMacroGraceT = FINISHER_MACRO_GRACE_FRAMES;
      return;
    }
    if ((justPressed.special || this.hasBuffered("special")) && this.power >= SPECIAL.cost) {
      this.consumeBuffered("special");
      this.spendPower(SPECIAL.cost);
      // Archetype specials rework (stage 3, requirement 6) - every archetype
      // now shares this exact same ranged-cast state; see spawnProjectile in
      // game.js for which of the two existing projectiles (bolt vs rat rush)
      // actually spawns off the back of it per archetype.
      this.setState("special");
      this.lastEvent = "special-start";
      return;
    }
    if (justPressed.jump || this.consumeBuffered("jump")) {
      // Fresh flight - see airborneT's own constructor comment for why this
      // is the ONLY place it ever resets (every other touch of it, in the
      // combined jump/airKick/flyingKick branch above, only ever increments
      // it - an air attack thrown mid-flight must keep draining the SAME
      // flight budget, not reset it back to a fresh full jump's worth of
      // airtime for free).
      this.airborneT = 0;
      // Backward jump (requirement 11) - decided once, right here, off
      // whichever direction was actually held the instant the jump was
      // pressed (not re-read again for the rest of the flight - the combined
      // jump/air-attack branch above only ever reads this.jumpBack, never
      // input.left/right directly). AWAY from the opponent specifically, not
      // just "held left" - which physical key that means depends on which
      // side of the arena this fighter is currently standing on. Neutral (no
      // direction held) or held TOWARD the opponent both read as a normal
      // jump (jumpBack stays false) - only a direction that's unambiguously
      // pointing away counts. towardSign === 0 (exact same x - vanishingly
      // rare, but possible right as the pair crosses) also falls back to a
      // normal jump rather than guessing.
      const heldDir = input.left ? -1 : input.right ? 1 : 0;
      const towardSign = opponent ? Math.sign(opponent.x - this.x) : 0;
      this.jumpBack = heldDir !== 0 && towardSign !== 0 && heldDir !== towardSign;
      // A fresh jump always starts a fresh aerial pose cycle - see
      // airKickChainIndex's own constructor comment. Already reset on the
      // PREVIOUS jump's own landing (see the combined jump/air-attack
      // branch above); reset again here too, belt-and-suspenders, so a
      // stale index can never survive into a new jump no matter which path
      // got this fighter back to "idle" in between.
      this.airKickChainIndex = 0;
      this.setState("jump");
      this.lastEvent = "jump-start";
      return;
    }
    // Standing dash - forward burns toward the opponent (this.facing),
    // back burns away from them - two discrete, edge-triggered buttons now
    // (requirement 11), not one action plus a held-direction read at
    // activation time the way the old single "dash" worked. dashWasAirborne
    // explicitly reset false on both entry points - belt-and-suspenders
    // against a stale `true` somehow surviving from an earlier air dash into
    // this fresh GROUND one, which would otherwise misroute this dash into
    // the airborne early-return branch above instead of the ordinary
    // grounded shared duration-map branch below.
    if ((justPressed.dashForward || this.hasBuffered("dashForward")) && this.power >= DASH_COST) {
      this.consumeBuffered("dashForward");
      this.spendPower(DASH_COST);
      this.dashDir = this.facing;
      this.dashStartX = this.x;
      this.dashWasAirborne = false;
      this.setState("dash");
      this.lastEvent = "dash-start";
      return;
    }
    if ((justPressed.dashBack || this.hasBuffered("dashBack")) && this.power >= DASH_COST) {
      this.consumeBuffered("dashBack");
      this.spendPower(DASH_COST);
      this.dashDir = -this.facing;
      this.dashStartX = this.x;
      this.dashWasAirborne = false;
      this.setState("dash");
      this.lastEvent = "dash-start";
      return;
    }
    if (input.uppercut && this.power >= UPPERCUT.cost) {
      // Not edge-triggered - holding this is the actual charge mechanic
      // (see the uppercut-charge branch above), not something to spam, and
      // deliberately not buffered either (see INPUT_BUFFER_FRAMES above).
      // Cost is spent on commit (entering the charge), same as kick/slide/
      // special all spend on their own activation - getting hit out of the
      // charge still cost the power, same as whiffing a kick would.
      this.spendPower(UPPERCUT.cost);
      this.setState("uppercut-charge");
      return;
    }
    if ((justPressed.slide || this.hasBuffered("slide")) && this.power >= SLIDE.cost) {
      this.consumeBuffered("slide");
      this.spendPower(SLIDE.cost);
      this.setState("slide");
      this.lastEvent = "slide-start";
      return;
    }
    // Crouching Light - checked BEFORE the standing Light entry below, same
    // input-priority pattern the crouching-guard branch above already uses
    // (holding a modifier changes what a following press does). Preserves
    // the old crouch+punch behavior 1:1 (Light is the punch-family
    // descendant of the old bare "punch" button) - free (no power cost, no
    // special gate - see CROUCH_LIGHT above).
    if (input.crouch && justPressed.light) {
      this.setState(CROUCH_LIGHT.state);
      return;
    }
    // Crouching Medium - same input-priority pattern as crouching Light just
    // above, preserving the old crouch+kick behavior 1:1 (Medium is the sole
    // kick-family button, so it's the one crouch entry that reports its own
    // "crouchKick" kind rather than folding into "punch" - see attackHitbox
    // below). Free (see CROUCH_MEDIUM above - no power cost, no special
    // gate).
    if (input.crouch && justPressed.medium) {
      this.setState(CROUCH_MEDIUM.state);
      return;
    }
    // Crouching Heavy - same input-priority pattern, and the one genuinely
    // NEW crouch entry this phase adds (see CROUCH_HEAVY's own comment above
    // for why the old two-move crouch system never had a third slot). Still
    // punch-family (kind "punch", see attackHitbox below) - crouching never
    // changes what a punch-family hit is stopped by, only which pose throws
    // it. Free, same shape as CROUCH_LIGHT/CROUCH_MEDIUM above.
    if (input.crouch && justPressed.heavy) {
      this.setState(CROUCH_HEAVY.state);
      return;
    }
    // Light attack - direct entry from neutral, no chain index to maintain
    // (see LIGHT_ATTACK above - a single fixed move now, not chain index 0
    // of three). Free, same as it always was.
    if (justPressed.light || this.consumeBuffered("light")) {
      this.setState(LIGHT_ATTACK.state);
      return;
    }
    // Medium attack - kick-family, power-gated the same shape every other
    // power-gated action in this file follows (hasBuffered/consumeBuffered
    // split, not an unconditional consume - an unaffordable press must stay
    // queued to retry next tick rather than being eaten for nothing, see
    // hasBuffered's own comment above). Currently free (MEDIUM_ATTACK.cost is
    // 0, same as Light/Heavy) but keeps the real gate structure for whenever
    // it's re-tuned, same convention the old kick chain's own entry point
    // already followed.
    if (justPressed.medium || this.hasBuffered("medium")) {
      if (this.power >= MEDIUM_ATTACK.cost) {
        this.consumeBuffered("medium");
        this.spendPower(MEDIUM_ATTACK.cost);
        this.setState(MEDIUM_ATTACK.state);
        return;
      }
    }
    // Heavy attack - direct entry from neutral, same shape as Light above
    // (punch-family, free, no chain index). Reachable straight from neutral
    // now instead of only after landing two prior chain hits.
    if (justPressed.heavy || this.consumeBuffered("heavy")) {
      this.setState(HEAVY_ATTACK.state);
      return;
    }

    const vx = this.applyMove(input);
    this.state = vx !== 0 ? "walk" : "idle";
  }

  // Collision (keeping the two fighters from ever overlapping) is resolved
  // symmetrically by the caller after both fighters have moved - see
  // resolveCollision in game.js. Doing it here per-fighter, keyed off each
  // one's own static facing, didn't account for the opponent's own movement
  // and could still let them slide past each other.
  applyMove(input) {
    const speed = MOVE_SPEED * this.archetype.speedMult;
    let vx = 0;
    if (input.left) vx -= speed;
    if (input.right) vx += speed;
    this.x += vx;
    this.x = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, this.x));
    return vx;
  }

  // Which of the two identically-statted aerial poses to throw - purely
  // cosmetic (see AIR_MEDIUM's own comment for why there's only one real
  // move spec behind both; both currently render via the same reused "kick"
  // sheet in body.js regardless of which is picked). Cycles by PRESS COUNT
  // this same airtime now (airKickChainIndex, reset on landing/fresh jump -
  // see that field's own constructor comment) rather than reading the
  // opponent's juggle state: the first air-kick press of a jump is always
  // "airKick", the plain jump-in read; any press after that, same airtime,
  // reads as the more committed "diving after them" flyingKick regardless of
  // what the opponent is doing. opponent is accepted (and still passed by
  // every call site) purely so a later pass could reintroduce a situational
  // read here without touching call sites, but is deliberately unused today.
  pickAirAttackState(_opponent) {
    const state = this.airKickChainIndex === 0 ? "airKick" : "flyingKick";
    this.airKickChainIndex++;
    return state;
  }

  // Covers real jump, uppercut's own (shorter) rise, knockback's launch arc,
  // and (new) the juggled state's own real physics - body.js's draw code
  // stays untouched either way and just reads one property regardless of
  // which move/state it is.
  get jumpOffset() {
    // jump/airKick/flyingKick all sample the SAME parabola off airborneT
    // (not stateT) - see airborneT's own constructor comment for why: an air
    // attack resets stateT (setState does that on every transition) but must
    // NOT restart the height arc, or the sprite would visibly snap back to
    // ground level the instant a jump-kick was thrown, then jump back up to
    // a fresh full-height arc once "jump" resumed after it. One continuous
    // flight, one continuous formula, sourced from the one counter that
    // actually persists across the whole thing.
    if (
      this.state === "jump" ||
      this.state === "airKick" ||
      this.state === "flyingKick" ||
      AIR_PUNCH_STATES.includes(this.state) ||
      (this.state === "dash" && this.dashWasAirborne)
    ) {
      const t = Math.min(1, this.airborneT / JUMP_DURATION);
      return JUMP_HEIGHT * 4 * t * (1 - t);
    }
    if (this.state === "uppercut") {
      const t = Math.min(1, this.stateT / UPPERCUT.duration);
      return UPPERCUT.height * 4 * t * (1 - t);
    }
    if (this.state === "knockback") {
      const t = Math.min(1, this.stateT / KNOCKBACK_DURATION);
      return KNOCKBACK_ARC_HEIGHT * 4 * t * (1 - t);
    }
    // Unlike every branch above (a fixed-shape parabola sampled purely off
    // stateT/a known total duration), juggleY is a REAL simulated value,
    // integrated tick by tick in update()'s own "juggled" branch off actual
    // velocity/gravity - it has no fixed total duration to sample against (a
    // relaunch can extend or shorten it), so this just reads whatever that
    // simulation's current height happens to be rather than computing one
    // itself.
    if (this.state === "juggled") {
      return this.juggleY;
    }
    return 0;
  }

  // Special has no melee hitbox of its own anymore - see spawnProjectile in
  // game.js, which handles its hit detection independently once the
  // projectile it fires is actually in flight.
  attackHitbox() {
    // Light/Heavy (LIGHT_ATTACK/HEAVY_ATTACK above) are both punch-family,
    // matched directly by state now that there's no chain index to look up -
    // CROUCH_LIGHT/CROUCH_HEAVY are checked alongside them (same "punch"
    // kind - see checkHit in game.js, no separate kind string for either, per
    // the "don't invent parallel kind strings" rule, and CROUCH_LIGHT/
    // CROUCH_HEAVY's own comment above for why crouching never changes what
    // stops a punch-family hit). Medium (MEDIUM_ATTACK) is kick-family;
    // CROUCH_MEDIUM reports its OWN "crouchKick" kind rather than folding
    // into "kick" (see POWER_GAIN's own comment above for why), so it's
    // checked as its own explicit branch, not alongside Medium's.
    const isLight = this.state === LIGHT_ATTACK.state;
    const isHeavy = this.state === HEAVY_ATTACK.state;
    const isMedium = this.state === MEDIUM_ATTACK.state;
    const isCrouchLight = this.state === CROUCH_LIGHT.state;
    const isCrouchHeavy = this.state === CROUCH_HEAVY.state;
    // Ground finisher (requirement 9) - reached via the Heavy+Special hold
    // macro, always this one pose/spec now (see the finisher-macro branch of
    // update() above).
    const isFinisher = this.state === "finisherPunch";
    const spec = isLight
      ? LIGHT_ATTACK
      : isHeavy
        ? HEAVY_ATTACK
        : isCrouchLight
          ? CROUCH_LIGHT
          : isCrouchHeavy
            ? CROUCH_HEAVY
            : isMedium
              ? MEDIUM_ATTACK
              : this.state === CROUCH_MEDIUM.state
                ? CROUCH_MEDIUM
                : isFinisher
                  ? JUGGLE_FINISHER
                  : null;
    if (!spec) return null;
    if (this.stateT < spec.activeStart || this.stateT > spec.activeEnd) return null;
    if (this.hasHit) return null;
    const isPunch = isLight || isHeavy || isCrouchLight || isCrouchHeavy;
    // "finisher" gets its own real kind (checked before the punch/kick
    // split) - it needs to be identifiable in game.js's checkHit both to
    // bypass the ordinary isAirborne(defender) exclusion (reaching a
    // still-juggled defender is the entire point) and to trigger the
    // deliberate applyJuggleSpike() override there, same pattern punchDown
    // already established for the aerial chain's own finisher.
    const kind = isFinisher ? "finisher" : isPunch ? "punch" : this.state === CROUCH_MEDIUM.state ? "crouchKick" : "kick";
    return {
      from: this.x,
      to: this.x + this.facing * spec.range,
      damage: spec.damage * this.archetype.damageMult,
      isPunch,
      kind,
    };
  }

  get specialDamage() {
    return SPECIAL.damage * this.archetype.damageMult;
  }

  get airAttackDamage() {
    return AIR_MEDIUM.damage * this.archetype.damageMult;
  }

  get airSpecialDamage() {
    return AIR_SPECIAL.damage * this.archetype.damageMult;
  }

  get slideDamage() {
    return SLIDE.damage * this.archetype.damageMult;
  }

  get uppercutDamage() {
    return UPPERCUT.damage * this.archetype.damageMult;
  }

  // kind is whatever attackHitbox()/updateSlide/checkUppercutHit call this
  // with ("punch"/"kick"/"slide"/"uppercut"/"special") - landing any real
  // hit builds power now, not just a punch, so kick/slide/uppercut (which
  // all cost power - see input handling above, or in slide/uppercut's case
  // spend the risk of missing) get some of it back on a successful hit.
  onLandedHit(kind) {
    const gain = POWER_GAIN[kind] ?? 0;
    if (gain > 0) this.power = Math.min(MAX_POWER, this.power + gain);
  }

  // Called from game.js's checkHit/checkUppercutHit ONLY when the defender's
  // own takeDamage just reported "perfect-parry" (see below) - reuses the
  // existing hitstun state/animation for the attacker's punish window
  // instead of a dedicated "parried" state, since there's no spare art for
  // a brand-new pose (see SHEETS in body.js) and getting visibly cut off
  // mid-swing into the same stagger a real hit causes already reads
  // correctly as "that opening got punished".
  applyParryStagger() {
    this.hitstunFrames = PARRY_STAGGER_FRAMES;
    // Without this, a real hit landed on the attacker while they're stuck in
    // this borrowed "hitstun" state would read as wasChaining=true in
    // takeDamage below and inherit whatever comboCount this fighter last had
    // from an earlier, unrelated combo - decaying the punish hit's damage
    // through computeComboDamageScale instead of letting it land clean. This
    // fighter isn't "still mid-combo", they're freshly staggered - zeroing
    // it here means the very next hit that lands on them reads as hit 1 of a
    // brand new combo (full damage), which is the whole point of rewarding
    // the read with an opening in the first place.
    this.comboCount = 0;
    this.setState("hitstun");
    this.lastEvent = "parried";
  }

  // Called from takeDamage below whenever kind === "uppercut" - see the big
  // "Airborne juggle" comment block up near the UPPERCUT/JUGGLE_* constants
  // for the full design this implements. Handles BOTH a fresh launch (this
  // fighter wasn't already airborne) and a relaunch (a second, third... Nth
  // uppercut catching them while state is already "juggled") through the
  // same path - the only thing that differs between the two is whether
  // juggleHits/juggleAirborneFrames carry over or reset, both handled right
  // here.
  applyJuggleLaunch() {
    const relaunch = this.state === "juggled";
    this.juggleHits = relaunch ? this.juggleHits + 1 : 1;
    // Only a genuinely fresh sequence resets the TIME axis cap's own
    // counter - a relaunch keeps counting from wherever the sequence already
    // was, which is the entire point of MAX_JUGGLE_FRAMES being a real
    // backstop across the whole sequence rather than something a relaunch
    // could quietly refresh back to zero.
    if (!relaunch) this.juggleAirborneFrames = 0;
    const capped = this.juggleHits > MAX_JUGGLE_HITS || this.juggleAirborneFrames >= MAX_JUGGLE_FRAMES;
    if (capped) {
      // Hard cap reached (either axis) - this hit still deals its own
      // (already combo-decayed, via computeComboDamageScale in takeDamage)
      // damage and, if they're mid-air from momentum already, doesn't yank
      // them out of it artificially either - but grants NO new upward
      // velocity, full stop. Clamped to never exceed 0 (never ADDS upward
      // velocity) rather than force-zeroed outright, so a capped hit landing
      // while they're already falling doesn't un-naturally freeze their
      // downward motion for a frame - gravity in update()'s "juggled" branch
      // just keeps doing its job either way.
      this.juggleVY = Math.min(this.juggleVY, 0);
    } else {
      // Decays off the ORIGINAL launch velocity via hits-so-far, not off
      // whatever this.juggleVY happens to already be - see
      // JUGGLE_RELAUNCH_DECAY's own comment above for why compounding decay
      // off the previous hit's already-decayed value would only trend
      // toward (never reach) zero on its own.
      this.juggleVY = JUGGLE_LAUNCH_VELOCITY * Math.pow(JUGGLE_RELAUNCH_DECAY, this.juggleHits - 1);
    }
    // A fresh launch starts from ground level; a relaunch keeps whatever
    // height they were already at (mid-air, by definition, since relaunch
    // requires state === "juggled" already) - only the velocity above
    // changes on a relaunch, not a position snap.
    if (!relaunch) this.juggleY = 0;
    this.setState("juggled");
  }

  // Called from takeDamage below whenever isJuggleSpike(...) says this hit
  // qualifies - see that function's own comment above for exactly which
  // hits count (already-airborne, real juggle-local depth, a closer-class
  // kind). Deliberately NOT applyJuggleLaunch with a bigger number - the
  // whole point is a categorically different reaction (forced hard down,
  // not a decayed relaunch up), so this is its own method rather than a
  // branch bolted onto that one. Still increments juggleHits (harmless
  // bookkeeping hygiene, matches applyJuggleLaunch's own relaunch path -
  // nothing reads juggleHits again after a spike, since the sequence is
  // about to end at landing regardless) rather than leaving it stale.
  applyJuggleSpike() {
    this.juggleHits += 1;
    this.juggleVY = -JUGGLE_SPIKE_VELOCITY;
    this.spiked = true;
    this.setState("juggled");
  }

  takeDamage(amount, fromX, kind) {
    // Juggle burst immunity (stage 4, requirement 15) - a FULL ignore, not
    // just a discount, for BURST_IMMUNITY_FRAMES real ticks after a
    // successful escape (see the burst check at the top of the "juggled"
    // branch above) - no health lost, no state/comboCount/lastEvent touched
    // at all, same as this call never happened. Checked before anything
    // else in this method, including the parry/block gate below, since a
    // fighter who just burst out is neither blocking nor a normal open
    // target - they're briefly untouchable, full stop.
    if (this.burstImmunityT > 0) return;
    // Only a genuine "block" state counts for a perfect parry - stateT here
    // is exactly "frames since block was raised" (see the big comment on
    // PARRY_WINDOW_FRAMES above for why that's reliable).
    const isPerfectParry = this.state === "block" && this.stateT <= PARRY_WINDOW_FRAMES;
    // High/low guard mix-up: standing block stops mid punches and high
    // kicks/uppercut, same as it always did, but is helpless against a
    // slide, same as before this mechanic existed. blockLow (crouch+block
    // held together, see update()) is the crouching answer - flipped the
    // other way, it stops that same slide plus punches, but does nothing
    // against kick/uppercut/airKick. Kicks never actually reach this far
    // while crouching (checkHit's own crouch/blockLow whiff in game.js
    // already excludes them before takeDamage is even called), so the
    // `kind !== "kick"` exclusion below is belt-and-suspenders; uppercut
    // DOES reach here, and this is what actually makes it whiff a crouching
    // guard the way a real anti-air should. airKick is added alongside
    // kick/uppercut for the same reason a jump-in is a genuine HIGH threat a
    // crouching guard shouldn't save you from - see checkAirAttackHit in
    // game.js, which deliberately doesn't whiff this move over a crouching
    // profile the way a GROUNDED kick does either. Specials always blow
    // straight through either guard, full stop - unchanged.
    const blockedByStanding = this.state === "block" && kind !== "special" && kind !== "slide";
    const blockedByLowGuard = this.state === "blockLow" && kind !== "special" && kind !== "kick" && kind !== "uppercut" && kind !== "airKick";
    if (blockedByStanding || blockedByLowGuard) {
      if (isPerfectParry) {
        // Full negate, not just a discount - a perfect parry has to feel
        // categorically better than plain block or there's no reason to
        // ever attempt the tighter timing over just holding guard. Standing
        // block only (see isPerfectParry above) - blockLow doesn't get a
        // parry window, it's a new, narrower guard option, not a
        // strictly-better one.
        this.power = Math.min(MAX_POWER, this.power + PARRY_POWER_GAIN);
        this.lastEvent = "perfect-parry";
      } else {
        this.health -= amount * 0.2 * this.archetype.blockMult;
        // A successful block is real defensive skill, not just standing
        // there - rewarding it with power gives blocking a reason to exist
        // beyond just "take less damage this once".
        this.power = Math.min(MAX_POWER, this.power + BLOCK_POWER_GAIN);
        this.lastEvent = "block-taken";
      }
    } else {
      // A continuation of the SAME combo only if this fighter was still
      // genuinely locked in the last hit's reaction when this one landed -
      // if state already got back to idle/walk/block/crouch/etc in between,
      // that's a gap, and this hit starts a fresh count at 1. See the
      // combo-scaling block up top for why the state check alone is enough
      // (no separate "combo ended" reset needed anywhere else). "juggled" is
      // a chain-continuation state same as hitstun/knockback now - a
      // follow-up uppercut/air-attack landing on an already-airborne
      // defender is exactly as much a real combo continuation as one
      // landing on a grounded hitstun defender.
      const wasChaining = this.state === "hitstun" || this.state === "knockback" || this.state === "juggled";
      this.comboCount = wasChaining ? this.comboCount + 1 : 1;
      // Ender scaling floor (stage 5, requirement 13) - finisher/punchDown
      // use computeDamageScale (which applies ENDER_SCALE_FLOOR) instead of
      // the raw computeComboDamageScale every other kind still uses
      // unmodified - see that helper's own comment above for why.
      const scaledAmount = amount * computeDamageScale(this.comboCount, kind);
      this.health -= scaledAmount;
      // Scaled per this exact hit's ALREADY-combo-scaled damage (see
      // computeHitstunFrames above) - read by the "hitstun" branch of
      // update()'s durations map the instant setState below flips into it.
      // Using the scaled amount (not the raw one) means hitstun shrinks
      // alongside damage as a combo goes on, which is what keeps a long
      // string from staying trivially chainable forever - see the
      // COMBO_DAMAGE_DECAY comment above. Set even for a slide/knockback/
      // juggle hit (harmless - neither "knockback"'s fixed duration nor the
      // physics-driven "juggled" state ever reads this field) so it's
      // always current for whichever hit lands next.
      this.hitstunFrames = computeHitstunFrames(scaledAmount);
      // uppercut is the real launcher now (see applyJuggleLaunch and the big
      // "Airborne juggle" comment block above) - kind === "uppercut" always
      // routes here, fresh launch or relaunch alike, so there's no path left
      // where a connecting uppercut still produces the old flat grounded
      // knockback/hitstun.
      //
      // `this.state === "juggled"` is the OTHER thing that routes here now -
      // this is the actual hook the aerial-attack system needs: an airKick/
      // flyingKick (or, in principle, any move) landing on a defender who's
      // ALREADY airborne from an earlier launch must extend that same
      // juggle sequence through applyJuggleLaunch's own decay/hit-count/
      // frame-count caps, not snap them back down into grounded "hitstun"
      // mid-air the way every other hit already resolves - that snap would
      // both look like a teleport (jumpOffset returns 0 for "hitstun", not
      // whatever height juggleY was at) and silently break the anti-infinite
      // guarantee, since a hit routed through the plain branch below would
      // never touch juggleHits/juggleAirborneFrames at all. In practice this
      // can only ever fire for an uppercut relaunch, an airKick/flyingKick
      // follow-up, or a homing special landing on an already-juggled target
      // - updateSlide/updateProjectiles' own dodge logic (and checkHit's own
      // ordinary punch/kick path) all still exclude a "juggled" defender
      // outright (see each one's own comment in game.js), so no OTHER
      // grounded move can reach a defender in this state to begin with. The
      // one deliberate exception is the ground finisher (checkHit's own
      // box.kind !== "finisher" carve-out there) - it forces its own
      // explicit applyJuggleSpike() call instead of relying on this
      // automatic routing at all, same override punchDown already uses.
      //
      // Captured before applyJuggleLaunch/applyJuggleSpike run (both call
      // setState("juggled"), which would make a same-state check here
      // meaningless) - true only when this fighter was ALREADY airborne the
      // instant this hit landed, i.e. this is a relaunch/follow-up, never
      // the launch itself. isJuggleSpike below needs exactly this.
      const wasAlreadyJuggled = this.state === "juggled";
      // See isJuggleSpike's own big comment block above - a spike only ever
      // fires on a hit that both (a) lands on an already-airborne defender
      // and (b) has already extended THIS juggle sequence at least
      // JUGGLE_SPIKE_MIN_HITS times, on the juggle-local juggleHits counter,
      // not the polluted-by-ground-openers overall comboCount. Computed once
      // here (not re-derived inside the branch below) so the exact same
      // read also feeds lastComboEnder's own OR at the bottom of this
      // method - a spike must always read as an ender for the shake/flash
      // escalation even when its kind is "airKick", which ENDER_KINDS
      // itself deliberately doesn't include - a grounded jump-in alone isn't
      // ender-class, but a SPIKED one, on an already-juggled target at real
      // depth, is a completely different situation.
      const spikedThisHit = isJuggleSpike(wasAlreadyJuggled, this.juggleHits, kind);
      if (kind === "uppercut" || wasAlreadyJuggled) {
        if (spikedThisHit) {
          this.applyJuggleSpike();
        } else {
          this.applyJuggleLaunch();
        }
      } else {
        // A spike's own much longer HARD_KNOCKDOWN_DURATION hold (see the
        // durations map above) must never leak into an unrelated LATER
        // slide/special hit that happens to reuse this same "knockback"
        // state string - explicitly cleared here, the only other place
        // "knockback" is ever entered from (the "juggled" branch's own
        // landing check is the other, and always assigns this field fresh
        // one way or the other on every landing). "special" added alongside
        // "slide" (stage 3, requirement 7) for the exact same staleness
        // reason slide already needed this: without it, a fighter who was
        // hard-knocked-down by an earlier spike this same match, then later
        // took an ordinary unblocked grounded special, would inherit that
        // long-stale HARD_KNOCKDOWN_DURATION hold instead of the plain
        // KNOCKBACK_DURATION this hit actually earns.
        if (kind === "slide" || kind === "special") this.hardKnockdownFrames = null;
        // A slide OR an unblocked grounded special connecting both get their
        // own reaction pose/knockback instead of the generic hitstun -
        // slide's push happens in updateSlide (game.js), special's in
        // updateProjectiles there (see SPECIAL.knockback) - this just picks
        // which animation plays while either one happens.
        this.setState(kind === "slide" || kind === "special" ? "knockback" : "hitstun");
      }
      this.lastEvent = "hit-taken";
      this.lastHitKind = kind;
      // Stashed on the instance (not just a local) so the isComboEnder OR
      // below can read it after health's own KO clamp runs - see that
      // block's own comment for why isKO has to be computed last, which
      // pushes this read to the very end of the method too.
      this.lastHitWasSpike = spikedThisHit;
    }
    this.health = Math.max(0, this.health);
    if (this.health <= 0) {
      this.setState("ko");
      this.lastEvent = "ko";
    }
    // Computed last, after health's own KO clamp above, so isComboEnder sees
    // the final post-hit health (isKO must reflect whether THIS hit was the
    // killing blow, not health from some earlier moment). Left false (the
    // constructor/update() default) for the block/perfect-parry branches
    // above - lastHitKind stays null there too - since neither is a real
    // landed hit, there's no combo depth or ender to escalate.
    //
    // `|| this.lastHitWasSpike` - a spike must always read as an ender for
    // the shake/flash escalation (see checkUppercutHit/checkAirAttackHit/
    // applyHomingHit in game.js, all of which key their SHAKE_ON_ENDER/
    // FLASH_ON_ENDER choice off this exact field) even on the "airKick"
    // kind, which isComboEnder's own ENDER_KINDS deliberately doesn't
    // include.
    if (this.lastEvent === "hit-taken" || this.lastEvent === "ko") {
      this.lastComboEnder = isComboEnder(this.comboCount, kind, this.health <= 0) || this.lastHitWasSpike;
    }
  }
}
