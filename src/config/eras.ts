import { PAL } from './constants';

export type EraId = 'donda' | 'slim' | 'dropout' | 'heartbreak' | 'yeezus';
export type JetpackId = 'gold' | 'autotune' | 'hype';
export type VehicleId = 'mech' | 'truck' | 'shield' | 'board';

/** Colors the texture baker uses to dress the 20x26 Ye sprite for one era. */
export interface EraLook {
  skin: number;
  skinDark: number;
  top: number;
  topLight: number;
  topDark: number;
  legs: number;
  legsDark: number;
  shoes: number;
  head: 'bald' | 'hair' | 'mask';
  shades: boolean;
  goatee: boolean;
  detail: 'quilt' | 'collar' | 'suit' | 'studs';
}

export interface EraDef {
  id: EraId;
  name: string;
  blurb: string;
  look: EraLook;
  /**
   * High-resolution illustrated character (see CharacterRig). These have the
   * jetpack painted on, so the separate pack sprite is hidden for them.
   */
  rig?: string;
  /** Soundtrack file (src/assets/music/<name>.*) that plays while this character is equipped. */
  music: string;
}

export const ERAS: readonly EraDef[] = [
  {
    id: 'donda',
    name: 'DONDA',
    blurb: 'BLACK PUFFER, CARGOS, BOOTS',
    rig: 'ye',
    music: 'theme',
    look: {
      skin: PAL.SKIN,
      skinDark: PAL.SKIN_DK,
      top: 0x1c1c24,
      topLight: 0x3a3a48,
      topDark: 0x101016,
      legs: 0x20202a,
      legsDark: 0x121218,
      shoes: 0x0c0c10,
      head: 'bald',
      shades: true,
      goatee: true,
      detail: 'quilt',
    },
  },
  {
    id: 'slim',
    name: 'SLIM SHADY',
    blurb: 'BLEACHED CROP, HOODIE, MIC IN HAND',
    rig: 'slim',
    music: 'slim',
    look: {
      skin: 0xe8b890,
      skinDark: 0xc08a64,
      top: 0x4a4d55,
      topLight: 0x6c7078,
      topDark: 0x2e3038,
      legs: 0x2f4a3c,
      legsDark: 0x1f3328,
      shoes: 0xf0f0f0,
      head: 'bald',
      shades: false,
      goatee: false,
      detail: 'quilt',
    },
  },
  {
    id: 'dropout',
    name: 'COLLEGE DROPOUT',
    blurb: 'PINK POLO, JEANS, BACKPACK',
    music: 'theme',
    look: {
      skin: PAL.SKIN,
      skinDark: PAL.SKIN_DK,
      top: PAL.PINK,
      topLight: 0xffc0d6,
      topDark: 0xc45c84,
      legs: 0x3f5fa8,
      legsDark: 0x2c4380,
      shoes: 0xf0f0f0,
      head: 'hair',
      shades: false,
      goatee: false,
      detail: 'collar',
    },
  },
  {
    id: 'heartbreak',
    name: '808S HEARTBREAK',
    blurb: 'GREY SUIT, BROKEN HEART PIN',
    music: 'theme',
    look: {
      skin: PAL.SKIN,
      skinDark: PAL.SKIN_DK,
      top: 0x8a8d98,
      topLight: 0xb4b7c2,
      topDark: 0x5e6170,
      legs: 0x7c7f8a,
      legsDark: 0x565966,
      shoes: 0x1a1a20,
      head: 'hair',
      shades: true,
      goatee: false,
      detail: 'suit',
    },
  },
  {
    id: 'yeezus',
    name: 'YEEZUS',
    blurb: 'CRYSTAL MASK, PUNK LEATHER',
    music: 'theme',
    look: {
      skin: PAL.SKIN,
      skinDark: PAL.SKIN_DK,
      top: 0x18181e,
      topLight: 0x50505e,
      topDark: 0x0c0c10,
      legs: 0x34384a,
      legsDark: 0x22263a,
      shoes: 0xb89268,
      head: 'mask',
      shades: false,
      goatee: false,
      detail: 'studs',
    },
  },
];

