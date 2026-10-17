# Bro: painted sprite sheets and animation

Bro Team owns the art and animation. Coding agents only wire playback. Every file under `public/sprites/`
drops into the repo at the same path. The player is `src/render/sheets.ts` on branch
`cursor/combat-juice-ee7b` (PR #2), and it steps these clips exactly.

## Ids

| file id | game lookup | source sheet | cell | game r | fit |
|---|---|---|---|---|---|
| `player-radish` | `sheetKeysForPlayer('radish', model)` → `player-radish-<model>` then **`player-radish`** | image8.jpg | 192 | 17 | 0.25 |
| `player-potato` | Spud (species `potato`) | image9.jpg | 192 | 17 | 0.25 |
| `player-carrot` | Carrot | image0.jpg | 192 | 17 | 0.25 |
| `player-chili` | Chili (attack = slash arc) | image11.jpg | 192 | 17 | 0.25 |
| `enemy-blob` | `sheetKeysForEnemy('blob', form)` → `enemy-blob-<form>` then **`enemy-blob`** (Pea / Mud Pea, both forms) | image12.jpg | 160 | 14 | 0.25 |
| `enemy-charger` | mud carrot → kind `charger` (Carrot, charge behaviour) | image13.jpg | 208 | 18 | 0.25 |
| `enemy-spitter` | mud worm → kind `spitter` (the "spit" clip). **Mapping choice:** the data calls this enemy "Chili". `wisp` (Garlic) also shoots SPIT. To move the worm, copy the JSON to `enemy-wisp.json`; `image` still points at `enemy-spitter.webp`. | image5.jpg | 256 | 16 | 0.25 |
| `enemy-eliteBlob` | Great Mud Pea → kind `eliteBlob` ("Great Pea", r 24) | image14.jpg | 256 | 24 | 0.25 |
| `fx-ink` | new: VFX clips `muzzle`, `hitSpark`, `inkBurst`, `dust` | image16.jpg | 128 | n/a | n/a |
| `pickups` | new: one clip per pickup (`xpSmall xpLarge coin heart crate magnet bomb chest`), plus an `idle` alias | image17.jpg | 128 | n/a | n/a |
| `prop-furrow`, `prop-bed` | new static props, 1x plus `@2x` | image2.jpg, image.jpg | n/a | n/a | n/a |
| `ground-garden.png` (`.webp`, `@2x`) | 512² seamless ground tile | garden ground.jpg | n/a | n/a | n/a |

The game requests these ids today: `player-<species>[-<model>]` and `enemy-<kind>[-<form>]`. Nothing loads `fx-ink`,
`pickups`, the props or the ground yet, so they each need a small loader. The stock `parseManifest` only keeps
clips named `idle/walk/hurt/attack/death`, so fx and pickups need a player that reads clips by name.
The frame and clip schema is otherwise identical. Unknown top-level keys such as `meta` are ignored by the parser.

## How the numbers map onto the game

* `drawActorSheet` draws a frame at `fit = snapScale(r*2.35/max(fw,fh))`. `snapScale` rounds to 0.25 / 0.5 / 1.
  I chose every actor cell size so that fit lands **robustly on 0.25**. Note that `player r=17` with 160 px cells would
  sit right on the 0.25/0.5 boundary. So on screen a figure is 0.25 × its atlas pixels: heroes about 30–41 px tall,
  enemies scaled to their radius. The atlases are therefore 4x supersampled for the game, and I did not make a separate 2x atlas.
  The source paintings don't have that resolution anyway.
* **Anchor = body centre.** Frames are registered **on the feet**: every cell's ground contact sits on
  `meta.feetY`, and walk/idle frames are aligned on the torso, the distance-transform peak of the main body, so weapons
  and limbs don't shift the body. The game draws the actor at its centre and its shadow at `y + 0.62r`, so
  `anchor.y = (feetY − 0.62r/fit)/frameHeight`. That puts the painted feet on the shadow.
  If `snapScale` is ever removed, change `game_fit()` in `tools/build.py` and rebuild. The anchors will be recomputed.
* `scaleX/scaleY` pivot on the anchor, which is the body centre. Each scaled frame therefore carries an automatic `oy`
  correction (`(feetY−anchorY)·fit·(1−scaleY)`, in world px) so squash and stretch keep the feet planted. Authored bounces
  are added on top of that. `ox/oy` are world px because the game applies them before scaling. `+ox` is forward and is mirrored by facing.
* Walk clips for the heroes and the charger use `torso_lock` (0.8): `oy` cancels most of the painted torso
  height wobble between the 4 frames, so the authored bob rides on a steady body instead of a jittery one.
* Hit flash is painted in. Each actor has a `hurt_flash` cell (the hurt frame toned to cream) and a `death_flash` cell
  (a hot first burst frame). The sheet path applies no runtime tint, so this is where the white flash comes from.
* Events: `hit` triggers `fx.hitSpark` at the actor and `spawnFx` triggers `fx.sparkle` (see `applySheetEvents`). The custom markers
  `hurt` (first hurt frame) and `release` (attack release frame) are ignored by the current code, so they are free to wire up.
  Player attacks use `release+spawnFx` rather than `hit`, so the player doesn't spark on itself. Boss slam impact uses `hit+spawnFx`.
* Death clips fit inside the game's death windows: 0.55 s for the player, `DEATH_TIME` 0.45 s for enemies. The game doesn't fade a sheet
  that has a death clip, so the bursts shrink out over the last two frames instead of popping off.

### Wiring notes for the coding agent (game-side, not art)
1. `pickClip` only plays `attack` for enemies when `e.state` is `windup`/`charging`. Shooters enter `shooting`, so the
   worm's **spit clip never plays** until `|| e.state === 'shooting'` is added. `eliteBlob` uses `chase`, so its slam
   telegraph only plays once a windup state exists for it.
2. The enemy draw path adds `e.anim.bob` (±2.2 px) on top of the sheet's `oy`. Set it to 0 when a sheet is used, because the blob
   hop and walk bob are authored in the clip.
3. `drawShadow` stays at ground level, which is correct: hops lift the sprite off its shadow.
4. Every frame of every clip is in the JSON. Don't add extra squash on top. `drawPlayer` still applies `bodyRot` lean, which is fine.

## Clips (generated from the JSON by `tools/clip_table.py`)

Cell indices per sheet are listed in each JSON under `meta.cells`. The hero order is
`walk0-3, idle, hurt, attack, death, hurt_flash, death_flash`.

| id | clip | loop | frames (cell:ms) | total | events |
|---|---|---|---|---|---|
| enemy-blob | idle | yes | 4:160 4:120 4:120 4:160 4:120 4:120 | 800 |  |
| enemy-blob | walk | yes | 0:90 1:60 2:90 6:90 3:60 0:60 4:70 | 520 |  |
| enemy-blob | hurt | no | 8:40 5:60 5:80 | 180 | f0@0ms:hurt |
| enemy-blob | attack | no | 0:90 6:60 6:110 | 260 | f1@90ms:hit |
| enemy-blob | death | no | 8:50 9:40 7:90 7:120 7:80 7:60 | 440 | f1@50ms:spawnFx |
| enemy-charger | idle | yes | 4:170 4:130 4:130 4:170 4:130 4:130 | 860 |  |
| enemy-charger | walk | yes | 0:85 1:85 2:85 3:85 | 340 |  |
| enemy-charger | hurt | no | 8:40 5:60 5:80 | 180 | f0@0ms:hurt |
| enemy-charger | attack | no | 4:150 4:150 4:150 4:150 4:70 6:60 6:120 6:200 | 1050 | f5@670ms:release+spawnFx |
| enemy-charger | death | no | 8:50 9:40 7:90 7:120 7:80 7:60 | 440 | f1@50ms:spawnFx |
| enemy-eliteBlob | idle | yes | 0:150 0:140 1:180 1:150 1:140 0:150 | 910 |  |
| enemy-eliteBlob | walk | yes | 2:140 3:140 2:140 3:140 | 560 |  |
| enemy-eliteBlob | hurt | no | 8:40 6:60 6:80 | 180 | f0@0ms:hurt |
| enemy-eliteBlob | attack | no | 4:160 4:160 4:160 4:100 5:45 5:80 5:110 0:80 0:80 | 975 | f4@580ms:hit+spawnFx |
| enemy-eliteBlob | death | no | 8:50 9:40 7:90 7:120 7:80 7:60 | 440 | f1@50ms:spawnFx |
| enemy-spitter | idle | yes | 4:170 4:130 4:130 4:170 4:130 4:130 | 860 |  |
| enemy-spitter | walk | yes | 0:120 1:105 2:120 3:105 | 450 |  |
| enemy-spitter | hurt | no | 8:40 5:60 5:80 | 180 | f0@0ms:hurt |
| enemy-spitter | attack | no | 4:90 6:50 6:120 6:100 | 360 | f1@90ms:release+spawnFx |
| enemy-spitter | death | no | 8:50 9:40 7:90 7:120 7:80 7:60 | 440 | f1@50ms:spawnFx |
| fx-ink | muzzle | no | 0:30 1:35 2:35 3:40 4:40 5:45 | 225 |  |
| fx-ink | hitSpark | no | 6:35 7:40 8:40 9:45 10:50 11:60 | 270 |  |
| fx-ink | inkBurst | no | 12:40 13:45 14:45 15:50 16:60 17:120 | 360 |  |
| fx-ink | dust | no | 18:45 19:50 20:55 21:60 22:70 23:90 | 370 |  |
| pickups | xpSmall | yes | 0:110 0:110 8:110 8:110 8:110 0:110 | 660 |  |
| pickups | xpLarge | yes | 1:110 1:110 9:110 9:110 9:110 1:110 | 660 |  |
| pickups | coin | yes | 2:110 2:110 10:110 10:110 10:110 2:110 | 660 |  |
| pickups | heart | yes | 3:110 3:110 11:110 11:110 11:110 3:110 | 660 |  |
| pickups | crate | yes | 4:110 4:110 12:110 12:110 12:110 4:110 | 660 |  |
| pickups | magnet | yes | 5:110 5:110 13:110 13:110 13:110 5:110 | 660 |  |
| pickups | bomb | yes | 6:110 6:110 14:110 14:110 14:110 6:110 | 660 |  |
| pickups | chest | yes | 7:110 7:110 15:110 15:110 15:110 7:110 | 660 |  |
| pickups | idle | yes | 0:110 0:110 8:110 8:110 8:110 0:110 | 660 |  |
| player-carrot | idle | yes | 4:170 4:130 4:130 4:170 4:130 4:130 | 860 |  |
| player-carrot | walk | yes | 0:100 1:100 2:100 3:100 | 400 |  |
| player-carrot | hurt | no | 8:40 5:60 5:80 | 180 | f0@0ms:hurt |
| player-carrot | attack | no | 4:60 6:45 6:70 6:80 | 255 | f1@60ms:release+spawnFx |
| player-carrot | death | no | 8:60 5:60 9:50 7:110 7:140 7:70 7:60 | 550 | f2@120ms:spawnFx |
| player-chili | idle | yes | 4:170 4:130 4:130 4:170 4:130 4:130 | 860 |  |
| player-chili | walk | yes | 0:100 1:100 2:100 3:100 | 400 |  |
| player-chili | hurt | no | 8:40 5:60 5:80 | 180 | f0@0ms:hurt |
| player-chili | attack | no | 4:60 6:45 6:70 6:80 | 255 | f1@60ms:release+spawnFx |
| player-chili | death | no | 8:60 5:60 9:50 7:110 7:140 7:70 7:60 | 550 | f2@120ms:spawnFx |
| player-potato | idle | yes | 4:170 4:130 4:130 4:170 4:130 4:130 | 860 |  |
| player-potato | walk | yes | 0:100 1:100 2:100 3:100 | 400 |  |
| player-potato | hurt | no | 8:40 5:60 5:80 | 180 | f0@0ms:hurt |
| player-potato | attack | no | 4:60 6:45 6:70 6:80 | 255 | f1@60ms:release+spawnFx |
| player-potato | death | no | 8:60 5:60 9:50 7:110 7:140 7:70 7:60 | 550 | f2@120ms:spawnFx |
| player-radish | idle | yes | 4:170 4:130 4:130 4:170 4:130 4:130 | 860 |  |
| player-radish | walk | yes | 0:100 1:100 2:100 3:100 | 400 |  |
| player-radish | hurt | no | 8:40 5:60 5:80 | 180 | f0@0ms:hurt |
| player-radish | attack | no | 4:60 6:45 6:70 6:80 | 255 | f1@60ms:release+spawnFx |
| player-radish | death | no | 8:60 5:60 9:50 7:110 7:140 7:70 7:60 | 550 | f2@120ms:spawnFx |


## Previews
* `previews/<id>/<clip>.gif`: each clip played exactly as `sheets.ts` steps it, on the garden ground with the
  game's contact shadow. Clips render at **4x game scale**, which is native atlas pixels, so motion and detail can be judged. Non-loop clips
  hold their end pose for 450 ms, then show one idle frame before restarting.
* `previews/showcase.gif` (`showcase.mp4` is the same at 400 KB): four heroes walking (chili slashes with a muzzle spark), the blob hopping and
  taking hits, the worm crawling, the charger running, and the Great Mud Pea doing idle → telegraph → slam with ink burst, dust and a little shake. 3x game scale.
* `previews/contact_sheet.png`: every atlas on dark and light with its cell grid.
* `previews/halo_check.png`: idle and death cells of every actor on pure black and pure white.
* `previews/ground-garden_2x2-check.png`: the ground tiled 2×2 to check the seams.

## Regenerate
```
pip install --user --break-system-packages numpy scipy pillow
python3 tools/ground.py                        # ground tile + 2x2 check
python3 tools/build.py                         # all sheets + JSON + previews (about 80 s)
python3 tools/build.py --only enemy-blob       # one sheet (add --no-previews to skip GIFs)
python3 tools/validate.py                      # schema and bounds check against the sheets.ts rules
python3 tools/clip_table.py                    # markdown clip table
```
* `tools/sheets_config.py` is the only file to edit. It holds the layout (grid, cell names, cell size, scale, registration
  mode per frame, nudges) and the animation (clips, ms, squash, offsets, events). To add a sheet, append a dict that references
  a pink-background JPEG.
* `tools/spritekit.py` does the work. Keying samples the corner colour and builds a Lab-distance soft matte, removes specks,
  un-premultiplies against the key, erodes and feathers by 1 px, despills magenta in the edge band, and re-takes JPEG 4:2:0 chroma from the interior
  (`pastel_fix` additionally neutralises pale pink that was painted into the mud/dust sheets). It also handles connected-component segmentation,
  where detached parts join the cell holding their centroid; premultiplied Lanczos resampling; and POT packing.
* `tools/build_report.json` records the key thresholds, a halo pixel count per atlas (pixels still within ΔE 30 of the key) and
  the torso spread.
