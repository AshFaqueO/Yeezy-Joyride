# YEEZY JOYRIDE — Complete Project Context & Execution Specification

> **Instructions for Claude (Claude Code / Cursor / Claude Fable 5.2):**
> This document contains the full design history, visual reference specifications, gameplay mechanics, and multi-file technical architecture for building **"YEEZY JOYRIDE"**—a 16-bit pixel-art endless runner inspired by *Jetpack Joyride* featuring Kanye West in New York City. Read this entire specification and the attached reference mockup image before scaffolding and implementing the project.

---

## 1. Conversation Context & Visual Evolution

1. **Core Concept:**
   - A 16-bit pixel-art side-scrolling endless runner like *Jetpack Joyride* where the playable character is **Kanye West** ("Ye").
   - Inspired by a detailed 16-bit pixel-art rooftop runner aesthetic (originally set in Dhaka with layered parallax buildings, rooftop props, street-level vehicles below, and an arcade HUD), reimagined in **New York City**.
2. **Critical Proportion Correction (Compact *Jetpack Joyride* Scale):**
   - In the first visual iteration, the Kanye sprite was way too large relative to the rooftop and screen height.
   - **Final Approved Visual Spec (Reference Image 2):** Kanye is scaled down to authentic *Jetpack Joyride* compact proportions (`20x26` logical pixels on a `640x360` canvas, ~7%–8% of screen height, with a tight `16x22` collision hitbox). This provides wide vertical maneuvering space between the rooftop floor (`Y = 285`) and the top HUD (`Y = 28`) to weave through coin arcs, electric zappers, and incoming camera drones.
3. **Target Tech Stack & Publishing Goals:**
   - **No Godot required:** Built as a modular, multi-file **Vite + TypeScript + Phaser 4** web game.
   - **Target Platforms:** Must build cleanly for both **itch.io** (via a relative-path `./` static `.zip` bundle) and **Vercel** (zero-config static deployment), supporting both Desktop (Keyboard/Mouse) and Mobile (Touch) controls.

---

## 2. Brainstormed Gameplay Mechanics & Content

### A. Theme-Based Jetpacks (Switchable in Locker & Active in Gameplay)
1. **Gold Record & Music Note Jetpack (Default):**
   - Silver-and-teal dual-thruster pack that blasts fiery orange flames, golden sparks, and floating pixel music notes (`♪`, `♫`) and vinyl shards downward to propel Ye upward.
2. **Auto-Tune Neon Wave Pack:**
   - Shoots cyan/magenta synthwave sound rings downward that destroy ground obstacles while playing pitch-corrected synth vocal snippets.
3. **The Hype-Boost Sneaker Pack:**
   - Propels the player upward with fiery "hype" and rapidly launches miniature Yeezy Boost sneakers downward with recoil physics.

### B. Power-Ups & Vehicles (Spawned via Rainbow "YZY Supply Crates")
Collecting a floating metallic Supply Crate transforms the player into a heavy vehicle or power-up (acting as a 1-hit shield before reverting to the jetpack):
1. **The Graduation Bear Mech:**
   - A giant robotic pixel-art suit modeled after the iconic *Graduation* teddy bear mascot.
   - Hold jump to charge a massive high-jump; stomps through electric barriers and crushes incoming drones.
2. **The "YZY Truck" (Armored Tank-SUV):**
   - A heavily armored, matte-black futuristic all-terrain vehicle that speeds across the rooftops, smashing low barriers and launching off rooftop vents.
3. **The Golden Mic Drop Shield:**
   - Surrounds Ye in a pulsing golden acoustic shockwave barrier that magnetizes all nearby Golden Records and blasts away obstacles on contact.
4. **The Slide Hoverboard:**
   - A floating oversized slide-style foam hoverboard that glides at high speed with low-gravity flips over hazards.

### C. Custom Obstacles & Hazards
1. **High-Voltage Electric Zappers:**
   - Dual steel lattice pylons connected by 4 crackling blue-white electric arcs.
   - Variants: Horizontal, vertical, diagonal, and slowly rotating laser/electric barriers.
2. **Surveillance Camera Drones / Headline Missiles:**
   - **Warning Phase:** A red pixel-art alert box with a white exclamation mark (`[!]`) locks onto the player's vertical Y-position on the right edge of the screen for `1.2 seconds` while beeping rapidly.
   - **Attack Phase:** A high-speed quadcopter carrying a massive DSLR camera lens (or tabloid `"BREAKING NEWS!"` missile) rockets horizontally across the screen with a smoke trail.
3. **Rooftop Paparazzi Flash Traps:**
   - Scurrying rooftop photographers in suits holding cameras. They scatter when Ye flies low or fire a blinding white camera flash cone that briefly disorients/flashes the screen if unshielded.

