import Phaser from 'phaser';
import { DEPTH, FLOOR_Y, PAL, TEX } from '../config/constants';

/** h/v/d are fixed beams, rot spins about its centre, gate is two pylons on the roof. */
export type ZapperKind = 'h' | 'v' | 'd' | 'rot' | 'gate';

const ARC_COUNT = 4;
const GATE_HEIGHT = 46;
const FLICKER_MS = 55;

/**
 * High-voltage barrier: two steel emitters joined by four crackling arcs.
 *
 * Arcade Physics bodies are axis-aligned boxes, which cannot represent a diagonal
 * or rotating beam, so zappers test the player's hitbox against the beam segment
 * directly (and against a rectangle for the pylon gate).
 */
export class ElectricZapper {
  active = false;
  kind: ZapperKind = 'h';
  x = 0;
  y = 0;

  private length = 80;
  private angle = 0;
  private spin = 0;
  private flickerIn = 0;
  private readonly jitter: number[][] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly endA: Phaser.GameObjects.Image;
  private readonly endB: Phaser.GameObjects.Image;
  private readonly line = new Phaser.Geom.Line();
  private readonly gateRect = new Phaser.Geom.Rectangle();
  private readonly grown = new Phaser.Geom.Rectangle();

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.HAZARD).setVisible(false);
    this.endA = scene.add.image(0, 0, TEX.NODE, 0).setDepth(DEPTH.HAZARD + 0.1).setVisible(false);
    this.endB = scene.add.image(0, 0, TEX.NODE, 0).setDepth(DEPTH.HAZARD + 0.1).setVisible(false);
  }

  /** Half-width of the space this zapper occupies along the scroll axis. */
  get halfWidth(): number {
    if (this.kind === 'gate') return this.length / 2 + 6;
    if (this.kind === 'rot') return this.length / 2 + 6;
    return Math.abs(Math.cos(this.angle)) * (this.length / 2) + 6;
  }

  spawn(kind: ZapperKind, x: number, y: number, length: number, angle: number, spin: number): void {
    this.active = true;
    this.kind = kind;
    this.x = x;
    this.y = kind === 'gate' ? FLOOR_Y : y;
    this.length = length;
    this.angle = kind === 'gate' ? 0 : angle;
    this.spin = spin;
    this.flickerIn = 0;
    const gate = kind === 'gate';
    this.endA.setTexture(gate ? TEX.PYLON : TEX.NODE, 0).setOrigin(0.5, gate ? 1 : 0.5).setVisible(true);
    this.endB.setTexture(gate ? TEX.PYLON : TEX.NODE, 0).setOrigin(0.5, gate ? 1 : 0.5).setVisible(true);
    this.gfx.setVisible(true);
    this.layout();
  }

  kill(): void {
    this.active = false;
    this.gfx.clear().setVisible(false);
    this.endA.setVisible(false);
    this.endB.setVisible(false);
  }

  /** Advances scroll and spin, then redraws the arcs. dx is this frame's scroll in px. */
  update(dtMs: number, dx: number): void {
    if (!this.active) return;
    this.x -= dx;
    if (this.kind === 'rot') this.angle += this.spin * (dtMs / 1000);
    if (this.x < -this.length - 40) {
      this.kill();
      return;
    }
    this.flickerIn -= dtMs;
    if (this.flickerIn <= 0) {
      this.flickerIn = FLICKER_MS;
      this.rollJitter();
    }
    this.layout();
    this.draw();
  }

  /** Does the beam (or gate field) touch this hitbox? */
  hits(rect: Phaser.Geom.Rectangle): boolean {
    if (!this.active) return false;
    if (this.kind === 'gate') return Phaser.Geom.Intersects.RectangleToRectangle(this.gateRect, rect);
    // Grow by the beam's half thickness, minus a pixel of mercy.
    this.grown.setTo(rect.x - 2, rect.y - 2, rect.width + 4, rect.height + 4);
    return Phaser.Geom.Intersects.LineToRectangle(this.line, this.grown);
  }

  /** Bounds of the pylon gate, for projectiles and vehicles that can smash it. */
  get gateBounds(): Phaser.Geom.Rectangle {
    return this.gateRect;
  }

  private layout(): void {
    const half = this.length / 2;
    if (this.kind === 'gate') {
      this.endA.setPosition(this.x - half, FLOOR_Y + 1);
      this.endB.setPosition(this.x + half, FLOOR_Y + 1);
      this.gateRect.setTo(this.x - half - 3, FLOOR_Y - GATE_HEIGHT, this.length + 6, GATE_HEIGHT);
      return;
    }
    const cx = Math.cos(this.angle) * half;
    const cy = Math.sin(this.angle) * half;
    this.line.setTo(this.x - cx, this.y - cy, this.x + cx, this.y + cy);
    this.endA.setPosition(this.line.x1, this.line.y1);
    this.endB.setPosition(this.line.x2, this.line.y2);
  }

  private rollJitter(): void {
    const points = Math.max(3, Math.round(this.length / 8));
    for (let a = 0; a < ARC_COUNT; a++) {
      const row = this.jitter[a] ?? (this.jitter[a] = []);
      row.length = points + 1;
      for (let i = 0; i <= points; i++) {
        // Arcs are purely cosmetic, so unseeded randomness is fine here.
        row[i] = i === 0 || i === points ? 0 : (Math.random() * 2 - 1) * 3.2;
      }
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    if (this.kind === 'gate') {
      const half = this.length / 2;
      for (let a = 0; a < ARC_COUNT; a++) {
        const y = FLOOR_Y - 42 + a * 10;
        this.arc(g, this.x - half + 3, y, this.x + half - 3, y, this.jitter[a] ?? [], 0);
      }
      return;
    }
    const { x1, y1, x2, y2 } = this.line;
    g.lineStyle(7, PAL.BLUE, 0.22);
    g.lineBetween(x1, y1, x2, y2);
    for (let a = 0; a < ARC_COUNT; a++) {
      this.arc(g, x1, y1, x2, y2, this.jitter[a] ?? [], (a - 1.5) * 1.6);
    }
  }

  /** One jagged bolt from A to B, displaced along the perpendicular. */
  private arc(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, jitter: number[], offset: number): void {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const n = Math.max(1, jitter.length - 1);
    for (let pass = 0; pass < 2; pass++) {
      g.lineStyle(pass === 0 ? 3 : 1, pass === 0 ? PAL.ELECTRIC : PAL.WHITE, pass === 0 ? 0.55 : 1);
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const d = (jitter[i] ?? 0) + offset;
        const px = x1 + (x2 - x1) * t + nx * d;
        const py = y1 + (y2 - y1) * t + ny * d;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }
  }
}
