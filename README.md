# YEEZY JOYRIDE

A 16-bit rooftop endless runner for the browser. Strap on a jetpack, fly across
the New York skyline, weave through electric zappers and camera drones, and grab
Golden Vinyl records. Built with **Vite + TypeScript + Phaser 4**; plays on
desktop (keyboard or mouse) and mobile (touch).

Play at https://ashfaque0.itch.io/yetpack-yeride

> Fan-made parody project. Not affiliated with, endorsed by, or connected to
> Kanye West, Eminem, Halfbrick Studios, or any rights holder. See
> [Credits and rights](#credits-and-rights) before you publish a copy.

## How to play

Hold to fly, let go to fall. That is the whole control scheme.

| Action | Keyboard | Mouse / touch |
| --- | --- | --- |
| Thrust | `Space`, `W` or `Up` | Hold anywhere on the screen |
| Pause | `P` or `Esc` | `II` button, top centre |
| Sound on/off | `M` | `SND` button, top centre |
| Menus | Arrows / `WASD`, `Enter`, `Esc` | Tap |

The run speeds up over time. Every 1,000 metres you reach a new city with its
own skyline and palette: New York, Chicago, Tokyo, Paris, then round again.

## What's in the game

**Characters** (all free, pick one in the Era Locker)

- **Donda** and **Slim Shady**: illustrated characters drawn at full screen
  resolution, with legs on a spring so they stride on the roof and trail in the
  air. Slim Shady has his own run, fly, glide and crash poses and his own
  soundtrack.
- **College Dropout**, **808s Heartbreak**, **Yeezus**: pixel-art eras.

**Jetpacks**

- **Gold Record Pack**: flames, sparks and music notes.
- **Auto-Tune Pack**: fires neon sound rings downward that smash rooftop gates.
- **Hype-Boost Pack**: launches sneakers downward; each one kicks you upward.

**Hazards**

- **Electric zappers**: horizontal, vertical, diagonal, rotating, twin beams
  with one gap to thread, and pylon gates standing on the roof.
- **Camera drones**: a red `[!]` marker tracks your height for 1.2 seconds, then
  a drone rockets across the screen at that height.
- **Rooftop paparazzi**: fly over them and they fire a blinding flash cone; buzz
  them at low altitude and they scatter instead.

**Power-ups** (from rainbow YZY Supply Crates)

- **Graduation Bear Mech**: hold to charge a high jump; crushes drones, and
  stomps through barriers while airborne.
- **YZY Truck**: fast, rams pylon gates, launches off rooftop vents.
- **Golden Mic Drop**: a shield that soaks three hits and pulls in nearby records.
- **Slide Hoverboard**: low gravity, double jump with a flip.

A vehicle absorbs a hit and then breaks, dropping you back to the jetpack with a
moment of grace.

**Collectibles**: Golden Vinyl records in lines, sine waves, arcs, arrows,
staircases and `Y-E-E-Z-Y` letter formations.

## Run it locally

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` folder |
| `npm run zip:itch:win` | Build and zip `dist/` for itch.io (Windows, no extra tools) |
| `npm run zip:itch` | Same, for macOS/Linux or anywhere the `zip` command exists |

## Deploy

**itch.io**: run a zip script, create a project with *Kind of project* set to
**HTML**, upload `yeezy-joyride-itch.zip`, and tick *This file will be played in
the browser*. A viewport of 1280 x 720 with the fullscreen button enabled works
well. Asset paths are relative (`base: './'`), so the build runs inside itch's
iframe.

**Vercel**: import the repository. `vercel.json` already sets the build command
and output folder; no other configuration is needed.

## Custom audio

Sound is synthesized in the browser by default. Two folders let you swap in
files without touching code:

- `src/assets/music/`: `theme.*` is the default soundtrack; `slim.*` plays while
  Slim Shady is equipped. With no files the game plays a built-in chip-hop loop.
- `src/assets/sfx/`: a file named after an effect slot (`record.wav`, `zap.wav`,
  `thruster.wav` ...) replaces the synthesized version.

Each folder has a `README.txt` listing the slot names. Anything placed there is
bundled into the build.

## How it's built

```text
src/
├── main.ts                    Phaser bootstrap, sizes the canvas to the screen
├── config/
│   ├── constants.ts           Physics values, depths, palette, city definitions
│   ├── eras.ts                Characters, jetpacks, vehicles, saved profile
│   └── view.ts                Native-resolution rendering and camera zoom
├── events/EventBus.ts         Typed events between gameplay and the HUD
├── assets/
│   ├── PixelTextureBaker.ts   Draws every pixel-art texture and the font in code
│   ├── img/chars/             Illustrated character art
│   ├── music/, sfx/           Optional audio files (see above)
├── audio/ChipHopAudioEngine.ts  Web Audio synth, mix buses, ducking, file playback
├── systems/
│   ├── ParallaxCityManager.ts Five scrolling city layers, traffic, rooftop props
│   ├── ObstacleSpawner.ts     Seeded random generator and weighted wave director
│   ├── RecordPatternSpawner.ts  Record formations
│   └── JuiceManager.ts        Hit-stop, screen shake, squash, particles, camera
├── entities/
│   ├── Player.ts              Jetpack controller and vehicle transformations
│   ├── CharacterRig.ts        Hinged torso-and-legs rig with spring physics
│   ├── ElectricZapper.ts, CameraDrone.ts, RooftopPaparazzi.ts
└── scenes/                    Boot, Title, Game, UI (HUD), Locker
tools/                         Python scripts that cut the characters out of source art
```

A few details worth knowing:

- The world is authored on a 640 x 360 grid. The canvas is created at the
  display's real pixel size and cameras zoom to fit, so pixel art stays crisp
  and the illustrated characters keep their detail.
- City backdrops, props, hazards, pickups and the HUD font are generated at
  startup; only the illustrated characters and optional audio are files.
- Each run has a seed (shown on the results panel). Obstacles come from the
  game's own random generator, so a seed always produces the same sequence.
- Progress (best score, record total, loadout, mute) is saved in the browser's
  local storage on that device.

## Credits and rights

This is a non-commercial fan project.

- Gameplay is inspired by jetpack endless runners; code and pixel art are
  original to this project.
- The illustrated character art depicts real public figures and was supplied by
  the project author.
- The files in `src/assets/music/` and `src/assets/sfx/thruster.wav` are
  third-party recordings supplied by the project author. They are **not**
  covered by any licence in this repository. If you fork or redistribute the
  game, remove them or replace them with audio you have the rights to use; the
  game falls back to its built-in synthesized sound automatically.
- "Yeezy", "Jetpack Joyride" and related names are trademarks of their
  respective owners.
