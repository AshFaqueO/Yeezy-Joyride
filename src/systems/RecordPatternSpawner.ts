import Phaser from 'phaser';
import { CEIL_Y, DEPTH, FLOOR_Y, TEX } from '../config/constants';
import type { SeededRNG } from './ObstacleSpawner';

export type PatternKind = 'line' | 'sine' | 'arc' | 'arrow' | 'stairs' | 'letters';

const PATTERNS: ReadonlyArray<{ kind: PatternKind; weight: number }> = [
  { kind: 'line', weight: 5 },
  { kind: 'sine', weight: 5 },
  { kind: 'arc', weight: 5 },
  { kind: 'arrow', weight: 3 },
  { kind: 'stairs', weight: 3 },
  { kind: 'letters', weight: 2 },
];

/** 3x5 dot-matrix letters for the Y-E-E-Z-Y formation. */
const LETTERS: Record<string, readonly string[]> = {
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  E: ['###', '#..', '##.', '#..', '###'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};

const STEP = 13;
const TOP = CEIL_Y + 18;
const BOTTOM = FLOOR_Y - 12;
const MAGNET_SPEED = 430;

/** Lays out Golden Vinyl records in readable formations from a pooled group. */
export class RecordPatternSpawner {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(
    scene: Phaser.Scene,
    private readonly rng: SeededRNG,
  ) {
    this.group = scene.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      defaultKey: TEX.RECORD,
      maxSize: 170,
    });
  }

  /** Spawns a formation starting at startX and returns its width in px. */
  spawn(kind: PatternKind | null, startX: number): number {
    const pattern = kind ?? this.rng.weighted(PATTERNS).kind;
    let n = 0;
    const put = (x: number, y: number): void => {
      this.place(startX + x, Phaser.Math.Clamp(y, TOP, BOTTOM), n++);
    };

    switch (pattern) {
      case 'line': {
        const count = this.rng.int(7, 12);
        const rows = this.rng.chance(0.35) ? 2 : 1;
        const y = this.rng.range(TOP + 10, BOTTOM - 20);
        for (let r = 0; r < rows; r++) for (let i = 0; i < count; i++) put(i * STEP, y + r * STEP);
        return count * STEP;
      }
      case 'sine': {
        const count = this.rng.int(16, 22);
        const amp = this.rng.range(26, 52);
        const mid = this.rng.range(TOP + amp, BOTTOM - amp);
        const phase = this.rng.range(0, Math.PI * 2);
        for (let i = 0; i < count; i++) put(i * STEP, mid + Math.sin(phase + i * 0.42) * amp);
        return count * STEP;
      }
      case 'arc': {
        const count = this.rng.int(7, 11);
        const height = this.rng.range(34, 70);
        const base = this.rng.range(TOP + height + 6, BOTTOM);
        for (let i = 0; i < count; i++) {
          const t = i / (count - 1);
          put(i * STEP, base - Math.sin(t * Math.PI) * height);
        }
        return count * STEP;
      }
      case 'arrow': {
        const y = this.rng.range(TOP + 34, BOTTOM - 34);
        for (let i = 0; i < 7; i++) put(i * STEP, y);
        for (let k = 1; k <= 2; k++) {
          put((6 - k) * STEP, y - k * STEP);
          put((6 - k) * STEP, y + k * STEP);
        }
        return 7 * STEP;
      }
      case 'stairs': {
        const up = this.rng.chance(0.5);
        const steps = this.rng.int(4, 6);
        const y0 = up ? this.rng.range(BOTTOM - 30, BOTTOM) : this.rng.range(TOP, TOP + 60);
        for (let s = 0; s < steps; s++) {
          for (let i = 0; i < 3; i++) put((s * 3 + i) * STEP, y0 + (up ? -1 : 1) * s * 22);
        }
        return steps * 3 * STEP;
      }
      default: {
        const size = 11;
        const y0 = this.rng.range(TOP + 4, BOTTOM - size * 5);
        let x = 0;
        for (const ch of 'YEEZY') {
          LETTERS[ch]!.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') put(x + rx * size, y0 + ry * size);
          });
          x += size * 3 + 13;
        }
        return x;
      }
    }
  }

  private place(x: number, y: number, index: number): void {
    const record = this.group.get(x, y) as Phaser.Physics.Arcade.Sprite | null;
    if (!record) return;
    record.enableBody(true, x, y, true, true);
    record.setDepth(DEPTH.RECORDS).setScale(1).setAlpha(1);
    const body = record.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(12, 12);
    // Offset the spin per record so a formation shimmers as a wave.
    record.play({ key: 'record-spin', startFrame: index % 6 });
  }

  collect(record: Phaser.Physics.Arcade.Sprite): void {
    record.disableBody(true, true);
  }

  /** Scrolls records; an active magnet (the Mic Drop shield) pulls nearby ones in. */
  update(speed: number, magnet: { x: number; y: number; radius: number } | null): void {
    for (const child of this.group.getChildren()) {
      const record = child as Phaser.Physics.Arcade.Sprite;
      if (!record.active) continue;
      if (record.x < -20) {
        record.disableBody(true, true);
        continue;
      }
      if (magnet) {
        const dx = magnet.x - record.x;
        const dy = magnet.y - record.y;
        const dist = Math.hypot(dx, dy);
        if (dist < magnet.radius && dist > 0.5) {
          record.setVelocity((dx / dist) * MAGNET_SPEED - speed * 0.2, (dy / dist) * MAGNET_SPEED);
          continue;
        }
      }
      record.setVelocity(-speed, 0);
    }
  }
}
