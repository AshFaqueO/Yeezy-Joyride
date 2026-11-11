import Phaser from 'phaser';
import { CEIL_Y, FLOOR_Y, GAME_W, TEX } from '../config/constants';
import { CameraDrone } from '../entities/CameraDrone';
import { ElectricZapper, type ZapperKind } from '../entities/ElectricZapper';
import { RooftopPaparazzi } from '../entities/RooftopPaparazzi';
import type { JuiceManager } from './JuiceManager';
import type { RecordPatternSpawner } from './RecordPatternSpawner';

/**
 * Small self-contained PRNG (mulberry32). The game ships its own generator so a
 * seed reproduces the same run on every browser and after engine updates.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(Math.ceil(min), Math.floor(max) + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Roll proportional to weight. Weights are relative; zero never drops. */
  weighted<T extends { weight: number }>(table: readonly T[]): T {
    let total = 0;
    for (const entry of table) total += Math.max(0, entry.weight);
    let roll = this.range(0, total);
    for (const entry of table) {
      const w = Math.max(0, entry.weight);
      if (w <= 0) continue;
      if (roll < w) return entry;
      roll -= w;
    }
    for (let i = table.length - 1; i >= 0; i--) {
      if (table[i]!.weight > 0) return table[i]!;
    }
    return table[0]!;
  }
}

type WaveKind = 'records' | 'beam_h' | 'beam_v' | 'beam_d' | 'beam_rot' | 'gate' | 'double' | 'paparazzi';

interface WaveDef {
  kind: WaveKind;
  /** Weight at difficulty 0. */
  base: number;
  /** Added weight at difficulty 1. */
  growth: number;
  /** Difficulty at which this wave enters the table. */
  from: number;
}

/** Spawn table: early runs are mostly records and simple beams; hard variants phase in. */
const WAVES: readonly WaveDef[] = [
  { kind: 'records', base: 34, growth: -10, from: 0 },
  { kind: 'beam_h', base: 14, growth: 4, from: 0 },
  { kind: 'beam_v', base: 14, growth: 4, from: 0 },
  { kind: 'gate', base: 10, growth: 4, from: 0 },
  { kind: 'paparazzi', base: 11, growth: 2, from: 0 },
  { kind: 'beam_d', base: 6, growth: 10, from: 0.05 },
  { kind: 'beam_rot', base: 2, growth: 13, from: 0.12 },
  { kind: 'double', base: 1, growth: 11, from: 0.22 },
];

const SPAWN_X = GAME_W + 70;
const MAX_ZAPPERS = 8;

/**
 * Wave director. Walks a distance cursor; each time it runs out it rolls the
 * weighted table, places one wave just off the right edge, and sets the next gap
 * from the current speed so reaction time (not pixel distance) stays fair.
 */
export class ObstacleSpawner {
  readonly zappers: ElectricZapper[] = [];
  readonly drones: Phaser.Physics.Arcade.Group;
  readonly paparazzi: Phaser.Physics.Arcade.Group;

  private cursor = 520;
  private droneIn = 11;
  private sinceRecords = 0;
  private lastKind: WaveKind = 'records';
  private halted = false;

  constructor(
    scene: Phaser.Scene,
    private readonly rng: SeededRNG,
    private readonly records: RecordPatternSpawner,
    private readonly juice: JuiceManager,
  ) {
    for (let i = 0; i < MAX_ZAPPERS; i++) this.zappers.push(new ElectricZapper(scene));
    this.drones = scene.physics.add.group({ classType: CameraDrone, maxSize: 5, defaultKey: TEX.DRONE });
    this.paparazzi = scene.physics.add.group({ classType: RooftopPaparazzi, maxSize: 8, defaultKey: TEX.PAP + 0 });
  }

  /** Stops new waves and cancels pending lock-ons (called when the run ends). */
  halt(): void {
    this.halted = true;
    for (const child of this.drones.getChildren()) {
      const drone = child as CameraDrone;
      if (drone.active && !drone.isFlying) drone.retire();
    }
  }

  /** Makes every photographer near x run for it. */
  scatterNear(x: number, radius: number): void {
    for (const child of this.paparazzi.getChildren()) {
      const pap = child as RooftopPaparazzi;
      if (pap.active && Math.abs(pap.x - x) < radius) pap.scatter();
    }
  }

  /**
   * @param difficulty 0..1 ramp over the run.
   * @returns true if a camera flash caught the player this frame.
   */
  update(dt: number, speed: number, dx: number, difficulty: number, playerX: number, playerY: number): boolean {
    for (const zapper of this.zappers) zapper.update(dt * 1000, dx);

    for (const child of this.drones.getChildren()) {
      const drone = child as CameraDrone;
      if (drone.active) drone.tick(dt, playerY, speed, this.juice);
    }

    let blinded = false;
    for (const child of this.paparazzi.getChildren()) {
      const pap = child as RooftopPaparazzi;
      if (pap.active && pap.tick(dt, speed, playerX, playerY)) blinded = true;
    }

    if (this.halted) return blinded;

    this.cursor -= dx;
    if (this.cursor <= 0) {
      const width = this.spawnWave(difficulty);
      const reaction = Phaser.Math.Linear(1.12, 0.66, difficulty) + this.rng.range(0, 0.3);
      this.cursor = width + speed * reaction;
    }

    this.droneIn -= dt;
    if (this.droneIn <= 0) {
      this.launchDrones(difficulty, playerY);
      this.droneIn = Phaser.Math.Linear(9.5, 4.2, difficulty) + this.rng.range(0, 3);
    }
    return blinded;
  }

