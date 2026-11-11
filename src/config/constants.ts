/** Logical resolution. Everything is authored against this 640x360 pixel grid. */
export const GAME_W = 640;
export const GAME_H = 360;

/** Vertical play space: rooftop floor and the ceiling line just under the HUD. */
export const FLOOR_Y = 285;
export const CEIL_Y = 28;
/** Resting X of the player. The world scrolls past; the player never runs right. */
export const PLAYER_X = 150;

export const SCENES = {
  BOOT: 'boot',
  TITLE: 'title',
  GAME: 'game',
  UI: 'ui',
  LOCKER: 'locker',
} as const;

export const PHYS = {
  GRAVITY: 650,
  THRUST: -950,
  MAX_VY: 260,
  /** Fraction of downward speed kept at ignition, so the pack answers immediately. */
  IGNITION_DAMP: 0.45,
  PLAYER_W: 20,
  PLAYER_H: 26,
  HITBOX_W: 16,
  HITBOX_H: 22,
  /** Illustrated characters are taller, so their hitbox covers shoulders to boots. */
  PHOTO_HITBOX_H: 32,
  INVULN_MS: 1500,
} as const;

export const RUN = {
  SPEED_START: 175,
  SPEED_MAX: 335,
  /** px/s gained per second of play. */
  SPEED_RAMP: 2.1,
  PX_PER_M: 10,
  LEVEL_LENGTH_M: 1000,
  RECORD_SCORE: 10,
} as const;

export const JUICE = {
  HIT_STOP_MS: 60,
  LAND_SQUASH: { x: 1.18, y: 0.82, ms: 90 },
  IGNITE_STRETCH: { x: 0.86, y: 1.16, ms: 90 },
  SHAKE_DECAY: 1.6,
  SHAKE_MAX_X: 9,
  SHAKE_MAX_Y: 6,
} as const;

export const CAMERA = {
  /** Half height of the vertical deadzone around the camera focus. */
  DEADZONE_Y: 46,
  /** How far the view may pan up/down from rest. */
  PAN_UP: 14,
  PAN_DOWN: 0,
  /** Horizontal look-ahead range in px, eased in with run speed. */
  LOOK_AHEAD: 18,
  RATE: 5,
  /** Extra art drawn past each screen edge so follow + shake never show a void. */
  OVERSCAN: 32,
} as const;

export const DEPTH = {
  SKY: 0,
  CLOUDS: 1,
  SKYLINE: 2,
  MID: 3,
  STREET: 4,
  TRAFFIC: 5,
  RUNWAY: 6,
  PROPS: 7,
  NPC: 8,
  RECORDS: 9,
  HAZARD: 10,
  PROJECTILE: 11,
  PACK: 12,
  PLAYER: 13,
  FX: 14,
  WARNING: 15,
  OVERLAY: 20,
} as const;

/** Unified 16-bit palette. Every baked texture pulls from this table. */
export const PAL = {
  INK: 0x0b0b12,
  BLACK: 0x16161d,
  CHARCOAL: 0x2a2a34,
  SLATE: 0x4a4d5c,
  STEEL: 0x8b90a0,
  SILVER: 0xc3c8d4,
  WHITE: 0xffffff,
  CREAM: 0xf3ead8,
  CONCRETE: 0xa9a59c,
  CONCRETE_DK: 0x7b776f,
  ASPHALT: 0x3a3b44,
  BRICK: 0x9b4a3a,
  BRICK_DK: 0x6f3229,
  BRICK_LT: 0xb86550,
  BROWNSTONE: 0x7a4f3c,
  TAN: 0xb89268,
  WOOD: 0x8a5a36,
  WOOD_DK: 0x5c3a22,
  RUST: 0xb5562a,
  SKIN: 0x7a4a2c,
  SKIN_DK: 0x5a3420,
  SKIN_LT: 0xc98d62,
  GOLD: 0xf7c12e,
  GOLD_DK: 0xb9791a,
  GOLD_LT: 0xffe98a,
  CAB: 0xf7b500,
  ORANGE: 0xf2792b,
  RED: 0xd8342c,
  RED_DK: 0x8f1d1d,
  PINK: 0xf28cb0,
  MAGENTA: 0xe83fb8,
  PURPLE: 0x6a3fa0,
  CYAN: 0x35e0e8,
  TEAL: 0x2aa7a0,
  BLUE: 0x3f6fc4,
  ELECTRIC: 0x8fd8ff,
  GREEN: 0x3fa35a,
  HUD_GREEN: 0x1e6b3a,
  HUD_YELLOW: 0xffd83a,
} as const;

