# Hood Vs Hood

A local 2-player fighting game built on top of [OnChainHoodies](https://onchainhoodies.xyz) — pick any two Hoodie token IDs, their real on-chain art becomes the fighters' heads, and their traits and Hood Talk quotes drive gameplay. No wallet writes, no wagering, nothing on-chain from this game itself — purely social.

Play: [hoodvshood.lol](https://hoodvshood.lol)

## How it works

- Enter two Hoodie token IDs. Their SVG art, archetype (Builder/Collector/Flipper/Hodler), and latest Hood Talk quote are pulled live from `api.onchainhoodies.xyz`.
- Archetype changes how a fighter plays: Builder hits harder, Flipper moves faster, Hodler has more health, Collector blocks better. Rare-tier traits add a small health bonus on top.
- Punch is free and builds your power meter on a landed hit. Kick, jump, and special all spend power — special needs a mostly-full meter and hits hard.
- Local 2-player, one keyboard. See in-game controls legend.

## Run it locally

No build step — plain HTML/JS/Canvas.

```bash
python3 -m http.server 8420
```

Then open `http://localhost:8420`.

## License

Public domain (CC0) — same as the OnChainHoodies collection itself. Fork it, remix it, ship your own version. See [LICENSE](LICENSE).

## Contributing

This is meant to be built on, not gatekept. Open a PR — new moves, better animations, matchmaking, whatever. No permission needed for anything the license already grants you.

## Credits

- Character art: [OnChainHoodies](https://onchainhoodies.xyz) (CC0)
- Sound effects: [Kenney](https://kenney.nl) Impact Sounds & UI Audio packs (CC0)
