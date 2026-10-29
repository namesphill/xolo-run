# Xolo Run

A 3D endless runner through the canals of Xochimilco, built with Three.js. You play a xoloitzcuintle that runs on the canal water, switching between three lanes and jumping over hazards. Hazards include trajineras, whirlpools and market stalls. Candy skulls replace coins.

**Play:** https://namesphill.github.io/xolo-run/

## Features
- Procedural 3D models and textures only, with no external art assets:
  - the xolo character, with run, jump, land and lane-switch animations
  - trajineras with painted name arches
  - sugar skulls, ahuejote willows, reeds, lilies, papel picado and flower arches
- A Van Gogh–style swirly blue sky and jade canal water with splashes, ripples and whirlpools.
- Procedurally generated tracks. A beam-search test (`test/fairness.mjs`) checks that every seed has a reachable route.
- Keyboard controls (← → / A D, Space / ↑) and touch swipes. Pause, game over, instant restart, and a best score saved in the browser.
- Synthesized music and sound effects using the Web Audio API, with a mute toggle.
- **DEMO (AUTOPILOT)** mode: the dog plays itself and restarts after each game over. Press **T** or tap the **A** button to take over.
- `viewer.html` is a model viewer with orbit and zoom, an animation picker, collision boxes and live parameters.

## Run locally
There is no build step. The project uses plain ES modules with a vendored copy of Three.js.
```sh
python3 -m http.server 8000
# open http://localhost:8000
```
URL options:
- `?q=low` forces low graphics quality.
- `?q=high` forces high graphics quality.

Fairness check (Node 18+):
```sh
SEEDS=$(seq -s, 1 40) GOAL=9000 node test/fairness.mjs
```

## Layout
- `js/main.js`: game loop, state, input, camera and autopilot.
- `js/config.js`, `js/planner.js` and `js/physics.js`: pure logic (no browser APIs), so they can be tested in Node.
- `js/track.js`: builds the track geometry from the planner's sections.
- `js/world.js`: sky, water, lighting and particles.
- `js/xolo.js`: the xolo character.
- `js/models.js`: props and scenery.
- `js/audio.js`: music and sound effects.