  private rollWave(difficulty: number): WaveKind {
    // Pity rule: never more than two hazard waves without a record pattern.
    if (this.sinceRecords >= 2) return 'records';
    const table = WAVES.filter((w) => difficulty >= w.from && w.kind !== this.lastKind).map((w) => ({
      kind: w.kind,
      weight: w.base + w.growth * difficulty,
    }));
    return this.rng.weighted(table).kind;
  }

  private spawnWave(difficulty: number): number {
    const kind = this.rollWave(difficulty);
    this.lastKind = kind;
    this.sinceRecords = kind === 'records' ? 0 : this.sinceRecords + 1;
    const top = CEIL_Y + 14;
    const bottom = FLOOR_Y - 14;

    switch (kind) {
      case 'records': {
        const width = this.records.spawn(null, SPAWN_X);
        // Photographers like to loiter under the loot.
        if (this.rng.chance(0.35)) this.spawnPaparazzi(SPAWN_X + width * 0.5, 1);
        return width;
      }
      case 'beam_h': {
        const length = this.rng.range(60, 112);
        return this.spawnZapper('h', SPAWN_X + length / 2, this.rng.range(top + 6, bottom - 6), length, 0, 0);
      }
      case 'beam_v': {
        const length = this.rng.range(62, 112);
        const y = this.rng.range(top + length / 2, bottom - length / 2);
        return this.spawnZapper('v', SPAWN_X + 8, y, length, Math.PI / 2, 0);
      }
      case 'beam_d': {
        const length = this.rng.range(74, 112);
        const angle = this.rng.range(0.5, 0.95) * (this.rng.chance(0.5) ? 1 : -1);
        const reach = (Math.abs(Math.sin(angle)) * length) / 2;
        const y = this.rng.range(top + reach, bottom - reach);
        return this.spawnZapper('d', SPAWN_X + length / 2, y, length, angle, 0);
      }
      case 'beam_rot': {
        const length = this.rng.range(78, 100);
        const spin = this.rng.range(1.1, 1.9) * (this.rng.chance(0.5) ? 1 : -1);
        const y = this.rng.range(top + length / 2, bottom - length / 2);
        return this.spawnZapper('rot', SPAWN_X + length / 2, y, length, this.rng.range(0, Math.PI), spin);
      }
      case 'gate': {
        const length = this.rng.range(46, 72);
        return this.spawnZapper('gate', SPAWN_X + length / 2, FLOOR_Y, length, 0, 0);
      }
      case 'double': {
        // Two vertical beams leave one window to thread.
        const gap = this.rng.range(86, 104);
        const windowTop = this.rng.range(CEIL_Y + 44, FLOOR_Y - gap - 44);
        const upper = windowTop - CEIL_Y - 4;
        const lower = FLOOR_Y - (windowTop + gap) - 4;
        this.spawnZapper('v', SPAWN_X + 8, CEIL_Y + 4 + upper / 2, upper, Math.PI / 2, 0);
        this.spawnZapper('v', SPAWN_X + 8, windowTop + gap + lower / 2, lower, Math.PI / 2, 0);
        return 28;
      }
      default:
        return this.spawnPaparazzi(SPAWN_X, this.rng.int(1, 3));
    }
  }

  private spawnZapper(kind: ZapperKind, x: number, y: number, length: number, angle: number, spin: number): number {
    const zapper = this.zappers.find((z) => !z.active);
    if (!zapper) return 0;
    zapper.spawn(kind, x, y, length, angle, spin);
    return zapper.halfWidth * 2;
  }

  private spawnPaparazzi(x: number, count: number): number {
    for (let i = 0; i < count; i++) {
      const pap = this.paparazzi.get(x + i * 26, FLOOR_Y) as RooftopPaparazzi | null;
      if (!pap) break;
      pap.spawn(x + i * 26, this.rng.int(0, 2), this.rng.range(-26, 22));
    }
    return count * 26;
  }

  private launchDrones(difficulty: number, playerY: number): void {
    let count = 1;
    if (difficulty > 0.75 && this.rng.chance(0.3)) count = 3;
    else if (difficulty > 0.35 && this.rng.chance(0.35)) count = 2;
    for (let i = 0; i < count; i++) {
      const drone = this.drones.get(GAME_W + 60, playerY) as CameraDrone | null;
      if (!drone) return;
      drone.arm(playerY, i * 0.55);
    }
  }
}
