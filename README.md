# Palmera Bay — open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gandul5333/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gandul5333/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Palmera Bay** is an original open-world crime game in the spirit of GTA 6, built
for make.fun's `gta6-01` bounty. Explore a sun-soaked coastal city on foot and by
car, steal vehicles, outrun the police, and work off a $50,000 debt across four
story missions — all from static files, no network, no build step.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Keyboard: **WASD** move / drive, **Shift** sprint, **E** enter / exit a car,
**F** punch, **mouse click** shoot, **Space** handbrake, **P** pause, **M** mute.

## What is in the game

- A procedural coastal city: downtown towers, the old town, the docks, the beach
  and the boardwalk, with traffic, pedestrians, palms and a sunset sky.
- On-foot and driving play, cars to steal, a wanted level with police cars and
  foot cops who chase, ram and arrest.
- Four story missions with a debt to pay off, plus free-roam taxi fares and cash
  pickups, a HUD with minimap, health, cash and wanted stars, and a save game.
- Synthesized WebAudio sound: engine, sirens, gunshots, pickups.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=clever-owl-71&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
