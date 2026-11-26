# Xolo Run — character artist brief: the xolo

We need a hand-made, game-ready 3D model of our player character, a xoloitzcuintle (Mexican hairless dog), to replace the code-built dog in [Xolo Run](https://namesphill.github.io/xolo-run/), a three-lane endless runner set on the canals of Xochimilco during Día de Muertos. It runs in the browser (Three.js) and as an iOS app.

**Reference rig:** [`assets/xolo_reference.glb`](../assets/xolo_reference.glb) is the current dog exported with its skeleton and every animation the game uses. Open it in Blender (File → Import → glTF 2.0) for scale, proportions, timing, and the clip list. Treat its look as a starting point to beat, not a target to copy.

## 1. Character and style

- **Who:** a lean, alert, happy young xolo who guides souls across the water (the Aztec legend). Brave and playful, never scary.
- **Style:** stylized, appealing, slightly cartoon proportions (think a modern mobile/console platformer), not photoreal.
- **Must keep:**
  - Tall, **narrow, pointed, upright ears** that grow out of the skull (not wide, not stuck on).
  - **Eyes facing forward**, slightly large and cute, warm amber/brown iris with a catchlight.
  - A gentle, friendly **smile**: lips are a fold of skin that rolls into the mouth, with the lower jaw reading as part of the muzzle. No painted-on or floating lip lines.
  - Lean body, long legs, slim whip tail, small optional head tuft.
  - **Glossy charcoal-black skin** with soft highlights: shiny like skin, never metallic or plastic. Subtle slate/pinkish variation and fine wrinkles on the forehead and neck are welcome.
  - A marigold (cempasúchil) garland collar, as in the reference.
- **Readability:** in gameplay the dog is seen small, from behind and above, on a phone screen. The silhouette (ears, tail, legs) must read at that size against teal water.
- **World palette:** turquoise water, marigold, rosa mexicano, red, purple, and a bright blue Van Gogh-style sky.

## 2. Technical spec

| Item | Requirement |
| --- | --- |
| Format | One binary glTF 2.0 file (`.glb`), embedded textures |
| Units / axes | Meters, +Y up, **dog faces −Z**, origin on the ground between the four paws |
| Size | Match the reference: about 0.44 m wide, 1.17 m to the ear tips, 1.62 m nose to tail tip, resting on y = 0 (the game scales it by 1.2) |
| Triangles | 10–15k for the whole character, collar included (current dog is 53k) |
| Materials | glTF PBR metallic-roughness; at most 2 materials (body, eyes) plus the collar |
| Textures | Base color, normal, occlusion-roughness-metallic; 2048² max, PNG/JPEG/WebP. No Draco, meshopt or KTX2 compression for now |
| Skinning | One skinned mesh preferred, ≤ 64 bones, ≤ 4 influences per vertex |
| Paw bones | Name the paw (end) bones `paw_FL`, `paw_FR`, `paw_HL`, `paw_HR` (front/hind, left/right); the game spawns splashes there |
| Optional morph target | `blink` (both eyelids closed at 1.0); the game blinks it automatically |

## 3. Animations

Clip names must match exactly (lower case). Bake to the skeleton, 30 fps. Reference timings come from the reference rig.

| Clip | Type | Notes |
| --- | --- | --- |
| `idle` | loop, ~3 s | Menu screen: breathing, ear twitches, looks around, tail wag |
| `run` | loop, **one stride** | Gallop at 12 m/s, in place (no root motion). Reference stride is 0.31 s; the game speeds it up with running speed |
| `jump` | one-shot, ~0.67 s | Take-off, airborne tuck, reach for landing. Held on the last frame until landing |
| `fall` | loop (optional) | Airborne descent; if present it plays once the jump starts falling |
| `land` | one-shot overlay, ~0.6 s | Landing squash and recovery |
| `lane_left`, `lane_right` | one-shot overlay, ~0.6 s | Lean and head/ear swing when switching lanes |
| `stumble` | one-shot overlay, ~0.9 s | Glancing hit that doesn't end the run |
| `death_crash` | one-shot, ~1.3 s | Hits an obstacle and falls over; holds last frame |
| `death_splash` | one-shot, ~1.3 s | Pulled under by a whirlpool; holds last frame |

**Overlay clips** (`land`, `lane_*`, `stumble`) are played additively on top of `run`. Author them as offsets from the dog's neutral run pose: frame 0 must be that neutral pose, and the clip must end back on it.

Secondary motion (ears and tail lagging behind, anticipation before jumps) should be animated by hand; the game adds only a small lean and squash on top.

Optional metadata: custom properties on the root object are read as glTF extras: `xolo_run_speed` (m/s the run clip was authored for, default 12) and `xolo_footfalls` (run-cycle fraction where each paw plants, e.g. `{"HL":0,"HR":0.08,"FL":0.43,"FR":0.54}`).

## 4. Deliverables

1. Concept: turnaround (front, side, back, ¾) and a small expression sheet, for approval before sculpting.
2. Sculpt progress renders, for approval before retopology.
3. Final `xolo.glb` meeting the spec above.
4. Source files (`.blend` and/or `.ztl`/`.spp`), textures at full resolution, and the rig.

## 5. How we'll check it

- Load it in the game: `https://namesphill.github.io/xolo-run/?dog=<url-to-glb>`, or locally `index.html?dog=assets/xolo.glb`. The dog runs, jumps, switches lanes and dies with the right clips; no console errors.
- Fixed review views: `test/dogshots.html?dog=../assets/xolo.glb` (also `&v=face`, `&v=mouth`, `&v=ears`) compared side by side with the current dog.
- Steady 60 fps on a mid-range iPhone during gameplay.

Once approved, set `XOLO_GLB = 'assets/xolo.glb'` in `js/config.js` and it becomes the default dog. The code-built dog stays as the fallback if the file fails to load.