export interface JetpackDef {
  id: JetpackId;
  name: string;
  blurb: string;
  body: number;
  trim: number;
  /** Thrust multiplier; recoil packs trade steady push for kicks. */
  thrustScale: number;
}

export const JETPACKS: readonly JetpackDef[] = [
  {
    id: 'gold',
    name: 'GOLD RECORD PACK',
    blurb: 'FLAMES, SPARKS AND MUSIC NOTES',
    body: PAL.SILVER,
    trim: PAL.TEAL,
    thrustScale: 1,
  },
  {
    id: 'autotune',
    name: 'AUTO-TUNE PACK',
    blurb: 'NEON RINGS SMASH ROOFTOP GATES',
    body: 0x3a2a6a,
    trim: PAL.CYAN,
    thrustScale: 1,
  },
  {
    id: 'hype',
    name: 'HYPE-BOOST PACK',
    blurb: 'FIRES SNEAKERS, KICKS LIKE A MULE',
    body: PAL.CREAM,
    trim: PAL.ORANGE,
    thrustScale: 0.9,
  },
];

export interface VehicleDef {
  id: VehicleId;
  name: string;
  /** Obstacle contacts absorbed before reverting to the jetpack. */
  hits: number;
  /** Scroll speed multiplier while active. */
  speedScale: number;
  /** 0 = lasts until broken. */
  durationMs: number;
  weight: number;
}

export const VEHICLES: readonly VehicleDef[] = [
  { id: 'mech', name: 'GRADUATION BEAR MECH', hits: 1, speedScale: 1, durationMs: 0, weight: 3 },
  { id: 'truck', name: 'YZY TRUCK', hits: 1, speedScale: 1.25, durationMs: 0, weight: 3 },
  { id: 'shield', name: 'GOLDEN MIC DROP', hits: 3, speedScale: 1, durationMs: 12000, weight: 2 },
  { id: 'board', name: 'SLIDE HOVERBOARD', hits: 1, speedScale: 1.3, durationMs: 0, weight: 3 },
];

export const eraById = (id: EraId): EraDef => ERAS.find((e) => e.id === id) ?? ERAS[0]!;
export const jetpackById = (id: JetpackId): JetpackDef =>
  JETPACKS.find((j) => j.id === id) ?? JETPACKS[0]!;
export const vehicleById = (id: VehicleId): VehicleDef =>
  VEHICLES.find((v) => v.id === id) ?? VEHICLES[0]!;

/* ------------------------------------------------------------------ */
/* Player profile: loadout and stats. Every character and jetpack is   */
/* free; records are a running total, not a currency. Stored locally.  */
/* ------------------------------------------------------------------ */

export interface Profile {
  /** Lifetime Golden Records collected. */
  records: number;
  best: number;
  era: EraId;
  jetpack: JetpackId;
  muted: boolean;
}

const STORAGE_KEY = 'yeezy-joyride-profile-v1';

const defaultProfile = (): Profile => ({
  records: 0,
  best: 0,
  era: 'donda',
  jetpack: 'gold',
  muted: false,
});

let cached: Profile | null = null;

export function getProfile(): Profile {
  if (cached) return cached;
  const base = defaultProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Profile>;
      base.records = Math.max(0, Math.floor(Number(data.records) || 0));
      base.best = Math.max(0, Math.floor(Number(data.best) || 0));
      base.muted = data.muted === true;
      if (ERAS.some((e) => e.id === data.era)) base.era = data.era!;
      if (JETPACKS.some((j) => j.id === data.jetpack)) base.jetpack = data.jetpack!;
    }
  } catch {
    // Storage blocked (private mode, sandboxed iframe): play with an in-memory profile.
  }
  cached = base;
  return base;
}

export function saveProfile(): void {
  if (!cached) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Same as above: progress simply lasts for this page load.
  }
}

export function equipEra(id: EraId): void {
  getProfile().era = id;
  saveProfile();
}

export function equipJetpack(id: JetpackId): void {
  getProfile().jetpack = id;
  saveProfile();
}
