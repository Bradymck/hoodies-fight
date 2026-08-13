# Hood Vs Hood

![Hood Vs Hood logo](assets/branding/logo.png)

A browser fighting game built on top of [OnChainHoodies](https://onchainhoodies.xyz) — pick a Hoodie token ID (or connect a wallet and fight as one you actually hold), their real on-chain art becomes the fighter's head, and their archetype and Hood Talk quotes drive gameplay. No wallet writes, no wagering, nothing on-chain from this game itself — purely social.

Play: [hoodvshood.lol](https://hoodvshood.lol)

## How it works

- **Free play**: pick any two Hoodie token IDs and fight the AI. No wallet needed.
- **Wallet play**: connect a wallet, and if it holds any OnChainHoodies, pick one to fight as against the AI. Ownership is read directly from-chain (Robinhood Chain, contract `0x9ec6c5...735f45`) if the OnChainHoodies API is down, so wallet play still works either way.
- Archetype (Builder/Flipper/Hodler/Collector) drives a fighter's stats *and* their special attack:
  - **Builder** — hits harder, and their special is a big high haymaker.
  - **Flipper** — moves faster, and their special is a Hood Rat Rush (a rat swarm charging along the ground).
  - **Hodler** — more health, and their special is a ground roundhouse that blocks incoming hits and stops an opponent's slide dead.
  - **Collector** — blocks better, and their special is the long-range bolt.
  - Rare-tier traits add a small health bonus on top.
- Punch is free and builds your power meter slowly; landing hits and successful blocks build it faster. Kick, slide, uppercut, and special all spend power or carry real risk on a whiff.
- Jump high enough to cross over an opponent; slide low enough to pass under one who jumps. See the in-game controls legend for the full move list.

## Run it locally

No build step, no dependencies — plain HTML/JS/Canvas, ES modules throughout.

```bash
python3 -m http.server 8420
```

Then open `http://localhost:8420`.

## Project layout

```text
index.html          Markup + setup/arena screens
style.css            All styling
src/main.js          Setup flow, wallet/local routing, round loop
src/game.js           Per-frame combat loop: hit detection, physics, FX
src/fighter.js        Fighter state machine (moves, damage, archetypes)
src/body.js           Sprite sheets, animation lookup, canvas drawing
src/ai.js             AI opponent controller
src/api.js            OnChainHoodies API client + head-art cropping
src/chain.js          Raw JSON-RPC on-chain fallback (no wallet needed)
src/wallet.js         EIP-1193 wallet connect + chain switching
src/sound.js           SFX playback
src/tts.js             Spoken taunts/victory lines
assets/               Sprite sheets, backgrounds, FX, sounds, branding
```

## License

The **code** in this repo is public domain (CC0) — see [LICENSE](LICENSE). Fork it, remix it, ship your own version, no permission needed.

**Assets are not all CC0** - licensing is per-asset, not blanket:

- Character head art: pulled live from the OnChainHoodies API at runtime and never bundled in this repo - CC0, same as the collection itself.
- Sound effects: [Kenney](https://kenney.nl) Impact Sounds & UI Audio packs - CC0.
- Fighter sprite sheets (idle/walk/attack/kick/jump/hurt/crouch/block/spellcast, `assets/sprites/`) and both arena backgrounds (`assets/backgrounds/arena-2.png`, `arena-3.png`): AI-generated via SpriteCook.
- `assets/backgrounds/arena.png` (unused, kept for reference): generated on Pixellab.
- A handful of other sprite sheets (slide/knockback/uppercut/flex/rat-rush) have **unconfirmed provenance/licensing** and should not be assumed reusable - don't lift these into your own project without checking first. If you're forking this repo, swap them for something you know the rights to.

CC0 (on the code) means credit is never legally required - if you build on this, a mention is appreciated but entirely up to you.

## Contributing

This is meant to be built on, not gatekept. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get set up and what kinds of PRs are useful.

## Credits

- Built by [Pixelpushin](https://github.com/Pixelpushin) - vibe-coded with [Claude Code](https://claude.com/claude-code), for better or worse
- Character art: [OnChainHoodies](https://onchainhoodies.xyz) (CC0)
- Sound effects: [Kenney](https://kenney.nl) Impact Sounds & UI Audio packs (CC0)