### D. Collectibles & Unlockable Era Skins ("Era Locker")
- **Collectible Currency:** **Golden Vinyl Records** (replace standard coins), spawning in sine waves, arcs, arrows, and `Y-E-E-Z-Y` letter formations.
- **Unlockable Outfits:**
  1. **The "Donda" Era (Default):** Bald head, goatee, dark rectangular sunglasses, bulky matte-black quilted puffer jacket, black cargo pants, and heavy boots (shown in the reference mockup).
  2. **The "College Dropout" Era:** Classic pink polo shirt, jeans, and backpack.
  3. **The "808s & Heartbreak" Era:** Tailored grey suit with an 8-bit fractured red heart pin.
  4. **The "Yeezus" Era:** Embellished crystal mask and punk leather jacket.

---

## 3. Master Execution Prompt & Skill Router Directive

### SKILL ROUTER DIRECTIVE (`awesome-gamedev-agent-skills`)
Use the installed `awesome-gamedev-agent-skills` router to load and follow the instructions and reference files for these exact skills before scaffolding or writing code:
1. `phaser-core` (Multi-file Vite + TypeScript + Phaser 4 architecture, `Phaser.Types.Core.GameConfig`, `pixelArt: true` rendering, typed Scene lifecycle, cross-scene `EventBus`)
2. `phaser-arcade-physics` (Typed Arcade Physics world, `this.physics`, `setAccelerationY`, `setVelocity`, `setMaxVelocity`, `onFloor()`, object-pooled `Phaser.Physics.Arcade.Group`s, `collider` and `overlap` handlers)
3. `create-game-assets` (16-bit NYC pixel-art style bible, unified palette, programmatic texture-atlas & spritesheet baker in TypeScript so zero external image URLs fail)
4. `game-feel` (Hit-stop frame freeze, squash-and-stretch tweens on jetpack ignition and rooftop landing, particle emitters, impact flashes)
5. `camera-systems` (2D camera look-ahead, vertical deadzone, level-bounds clamping, trauma-based screen shake manager)
6. `game-ui-ux` (Anchor-based responsive HUD overlay, integer pixel scaling, Era Locker shop UI)
7. `procedural-gen` (Seeded deterministic RNG and weighted spawn tables for fair obstacle waves and coin formations)
8. `audio-design` (Web Audio API synthesizer with `Master`, `Music`, and `SFX` gain buses in dB, +/-8% pitch variation, sidechain ducking, and looping 16-bit chip-hop beat)

---

## 4. Multi-File Architecture & Project Structure

Scaffold the project in the current working directory with the following structure and implement **every file completely** (zero stubs, zero placeholders, and zero `// TODO` comments):

```text
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts          # MUST set base: './' so assets work on both itch.io subpaths and Vercel root
├── vercel.json             # Clean SPA/static caching config for Vercel
└── src/
    ├── main.ts             # Phaser.Game bootstrap & Scale.FIT integer config (640x360 logical resolution)
    ├── config/
    │   ├── constants.ts    # Physics constants, depths, palette hex codes, city level thresholds
    │   └── eras.ts         # Unlockable Kanye Era skins & Jetpack definitions
    ├── events/
    │   └── EventBus.ts     # Typed cross-scene event emitter (score, records, level-up, vehicle, game-over)
    ├── assets/
    │   └── PixelTextureBaker.ts # Procedural 16-bit pixel-matrix renderer generating all spritesheets & tiles
    ├── audio/
    │   └── ChipHopAudioEngine.ts # Web Audio API synthesizer, dB buses, sidechain ducking, chip-hop loop & SFX
    ├── systems/
    │   ├── ParallaxCityManager.ts # 5-layer NYC skyline, brownstones, street yellow cabs, MTA subway, billboards
    │   ├── ObstacleSpawner.ts     # Seeded RNG, weighted wave tables, object pools for Zappers, Drones, Paparazzi
    │   ├── RecordPatternSpawner.ts # Spawns Golden Vinyl records in sine waves, arcs, and "Y-E-E-Z-Y" letters
    │   └── JuiceManager.ts        # Hit-stop, trauma camera shake, squash-and-stretch, particle bursts
    ├── entities/
    │   ├── Player.ts              # Compact Ye controller (20x26px), jetpack states, & vehicle transformations
    │   ├── ElectricZapper.ts      # Horizontal, vertical, diagonal, and rotating high-voltage barriers
    │   ├── CameraDrone.ts         # 1.2s red [!] edge lock-on warning + high-speed DSLR quadcopter missile
    │   └── RooftopPaparazzi.ts    # Scattering rooftop photographers with blinding camera flash cones
    └── scenes/
        ├── BootScene.ts           # Runs PixelTextureBaker & initializes ChipHopAudioEngine
        ├── TitleScene.ts          # 16-bit animated NYC rooftop title overlay + Era Locker access
        ├── GameScene.ts           # Core physics loop, parallax scrolling, spawners, collisions
        ├── UIScene.ts             # Parallel HUD scene matching reference image + Pause overlay
        └── LockerScene.ts         # Shop to spend Golden Records on Era skins & custom Jetpacks
```