export interface CityDef {
  name: string;
  skyTop: number;
  skyBottom: number;
  /** Base color of the distant skyline silhouettes. */
  skyline: number;
  /** Multiply tints that shift the nearer layers to the city's time of day. */
  cloudTint: number;
  midTint: number;
  nearTint: number;
  /** Lit windows in the skyline (night cities glow). */
  windowLit: number;
}

/** Levels cycle through these every LEVEL_LENGTH_M metres. */
export const CITIES: readonly CityDef[] = [
  {
    name: 'NEW YORK',
    skyTop: 0x5599d4,
    skyBottom: 0x8cc0ec,
    skyline: 0x5d7fa8,
    cloudTint: 0xffffff,
    midTint: 0xffffff,
    nearTint: 0xffffff,
    windowLit: 0x9fc4e8,
  },
  {
    name: 'CHICAGO',
    skyTop: 0xc4563f,
    skyBottom: 0xf7c57c,
    skyline: 0x6b4257,
    cloudTint: 0xffd2a8,
    midTint: 0xffc9a8,
    nearTint: 0xffdcc4,
    windowLit: 0xffd27a,
  },
  {
    name: 'TOKYO',
    skyTop: 0x150d38,
    skyBottom: 0x4b2a7c,
    skyline: 0x241c4c,
    cloudTint: 0x7868c0,
    midTint: 0x8e86d6,
    nearTint: 0xb4aef0,
    windowLit: 0xff5fd0,
  },
  {
    name: 'PARIS',
    skyTop: 0xe488ac,
    skyBottom: 0xfbdcc4,
    skyline: 0x8a6c94,
    cloudTint: 0xffe2ea,
    midTint: 0xffdbe2,
    nearTint: 0xffeaee,
    windowLit: 0xffe6b0,
  },
];

export const TEX = {
  FONT: 'font',
  PIXEL: 'px',
  SKY: 'sky_',
  SKYLINE: 'skyline_',
  CLOUDS: 'clouds',
  MID: 'mid',
  STREET: 'street',
  RUNWAY: 'runway',
  PROPS: 'props',
  CAB: 'cab',
  SUBWAY: 'subway',
  YE: 'ye_',
  PACK: 'pack_',
  MECH: 'mech',
  TRUCK: 'truck',
  BOARD: 'board',
  SHIELD: 'shield',
  RECORD: 'record',
  VINYL: 'vinyl',
  CRATE: 'crate',
  DRONE: 'drone',
  WARN: 'warn',
  NODE: 'znode',
  PYLON: 'zpylon',
  PAP: 'pap',
  FX: 'fx',
} as const;

/** Runway tile layout (px), shared by the baker and the prop placer. */
export const RUNWAY = {
  TILE_W: 896,
  TILE_H: 96,
  TOP: FLOOR_Y - 9,
  /** [start, end) ranges inside the tile that are solid rooftop. */
  ROOFS: [
    [0, 400],
    [512, 784],
  ],
} as const;

/** RetroFont sizes text by glyph cell width; multiples of this stay pixel-perfect. */
export const FONT_PX = 7;

export const hexStr = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Linear blend between two 0xRRGGBB colors. */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export const cityFor = (levelIndex: number): CityDef => CITIES[levelIndex % CITIES.length]!;
export const levelLabel = (levelIndex: number): string =>
  `LEVEL ${String(levelIndex + 1).padStart(2, '0')}: ${cityFor(levelIndex).name}`;