### Build & Deployment Scripts (`package.json` & `vite.config.ts`)
- Set `base: './'` in `vite.config.ts` so the compiled `dist/` directory runs inside itch.io's nested iframe URL as well as Vercel's root domain.
- Include these exact scripts in `package.json`:
  - `"dev"`: `"vite"`
  - `"build"`: `"tsc --noEmit && vite build"`
  - `"preview"`: `"vite preview"`
  - `"zip:itch"`: `"npm run build && cd dist && zip -r ../yeezy-joyride-itch.zip ."`

---

## 5. Exact Visual, Parallax & HUD Specifications

Render at an internal logical resolution of `640x360` with `pixelArt: true`, `roundPixels: true`, and `Phaser.Scale.FIT`:

1. **Layer 0 — Sky & Atmosphere (Speed: 0.05x):**
   - Daytime NYC sky blue gradient (`#5599D4` to `#8CC0EC`) with scrolling chunky pixel-art cumulus clouds.
2. **Layer 1 — Distant NYC Skyline (Speed: 0.15x):**
   - Shaded pixel-art skyscrapers including the Empire State Building, Chrysler Building spire, One World Trade Center, and Manhattan high-rises.
3. **Layer 2 — Midground Brownstones, Street Gap & Subway (Speed: 0.45x):**
   - Red-brick NYC apartment buildings with black iron fire escapes, wooden rooftop water towers on stilts, and red-and-white striped storefront awnings.
   - **Animated Street & Rail Gap:** Between rooftop gaps, render a lower street level with moving NYC Yellow Cabs (`#F7B500`) and an elevated silver MTA subway train passing horizontally on steel tracks.
   - **Iconic Rooftop Billboards:**
     - White billboard with bold red/orange graffiti bubble letters reading **"YEEZY"**.
     - Colorful billboard featuring the **Graduation Bear** mascot.
4. **Layer 3 — Main Playable Rooftop Runway (Speed: 1.0x):**
   - Masonry brick rooftop floor (`Y = 285`) with concrete parapet ledge, rooftop AC condenser units, ventilation ducts, and scurrying tiny pixel-art **Paparazzi NPCs** holding flashing cameras.
5. **HUD Overlay (`UIScene.ts` — Matches Reference Image Exactly):**
   - **Top-Left:** Dark green pixel box (`#1E6B3A`) with a 1px white border displaying `LEVEL 01: NEW YORK` (progresses to `LEVEL 02: CHICAGO`, `LEVEL 03: TOKYO`, `LEVEL 04: PARIS` every 1,000m with palette shifts). Directly below: spinning Golden Vinyl icon + yellow pixel counter (`x47`).
   - **Top-Right:** Crisp white arcade pixel font with 1px black stroke showing `SCORE 002150` on line 1 and `P1` right-aligned on line 2.

---

## 6. Physics, Controls & Audio Specifications

- **Player Scale & Hitbox:** Render Kanye at `20x26` logical pixels with a `16x22` Arcade Physics hitbox (`body.setSize(16, 22)`).
- **Physics Values:** Hold thrust (`SPACE`, `W`, `UP`, or Touch/Mouse `pointerdown` anywhere on canvas) for upward acceleration (`-950 px/s²`) against gravity (`+650 px/s²`), clamped via `setMaxVelocity(0, 260)`.
- **Game Feel & Camera:**
  - Squash-and-stretch tween on landing (`scaleX: 1.18, scaleY: 0.82` for 90ms) and jetpack ignition.
  - 60ms hit-stop freeze + trauma-based directional camera shake on collision.
  - Vertical camera deadzone and subtle horizontal look-ahead.
- **Procedural Web Audio Synthesizer (`ChipHopAudioEngine.ts`):**
  - Synthesize a looping 16-bit chip-hop instrumental groove (808 bassline, crisp snare, hi-hat rolls, pitched soulful chip-lead chords) + SFX (thruster noise, vinyl chime, `[!]` drone lock-on beep, electric zapper buzz, camera shutter, vehicle transformation fanfare).
  - Include `Master`, `Music`, and `SFX` gain buses (in dB), +/-8% random pitch variation on repetitive SFX, sidechain ducking (-6dB on `Music` when warnings or explosions trigger), and a Mute toggle (`M`).

---

## 7. Execution & Verification Checklist for Claude

1. Scaffold all project files listed in Section 4 with complete, production-ready code.
2. Run `npm install` to install `phaser`, `typescript`, and `vite`.
3. Run `npm run build` (`tsc --noEmit && vite build`) and resolve any TypeScript or bundling errors until the build succeeds cleanly with zero warnings.
4. Start the local development server (`npm run dev`) for immediate playtesting.