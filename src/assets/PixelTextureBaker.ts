import Phaser from 'phaser';
import { CITIES, GAME_H, GAME_W, PAL, RUNWAY, TEX, hexStr, mix, type CityDef } from '../config/constants';
import { ERAS, JETPACKS, type EraLook } from '../config/eras';
import { SeededRNG } from '../systems/ObstacleSpawner';

/* ------------------------------------------------------------------ */
/* 5x7 arcade font. Each glyph is seven rows of five cells.            */
/* ------------------------------------------------------------------ */

const GLYPHS: Record<string, string> = {
  ' ': '..... ..... ..... ..... ..... ..... .....',
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '.###. #.... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ....# .###.',
  ':': '..... ..#.. ..#.. ..... ..#.. ..#.. .....',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  x: '..... ..... #...# .#.#. ..#.. .#.#. #...#',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '[': '.###. .#... .#... .#... .#... .#... .###.',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
  '&': '.#... #.#.. #.#.. .#... #.#.# #..#. .##.#',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '*': '..... #.#.# .###. ##### .###. #.#.# .....',
};

const FONT_CHARS = Object.keys(GLYPHS).join('');
const FONT_CELL_W = 7;
const FONT_CELL_H = 9;
const FONT_PER_ROW = 16;

const glyphRows = (ch: string): string[] => (GLYPHS[ch] ?? GLYPHS['?']!).split(' ');

/* ------------------------------------------------------------------ */
/* Painter: integer-pixel drawing on a 2D canvas.                      */
/* ------------------------------------------------------------------ */

class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    private readonly ox = 0,
    private readonly oy = 0,
  ) {}

  at(dx: number, dy: number): Painter {
    return new Painter(this.ctx, this.ox + dx, this.oy + dy);
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): this {
    if (w <= 0 || h <= 0) return this;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = hexStr(color);
    this.ctx.fillRect(Math.round(this.ox + x), Math.round(this.oy + y), Math.round(w), Math.round(h));
    this.ctx.globalAlpha = 1;
    return this;
  }

  px(x: number, y: number, color: number, alpha = 1): this {
    return this.rect(x, y, 1, 1, color, alpha);
  }

  clear(x: number, y: number, w: number, h: number): this {
    this.ctx.clearRect(Math.round(this.ox + x), Math.round(this.oy + y), Math.round(w), Math.round(h));
    return this;
  }

  /** Pixel matrix: each string is a row, each character looks up a color. */
  matrix(x: number, y: number, rows: readonly string[], colors: Record<string, number>): this {
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const c = colors[row[rx]!];
        if (c !== undefined) this.px(x + rx, y + ry, c);
      }
    });
    return this;
  }

  /** Filled ellipse by per-pixel test, so edges stay chunky. */
  disc(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, color, alpha);
      }
    }
    return this;
  }

  /** Ellipse outline between an inner and outer radius ratio. */
  ring(cx: number, cy: number, rx: number, ry: number, inner: number, color: number, alpha = 1): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1 && d >= inner * inner) this.px(x, y, color, alpha);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, color: number, alpha = 1): this {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x, y, color, alpha);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  /** Solid shape that narrows from wBottom at baseY to wTop at the tip. */
  taper(cx: number, baseY: number, h: number, wBottom: number, wTop: number, color: number, pow = 1): this {
    for (let i = 0; i < h; i++) {
      const t = i / Math.max(1, h - 1);
      const w = Math.max(1, Math.round(wTop + (wBottom - wTop) * Math.pow(1 - t, pow)));
      this.rect(Math.round(cx - w / 2), baseY - 1 - i, w, 1, color);
    }
    return this;
  }

  /** Open steel tower: two legs plus cross girders, as for radio and iron towers. */
  lattice(cx: number, baseY: number, h: number, wBottom: number, wTop: number, pow: number, colorAt: (i: number) => number): this {
    for (let i = 0; i < h; i++) {
      const t = i / Math.max(1, h - 1);
      const w = Math.max(1, Math.round(wTop + (wBottom - wTop) * Math.pow(1 - t, pow)));
      const left = Math.round(cx - w / 2);
      const c = colorAt(i);
      const leg = Math.max(1, Math.min(3, Math.round(w / 8)));
      if (w <= 6 || i % 7 === 0) {
        this.rect(left, baseY - 1 - i, w, 1, c);
      } else {
        this.rect(left, baseY - 1 - i, leg, 1, c);
        this.rect(left + w - leg, baseY - 1 - i, leg, 1, c);
        if (w > 12) this.px(left + Math.round(((i % 7) / 7) * (w - 1)), baseY - 1 - i, c, 0.8);
      }
    }
    return this;
  }

  bricks(x: number, y: number, w: number, h: number, base: number, dark: number): this {
    this.rect(x, y, w, h, base);
    for (let r = 0; r * 4 < h; r++) {
      const ry = y + r * 4;
      if (r * 4 + 3 < h) this.rect(x, ry + 3, w, 1, dark, 0.55);
      for (let bx = x + (r % 2 ? 4 : 0); bx < x + w; bx += 8) {
        this.rect(bx, ry, 1, Math.min(3, h - r * 4), dark, 0.4);
      }
    }
    return this;
  }

  /** Text in the baked 5x7 font, for signs painted into textures. */
  text(str: string, x: number, y: number, scale: number, color: number): this {
    let cx = x;
    for (const ch of str) {
      glyphRows(ch).forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '#') this.rect(cx + rx * scale, y + ry * scale, scale, scale, color);
        }
      });
      cx += 6 * scale;
    }
    return this;
  }
}

type Draw = (p: Painter) => void;

interface AtlasItem {
  name: string | number;
  w: number;
  h: number;
  draw: Draw;
  /** When set, art is drawn inset by 1px and wrapped in a 1px outline of this color. */
  outline?: number;
}

function scratch(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Adds a 1px outline around every opaque region (4-neighbour). */
function applyOutline(ctx: CanvasRenderingContext2D, w: number, h: number, color: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3]! > 40;
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        const i = (y * w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ */
/* The baker                                                           */
/* ------------------------------------------------------------------ */

/**
 * Generates every texture the game uses at boot, straight into Phaser's texture
 * manager. Nothing is downloaded, so no asset URL can fail on itch.io or Vercel.
 */
export class PixelTextureBaker {
  constructor(private readonly scene: Phaser.Scene) {}

  bakeAll(): void {
    this.bakeFont();
    this.bakeSkies();
    this.bakeClouds();
    CITIES.forEach((city, i) => this.bakeSkyline(i, city));
    this.bakeMidground();
    this.bakeStreet();
    this.bakeRunway();
    this.bakeProps();
    this.bakeTraffic();
    this.bakeYe();
    this.bakePacks();
    this.bakeVehicles();
    this.bakeCollectibles();
    this.bakeHazards();
    this.bakePaparazzi();
    this.bakeFx();
  }

  /* ---------------------------- helpers ---------------------------- */

  private canvasTexture(key: string, w: number, h: number): { tex: Phaser.Textures.CanvasTexture; p: Painter } | null {
    if (this.scene.textures.exists(key)) return null;
    const tex = this.scene.textures.createCanvas(key, w, h);
    if (!tex) return null;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    return { tex, p: new Painter(ctx) };
  }

  /** Packs differently sized frames in one row and registers each by name. */
  private atlas(key: string, items: AtlasItem[]): void {
    const width = items.reduce((sum, it) => sum + it.w, 0);
    const height = items.reduce((max, it) => Math.max(max, it.h), 0);
    const made = this.canvasTexture(key, width, height);
    if (!made) return;
    let x = 0;
    for (const it of items) {
      const { canvas, ctx } = scratch(it.w, it.h);
      if (it.outline !== undefined) {
        it.draw(new Painter(ctx, 1, 1));
        applyOutline(ctx, it.w, it.h, it.outline);
      } else {
        it.draw(new Painter(ctx));
      }
      made.tex.getContext().drawImage(canvas, x, 0);
      made.tex.add(it.name, 0, x, 0, it.w, it.h);
      x += it.w;
    }
    made.tex.refresh();
  }

  /** Uniform frames numbered 0..n-1, usable with generateFrameNumbers. */
  private sheet(key: string, w: number, h: number, frames: Draw[], outline?: number): void {
    this.atlas(
      key,
      frames.map((draw, i) => ({ name: i, w, h, draw, outline })),
    );
  }

  /* ------------------------------ font ----------------------------- */

  private bakeFont(): void {
    const rows = Math.ceil(FONT_CHARS.length / FONT_PER_ROW);
    const made = this.canvasTexture(TEX.FONT, FONT_PER_ROW * FONT_CELL_W, rows * FONT_CELL_H);
    if (made) {
      [...FONT_CHARS].forEach((ch, i) => {
        const cell = made.p.at((i % FONT_PER_ROW) * FONT_CELL_W, Math.floor(i / FONT_PER_ROW) * FONT_CELL_H);
        const glyph = glyphRows(ch);
        // 1px black stroke first (8 neighbours), then the white face on top.
        glyph.forEach((row, ry) => {
          for (let rx = 0; rx < 5; rx++) {
            if (row[rx] === '#') cell.rect(rx, ry, 3, 3, PAL.INK);
          }
        });
        glyph.forEach((row, ry) => {
          for (let rx = 0; rx < 5; rx++) {
            if (row[rx] === '#') cell.px(rx + 1, ry + 1, PAL.WHITE);
          }
        });
      });
      made.tex.refresh();
    }
    if (!this.scene.cache.bitmapFont.exists(TEX.FONT)) {
      const config = {
        image: TEX.FONT,
        width: FONT_CELL_W,
        height: FONT_CELL_H,
        chars: FONT_CHARS,
        charsPerRow: FONT_PER_ROW,
        'offset.x': 0,
        'offset.y': 0,
        'spacing.x': 0,
        'spacing.y': 0,
        lineSpacing: 2,
      };
      this.scene.cache.bitmapFont.add(TEX.FONT, Phaser.GameObjects.RetroFont.Parse(this.scene, config));
    }
  }

  /* --------------------------- backdrops --------------------------- */

  private bakeSkies(): void {
    const w = GAME_W + 64;
    const h = GAME_H + 64;
    CITIES.forEach((city, i) => {
      const made = this.canvasTexture(TEX.SKY + i, w, h);
      if (!made) return;
      const bands = 14;
      const bandH = h / bands;
      for (let b = 0; b < bands; b++) {
        const y = Math.round(b * bandH);
        const color = mix(city.skyTop, city.skyBottom, b / (bands - 1));
        made.p.rect(0, y, w, Math.ceil(bandH), color);
        if (b > 0) {
          // Two-row checker dither softens each band edge without smooth gradients.
          const prev = mix(city.skyTop, city.skyBottom, (b - 1) / (bands - 1));
          for (let x = 0; x < w; x += 2) {
            made.p.px(x, y, prev);
            made.p.px(x + 1, y + 1, prev);
          }
        }
      }
      if (city.name === 'TOKYO') {
        const rng = new SeededRNG(77);
        for (let s = 0; s < 70; s++) {
          made.p.px(rng.int(0, w - 1), rng.int(0, h * 0.6), PAL.WHITE, rng.range(0.4, 1));
        }
        made.p.disc(520, 70, 13, 13, 0xf4f0d8).disc(526, 66, 10, 10, mix(city.skyTop, city.skyBottom, 0.15));
      }
      if (city.name === 'CHICAGO') made.p.disc(470, 250, 26, 26, 0xffe9a8).disc(470, 250, 20, 20, 0xfff6d0);
      made.tex.refresh();
    });
  }

  private bakeClouds(): void {
    const made = this.canvasTexture(TEX.CLOUDS, 512, 160);
    if (!made) return;
    const rng = new SeededRNG(1977);
    const spots = [
      [60, 36, 1.2],
      [190, 84, 0.8],
      [300, 30, 1],
      [420, 70, 1.3],
      [130, 132, 0.7],
      [360, 126, 0.9],
    ] as const;
    for (const [cx, baseY, s] of spots) {
      const puffs: Array<[number, number, number]> = [];
      const count = rng.int(4, 6);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const r = (6 + Math.sin(t * Math.PI) * 9 + rng.range(-2, 2)) * s;
        puffs.push([cx + (t - 0.5) * 60 * s, baseY - r * 0.55, r]);
      }
      for (const [x, y, r] of puffs) made.p.disc(x, y + 3, r, r, 0xc9def2);
      for (const [x, y, r] of puffs) made.p.disc(x, y, r, r, PAL.WHITE);
      for (const [x, y, r] of puffs) made.p.disc(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.4, PAL.WHITE);
      // Flat cumulus base.
      made.p.clear(cx - 50 * s, baseY + 2, 100 * s, 24);
      made.p.rect(cx - 30 * s, baseY, 60 * s, 2, 0xc9def2);
    }
    made.tex.refresh();
  }

  private bakeSkyline(index: number, city: CityDef): void {
    const W = 512;
    const H = 280;
    const made = this.canvasTexture(TEX.SKYLINE + index, W, H);
    if (!made) return;
    const p = made.p;
    const rng = new SeededRNG(4000 + index * 31);
    const low = city.name === 'PARIS';
    const back = mix(city.skyline, city.skyBottom, 0.5);
    const front = city.skyline;
    const frontDark = mix(city.skyline, PAL.INK, 0.25);

    for (let x = 0; x < W; ) {
      const w = Math.min(rng.int(14, 30), W - x);
      const h = low ? rng.int(50, 80) : rng.int(70, 160);
      p.rect(x, H - h, w, h, back);
      p.rect(x + w - 2, H - h, 2, h, mix(back, city.skyline, 0.4));
      x += w;
    }

    this.drawLandmarks(p, city, H);

    for (let x = 0; x < W; ) {
      const w = Math.min(rng.int(18, 40), W - x);
      const h = low ? rng.int(40, 62) : rng.int(46, 118);
      const top = H - h;
      p.rect(x, top, w, h, front);
      p.rect(x + w - 3, top, 3, h, frontDark);
      if (low) {
        // Mansard roof with dormers.
        p.rect(x, top, w, 7, mix(front, 0x5a6478, 0.6));
        for (let dx = x + 3; dx < x + w - 4; dx += 7) p.rect(dx, top + 2, 3, 4, city.windowLit, 0.7);
      } else if (rng.chance(0.3)) {
        p.rect(x + Math.floor(w / 2) - 1, top - rng.int(6, 14), 1, 14, frontDark);
      } else if (rng.chance(0.3)) {
        p.rect(x + 3, top - 4, w - 8, 4, frontDark);
      }
      for (let wy = top + (low ? 12 : 5); wy < H - 4; wy += 5) {
        for (let wx = x + 2; wx < x + w - 4; wx += 4) {
          if (rng.chance(0.42)) p.rect(wx, wy, 2, 2, city.windowLit, 0.75);
          else p.rect(wx, wy, 2, 2, frontDark, 0.6);
        }
      }
      x += w;
    }
    made.tex.refresh();
  }

  private drawLandmarks(p: Painter, city: CityDef, base: number): void {
    const k = (n: number): number => Math.round(n * 1.4);
    const stone = mix(city.skyline, 0xd9c7ac, 0.4);
    const stoneDark = mix(stone, PAL.INK, 0.22);
    const glass = mix(city.skyline, 0xa8d4f4, 0.45);
    const dark = mix(city.skyline, PAL.INK, 0.45);
    const lit = city.windowLit;

    const tier = (cx: number, w: number, from: number, to: number, c: number, cd: number): void => {
      p.rect(cx - w / 2, base - k(to), w, k(to) - k(from), c);
      p.rect(cx + w / 2 - Math.ceil(w / 3), base - k(to), Math.ceil(w / 3), k(to) - k(from), cd);
      for (let x = cx - w / 2 + 2; x < cx + w / 2 - 1; x += 3) {
        p.rect(x, base - k(to) + 2, 1, k(to) - k(from) - 2, cd, 0.5);
      }
    };

    switch (city.name) {
      case 'NEW YORK': {
        // Chrysler Building
        tier(118, 20, 0, 100, glass, mix(glass, PAL.INK, 0.2));
        p.taper(118, base - k(100), 30, 18, 2, PAL.SILVER);
        for (let i = 0; i < 5; i++) p.rect(118 - 7 + i, base - k(100) - 6 - i * 5, 14 - i * 2, 1, PAL.STEEL);
        p.rect(118, base - k(100) - 52, 1, 24, PAL.SILVER);
        // Empire State Building
        tier(256, 38, 0, 92, stone, stoneDark);
        tier(256, 30, 92, 122, stone, stoneDark);
        tier(256, 20, 122, 142, stone, stoneDark);
        tier(256, 12, 142, 152, stone, stoneDark);
        p.rect(254, base - k(162), 4, k(10), stoneDark);
        p.rect(255, base - k(184), 2, k(22), stone);
        p.rect(255, base - k(184) - 8, 1, 8, PAL.SILVER);
        // One World Trade Center
        p.taper(404, base, k(150), 30, 14, glass);
        p.taper(410, base, k(150), 14, 4, mix(glass, PAL.WHITE, 0.25));
        p.rect(404, base - k(150) - 30, 1, 30, PAL.SILVER);
        break;
      }
      case 'CHICAGO': {
        // Willis Tower: stepped black tubes and twin antennas
        tier(300, 34, 0, 100, dark, mix(dark, PAL.INK, 0.4));
        tier(296, 24, 100, 126, dark, mix(dark, PAL.INK, 0.4));
        tier(294, 14, 126, 146, dark, mix(dark, PAL.INK, 0.4));
        p.rect(290, base - k(146) - 34, 1, 34, PAL.SILVER);
        p.rect(297, base - k(146) - 28, 1, 28, PAL.SILVER);
        for (let y = base - k(146); y < base; y += 12) p.rect(283, y, 34, 1, lit, 0.35);
        // Hancock Center: tapered with X bracing
        p.taper(130, base, k(118), 32, 18, dark);
        for (let s = 0; s < 5; s++) {
          const y0 = base - s * 32;
          p.line(116, y0, 144, y0 - 32, lit, 0.4).line(144, y0, 116, y0 - 32, lit, 0.4);
        }
        p.rect(126, base - k(118) - 26, 1, 26, PAL.SILVER).rect(134, base - k(118) - 26, 1, 26, PAL.SILVER);
        break;
      }
      case 'TOKYO': {
        // Tokyo Tower: red and white lattice
        p.lattice(160, base, k(132), 56, 2, 2.1, (i) => (Math.floor(i / 16) % 2 === 0 ? 0xf0502e : 0xf4ead8));
        p.rect(148, base - k(48), 24, 5, 0xf4ead8).rect(153, base - k(86), 14, 4, 0xf4ead8);
        // Skytree: thin mast with observation pods
        p.taper(384, base, k(150), 9, 3, mix(city.skyline, 0xbcd0ff, 0.6));
        p.rect(378, base - k(112), 13, 7, 0xd8e4ff).rect(380, base - k(98), 9, 4, 0xd8e4ff);
        p.rect(384, base - k(150) - 28, 1, 28, lit);
        for (let y = base - k(110); y < base; y += 9) p.px(384, y, lit);
        break;
      }
      default: {
        // Eiffel Tower
        const iron = mix(0x4e3d30, city.skyline, 0.25);
        p.lattice(256, base, k(150), 76, 2, 2.6, () => iron);
        p.rect(236, base - k(40), 40, 5, iron).rect(246, base - k(78), 20, 4, iron);
        p.rect(256, base - k(150) - 14, 1, 14, iron);
        // Sacre-Coeur style domes on the hill
        p.rect(92, base - 96, 44, 96, mix(city.skyline, PAL.CREAM, 0.5));
        p.disc(114, base - 100, 13, 18, mix(city.skyline, PAL.CREAM, 0.6));
        p.disc(96, base - 94, 6, 9, mix(city.skyline, PAL.CREAM, 0.6)).disc(132, base - 94, 6, 9, mix(city.skyline, PAL.CREAM, 0.6));
        p.rect(114, base - 126, 1, 9, iron);
        break;
      }
    }
  }

  private bakeMidground(): void {
    const W = 640;
    const H = 240;
    const made = this.canvasTexture(TEX.MID, W, H);
    if (!made) return;
    const p = made.p;
    const rng = new SeededRNG(808);
    const glassDark = 0x2a3850;

    const building = (x: number, w: number, roof: number, base: number): void => {
      const dark = mix(base, PAL.INK, 0.38);
      const light = mix(base, PAL.CREAM, 0.45);
      p.bricks(x, roof, w, H - roof, base, dark);
      p.rect(x + w - 4, roof, 4, H - roof, PAL.INK, 0.22);
      p.rect(x, roof, 1, H - roof, PAL.INK, 0.3);
      // Cornice with dentils
      p.rect(x - 1, roof - 3, w + 2, 4, dark).rect(x - 1, roof - 3, w + 2, 1, light);
      for (let dx = x + 1; dx < x + w - 1; dx += 4) p.rect(dx, roof + 1, 2, 2, dark);
      // Windows
      for (let wy = roof + 13; wy < H - 52; wy += 27) {
        for (let wx = x + 9; wx + 10 < x + w - 6; wx += 19) {
          p.rect(wx - 1, wy - 2, 12, 2, light);
          p.rect(wx, wy, 10, 15, PAL.CREAM);
          p.rect(wx + 1, wy + 1, 8, 13, rng.chance(0.18) ? 0xe2bb6c : glassDark);
          p.rect(wx + 1, wy + 7, 8, 1, PAL.CREAM);
          if (rng.chance(0.4)) p.rect(wx + 1, wy + 1, 8, rng.int(3, 6), 0xcdd3dc, 0.85);
          p.px(wx + 2, wy + 2, PAL.WHITE, 0.5);
          p.rect(wx - 2, wy + 15, 14, 2, light);
        }
      }
    };

    const fireEscape = (x: number, roof: number): void => {
      for (let wy = roof + 13; wy < H - 60; wy += 27) {
        const y = wy + 17;
        p.rect(x, y, 34, 2, PAL.INK);
        p.rect(x, y - 8, 34, 1, PAL.INK);
        for (let rx = x; rx < x + 34; rx += 3) p.rect(rx, y - 8, 1, 8, PAL.INK);
        p.line(x + 6, y + 2, x + 26, y + 18, PAL.INK).line(x + 8, y + 2, x + 28, y + 18, PAL.INK);
      }
    };

    const waterTower = (cx: number, roof: number): void => {
      p.rect(cx - 10, roof - 21, 2, 18, PAL.WOOD_DK).rect(cx + 8, roof - 21, 2, 18, PAL.WOOD_DK);
      p.line(cx - 9, roof - 20, cx + 8, roof - 4, PAL.WOOD_DK).line(cx + 8, roof - 20, cx - 9, roof - 4, PAL.WOOD_DK);
      p.rect(cx - 13, roof - 23, 26, 2, PAL.WOOD_DK);
      p.rect(cx - 12, roof - 49, 24, 26, PAL.WOOD);
      for (let x = cx - 12; x < cx + 12; x += 3) p.rect(x, roof - 49, 1, 26, PAL.WOOD_DK, 0.55);
      p.rect(cx + 6, roof - 49, 6, 26, PAL.INK, 0.2);
      p.rect(cx - 12, roof - 42, 24, 1, PAL.CHARCOAL).rect(cx - 12, roof - 30, 24, 1, PAL.CHARCOAL);
      p.taper(cx, roof - 49, 10, 28, 2, PAL.WOOD_DK);
    };

    const chimney = (cx: number, roof: number): void => {
      p.bricks(cx - 6, roof - 22, 12, 19, PAL.BRICK_DK, mix(PAL.BRICK_DK, PAL.INK, 0.4));
      p.rect(cx - 7, roof - 24, 14, 3, PAL.BROWNSTONE);
      p.rect(cx - 3, roof - 29, 3, 5, PAL.BRICK_DK).rect(cx + 2, roof - 28, 3, 4, PAL.BRICK_DK);
    };

    const storefront = (x: number, w: number): void => {
      const y = H - 46;
      p.rect(x + 4, y + 10, w - 8, 36, PAL.CHARCOAL);
      p.rect(x + 8, y + 14, w - 30, 22, 0x39506e).rect(x + 9, y + 15, 6, 20, 0x5a7aa0, 0.6);
      p.rect(x + w - 19, y + 14, 12, 32, PAL.WOOD_DK).rect(x + w - 17, y + 16, 8, 12, 0x39506e);
      for (let ax = x + 2; ax < x + w - 2; ax += 6) {
        p.rect(ax, y, 6, 9, (ax - x) % 12 < 6 ? PAL.RED : PAL.CREAM);
        p.rect(ax, y + 9, 6, 2, (ax - x) % 12 < 6 ? PAL.RED_DK : PAL.CONCRETE);
      }
    };

    const billboardFrame = (x: number, y: number, w: number, h: number, roof: number): void => {
      p.rect(x + 8, y + h, 3, roof - y - h - 3, PAL.CHARCOAL).rect(x + w - 11, y + h, 3, roof - y - h - 3, PAL.CHARCOAL);
      p.line(x + 9, y + h, x + w - 10, roof - 4, PAL.CHARCOAL).line(x + w - 10, y + h, x + 9, roof - 4, PAL.CHARCOAL);
      p.rect(x - 2, y - 2, w + 4, h + 4, PAL.SLATE).rect(x - 1, y - 1, w + 2, h + 2, PAL.STEEL);
    };

    // x, width, roof line, wall color
    building(0, 118, 74, PAL.BRICK);
    building(118, 96, 112, PAL.TAN);
    building(214, 130, 88, PAL.BROWNSTONE);
    building(344, 90, 122, PAL.BRICK_DK);
    building(434, 116, 96, PAL.BRICK_LT);
    building(550, 90, 106, 0x8c7c72);

    fireEscape(40, 74);
    fireEscape(480, 96);
    waterTower(84, 74);
    waterTower(388, 122);
    chimney(150, 112);
    chimney(610, 106);
    storefront(0, 118);
    storefront(214, 130);
    storefront(434, 116);

    // "YEEZY" graffiti billboard: white board, orange bubble letters, red shadow, blue drips.
    {
      const bx = 243;
      const by = 34;
      billboardFrame(bx, by, 72, 34, 88);
      p.rect(bx, by, 72, 34, 0xf4f1e8);
      const word = 'YEEZY';
      [...word].forEach((ch, i) => {
        const lx = bx + 6 + i * 12;
        const ly = by + 8 + (i % 2 === 0 ? 0 : 2);
        p.text(ch, lx - 1, ly + 2, 2, PAL.INK);
        p.text(ch, lx + 1, ly + 1, 2, PAL.RED);
        p.text(ch, lx, ly, 2, PAL.ORANGE);
        p.rect(lx + 2, ly, 2, 2, PAL.GOLD_LT);
      });
      for (const [dx, len] of [[9, 5], [23, 3], [38, 6], [52, 4], [63, 3]] as const) {
        p.rect(bx + dx, by + 25, 1, len, PAL.BLUE);
      }
      p.rect(bx + 3, by + 4, 4, 1, PAL.BLUE).rect(bx + 64, by + 28, 5, 1, PAL.BLUE);
    }

    // Graduation Bear mascot billboard.
    {
      const bx = 458;
      const by = 40;
      billboardFrame(bx, by, 68, 38, 96);
      p.rect(bx, by, 68, 14, PAL.PURPLE).rect(bx, by + 14, 68, 10, PAL.MAGENTA).rect(bx, by + 24, 68, 14, PAL.ORANGE);
      for (let sx = bx + 4; sx < bx + 64; sx += 9) p.px(sx, by + 4 + ((sx * 7) % 6), PAL.GOLD_LT);
      p.rect(bx + 6, by + 16, 9, 2, PAL.ORANGE).rect(bx + 50, by + 20, 12, 2, PAL.GOLD);
      const cx = bx + 34;
      const cy = by + 17;
      const fur = 0x9a6238;
      const furDark = 0x6e4426;
      p.disc(cx - 9, cy - 9, 4, 4, fur).disc(cx + 9, cy - 9, 4, 4, fur);
      p.disc(cx - 9, cy - 9, 2, 2, 0xd8a078).disc(cx + 9, cy - 9, 2, 2, 0xd8a078);
      p.disc(cx, cy, 11, 10, fur).disc(cx + 4, cy + 2, 6, 7, furDark, 0.25);
      p.disc(cx, cy + 4, 5, 4, 0xe6c29a);
      p.rect(cx - 1, cy + 2, 3, 2, PAL.INK);
      p.rect(cx - 7, cy - 4, 5, 5, PAL.WHITE).rect(cx - 6, cy - 3, 3, 3, PAL.MAGENTA).px(cx - 5, cy - 2, PAL.INK);
      p.rect(cx + 3, cy - 4, 5, 5, PAL.WHITE).rect(cx + 4, cy - 3, 3, 3, PAL.CYAN).px(cx + 5, cy - 2, PAL.INK);
      p.rect(cx - 9, cy + 11, 18, 10, 0xe8e8f0).rect(cx - 2, cy + 11, 4, 10, PAL.BLUE);
      p.rect(cx - 9, cy + 11, 3, 10, PAL.RED);
    }

    // Atmospheric haze: push the whole layer toward the sky so gameplay reads on top.
    p.ctx.globalCompositeOperation = 'source-atop';
    p.rect(0, 0, W, H, 0x9cc8ee, 0.4);
    p.ctx.globalCompositeOperation = 'source-over';
    made.tex.refresh();
  }

  private bakeStreet(): void {
    const W = 256;
    const H = RUNWAY.TILE_H;
    const made = this.canvasTexture(TEX.STREET, W, H);
    if (!made) return;
    const p = made.p;
    // Far storefront shadow band so the gap reads as depth, not sky.
    p.rect(0, 24, W, 36, 0x2c2f3e, 0.55);
    // Elevated steel rail line
    for (let x = 0; x < W; x += 128) {
      p.rect(x + 20, 13, 7, 49, PAL.CHARCOAL).rect(x + 20, 13, 2, 49, PAL.SLATE);
      p.line(x + 12, 13, x + 23, 24, PAL.CHARCOAL).line(x + 35, 13, x + 24, 24, PAL.CHARCOAL);
    }
    p.rect(0, 8, W, 5, PAL.SLATE).rect(0, 7, W, 1, PAL.SILVER).rect(0, 12, W, 1, PAL.CHARCOAL);
    for (let x = 2; x < W; x += 8) p.px(x, 10, PAL.SILVER, 0.7);
    for (let x = 0; x < W; x += 16) p.rect(x, 13, 2, 3, PAL.CHARCOAL);
    // Sidewalk, curb, road
    p.rect(0, 58, W, 6, PAL.CONCRETE).rect(0, 58, W, 1, 0xc9c5bb).rect(0, 64, W, 1, PAL.CONCRETE_DK);
    for (let x = 0; x < W; x += 16) p.rect(x, 59, 1, 5, PAL.CONCRETE_DK, 0.6);
    p.rect(0, 65, W, H - 65, PAL.ASPHALT);
    for (let x = 4; x < W; x += 32) p.rect(x, 74, 14, 1, PAL.GOLD, 0.8);
    for (let x = 0; x < W; x += 5) p.px(x + ((x * 3) % 4), 68 + ((x * 7) % 14), 0x4a4b56);
    // Hydrant and street lamp
    p.rect(92, 52, 3, 6, PAL.RED).rect(91, 54, 5, 1, PAL.RED_DK);
    p.rect(180, 28, 1, 30, PAL.CHARCOAL).rect(180, 28, 6, 1, PAL.CHARCOAL).rect(184, 29, 3, 2, PAL.GOLD_LT);
    made.tex.refresh();
  }

  private bakeRunway(): void {
    const W = RUNWAY.TILE_W;
    const H = RUNWAY.TILE_H;
    const made = this.canvasTexture(TEX.RUNWAY, W, H);
    if (!made) return;
    const p = made.p;
    const walls = [PAL.BRICK, PAL.BROWNSTONE];
    RUNWAY.ROOFS.forEach(([a, b], i) => {
      const w = b - a;
      const wall = walls[i % walls.length]!;
      const wallDark = mix(wall, PAL.INK, 0.4);
      // Far parapet lip, walking surface, concrete ledge
      p.rect(a + 3, 3, w - 6, 6, PAL.CONCRETE_DK).rect(a + 3, 3, w - 6, 1, PAL.CONCRETE);
      for (let x = a + 12; x < b - 6; x += 22) p.rect(x, 4, 1, 5, 0x66625b);
      p.rect(a, 9, w, 5, PAL.CONCRETE).rect(a, 9, w, 1, 0xd2cec4).rect(a, 13, w, 1, PAL.CONCRETE_DK);
      for (let x = a + 30; x < b; x += 48) p.rect(x, 10, 1, 3, PAL.CONCRETE_DK, 0.7);
      // Cornice
      p.rect(a + 1, 14, w - 2, 4, wallDark);
      for (let x = a + 3; x < b - 3; x += 5) p.rect(x, 18, 3, 2, wallDark);
      // Brick facade with arched windows
      p.bricks(a + 2, 18, w - 4, H - 18, wall, wallDark);
      for (let x = a + 3; x < b - 3; x += 5) p.rect(x, 18, 3, 2, wallDark);
      p.rect(a + 2, 18, 3, H - 18, PAL.INK, 0.3).rect(b - 6, 18, 4, H - 18, PAL.INK, 0.3);
      for (let x = a + 18; x + 14 < b - 12; x += 36) {
        p.rect(x - 1, 31, 16, 2, PAL.CREAM).rect(x + 1, 29, 12, 2, PAL.CREAM);
        p.rect(x, 33, 14, 22, PAL.CREAM).rect(x + 1, 34, 12, 20, 0x27344a);
        p.rect(x + 6, 34, 1, 20, PAL.CREAM).rect(x + 1, 43, 12, 1, PAL.CREAM);
        p.rect(x + 2, 35, 3, 6, 0x4a6488, 0.7);
        p.rect(x - 2, 55, 18, 2, PAL.CREAM).rect(x - 2, 57, 18, 1, wallDark);
        p.rect(x + 1, 66, 12, 18, 0x27344a).rect(x, 64, 14, 2, PAL.CREAM);
      }
    });
    // Steel I-beam bridges across the alley gaps keep the run surface continuous.
    const gaps: Array<[number, number]> = [
      [RUNWAY.ROOFS[0][1], RUNWAY.ROOFS[1][0]],
      [RUNWAY.ROOFS[1][1], W],
    ];
    for (const [a, b] of gaps) {
      const w = b - a;
      p.rect(a - 2, 9, w + 4, 2, 0xd6743c).rect(a - 2, 9, w + 4, 1, 0xf09a5c);
      p.rect(a - 2, 11, w + 4, 4, PAL.RUST).rect(a - 2, 15, w + 4, 2, 0x7e3718);
      for (let x = a + 3; x < b; x += 7) p.px(x, 13, 0xf09a5c);
      for (let x = a; x < b; x += 16) {
        p.line(x, 17, x + 8, 24, 0x7e3718).line(x + 16, 17, x + 8, 24, 0x7e3718);
      }
      p.rect(a, 24, w, 1, 0x7e3718);
    }
    made.tex.refresh();
  }

  private bakeProps(): void {
    const ink = PAL.INK;
    this.atlas(TEX.PROPS, [
      {
        name: 'ac',
        w: 30,
        h: 21,
        outline: ink,
        draw: (p) => {
          p.rect(0, 0, 28, 17, 0xb9bdc6).rect(0, 0, 28, 1, 0xdfe2e8).rect(22, 1, 6, 16, 0x979ba6);
          p.disc(9, 9, 7, 7, PAL.CHARCOAL).disc(9, 9, 5, 5, PAL.SLATE).disc(9, 9, 1.5, 1.5, PAL.CHARCOAL);
          p.line(4, 9, 14, 9, PAL.CHARCOAL).line(9, 4, 9, 14, PAL.CHARCOAL);
          for (let y = 3; y < 15; y += 3) p.rect(18, y, 8, 1, PAL.SLATE);
          p.rect(2, 17, 3, 2, PAL.CHARCOAL).rect(23, 17, 3, 2, PAL.CHARCOAL);
        },
      },
      {
        name: 'vent',
        w: 14,
        h: 16,
        outline: ink,
        draw: (p) => {
          p.rect(4, 6, 4, 8, PAL.STEEL).rect(6, 6, 2, 8, PAL.SLATE);
          p.rect(1, 2, 10, 4, PAL.SILVER).rect(3, 0, 6, 2, PAL.SILVER).rect(1, 5, 10, 1, PAL.SLATE);
          p.rect(3, 1, 3, 1, PAL.WHITE);
        },
      },
      {
        name: 'duct',
        w: 38,
        h: 14,
        outline: ink,
        draw: (p) => {
          p.rect(0, 4, 36, 8, PAL.SILVER).rect(0, 4, 36, 1, PAL.WHITE).rect(0, 10, 36, 2, PAL.STEEL);
          for (let x = 8; x < 36; x += 9) p.rect(x, 4, 1, 8, PAL.SLATE);
          p.rect(28, 0, 8, 5, PAL.SILVER).rect(28, 0, 8, 1, PAL.CHARCOAL);
        },
      },
      {
        name: 'antenna',
        w: 12,
        h: 32,
        outline: ink,
        draw: (p) => {
          p.rect(4, 0, 2, 28, PAL.STEEL).rect(1, 4, 8, 1, PAL.SILVER).rect(2, 8, 6, 1, PAL.SILVER);
          p.rect(0, 12, 10, 1, PAL.SILVER).rect(2, 28, 6, 2, PAL.CHARCOAL).px(4, 0, PAL.RED);
        },
      },
      {
        name: 'tank',
        w: 24,
        h: 38,
        outline: ink,
        draw: (p) => {
          p.rect(2, 22, 2, 14, PAL.WOOD_DK).rect(18, 22, 2, 14, PAL.WOOD_DK);
          p.line(3, 23, 18, 35, PAL.WOOD_DK).line(18, 23, 3, 35, PAL.WOOD_DK);
          p.rect(0, 6, 22, 17, PAL.WOOD);
          for (let x = 0; x < 22; x += 3) p.rect(x, 6, 1, 17, PAL.WOOD_DK, 0.6);
          p.rect(0, 10, 22, 1, PAL.CHARCOAL).rect(0, 19, 22, 1, PAL.CHARCOAL).rect(16, 6, 6, 17, ink, 0.2);
          p.taper(11, 6, 6, 24, 2, PAL.WOOD_DK);
        },
      },
      {
        name: 'skylight',
        w: 30,
        h: 10,
        outline: ink,
        draw: (p) => {
          p.rect(0, 2, 28, 6, PAL.SLATE).rect(2, 0, 24, 3, 0x7fc4dc).rect(2, 0, 24, 1, 0xc6ecf6);
          for (let x = 8; x < 26; x += 6) p.rect(x, 0, 1, 3, PAL.SLATE);
        },
      },
    ]);
  }

  private bakeTraffic(): void {
    const car = (body: number, cab: boolean): Draw => (p) => {
      const dark = mix(body, PAL.INK, 0.35);
      p.rect(0, 6, 32, 6, body).rect(0, 10, 32, 2, dark);
      p.rect(8, 1, 16, 5, body).rect(7, 3, 1, 3, body).rect(24, 3, 2, 3, body);
      p.rect(10, 2, 5, 4, 0x2b3b55).rect(17, 2, 6, 4, 0x2b3b55).px(11, 3, 0x86a8d0);
      if (cab) {
        p.rect(13, 0, 6, 1, PAL.WHITE);
        for (let x = 3; x < 30; x += 4) p.rect(x, 8, 2, 1, PAL.INK);
      }
      p.px(0, 7, PAL.WHITE).px(31, 7, PAL.RED);
      p.disc(7, 12, 3, 3, PAL.INK).disc(25, 12, 3, 3, PAL.INK).px(7, 12, PAL.STEEL).px(25, 12, PAL.STEEL);
    };
    this.atlas(TEX.CAB, [
      { name: 'cab', w: 34, h: 17, outline: PAL.INK, draw: car(PAL.CAB, true) },
      { name: 'sedan', w: 34, h: 17, outline: PAL.INK, draw: car(0x4a5a78, false) },
      { name: 'red', w: 34, h: 17, outline: PAL.INK, draw: car(0xa83a34, false) },
    ]);

    const made = this.canvasTexture(TEX.SUBWAY, 192, 18);
    if (!made) return;
    const p = made.p;
    for (let c = 0; c < 3; c++) {
      const x = c * 64;
      p.rect(x + 1, 1, 62, 15, PAL.SILVER).rect(x + 1, 1, 62, 2, PAL.STEEL).rect(x + 1, 14, 62, 2, PAL.SLATE);
      p.rect(x + 1, 11, 62, 1, PAL.BLUE);
      for (let wx = x + 5; wx < x + 58; wx += 9) p.rect(wx, 4, 6, 5, 0x24304a).px(wx + 1, 5, 0x7ea0cc);
      p.rect(x + 20, 4, 1, 10, PAL.SLATE).rect(x + 43, 4, 1, 10, PAL.SLATE);
      p.rect(x + 8, 16, 8, 2, PAL.CHARCOAL).rect(x + 48, 16, 8, 2, PAL.CHARCOAL);
      p.rect(x, 6, 1, 6, PAL.CHARCOAL).rect(x + 63, 6, 1, 6, PAL.CHARCOAL);
    }
    p.px(2, 12, PAL.GOLD_LT).px(2, 13, PAL.GOLD_LT);
    made.tex.refresh();
  }

  /* --------------------------- characters -------------------------- */

  private drawYe(p: Painter, L: EraLook, pose: number): void {
    const near = L.legs;
    const far = L.legsDark;
    const shoe = L.shoes;
    switch (pose) {
      case 0:
        p.rect(5, 17, 4, 3, far).rect(2, 19, 4, 3, shoe).rect(9, 17, 4, 4, near).rect(10, 21, 5, 3, shoe);
        break;
      case 1:
        p.rect(8, 17, 3, 4, far).rect(7, 17, 4, 5, near).rect(7, 22, 5, 2, shoe);
        break;
      case 2:
        p.rect(9, 17, 4, 4, far).rect(10, 21, 5, 3, shoe).rect(5, 17, 4, 3, near).rect(2, 19, 4, 3, shoe);
        break;
      case 3:
        p.rect(6, 17, 4, 4, far).rect(8, 17, 4, 5, near).rect(8, 22, 5, 2, shoe);
        break;
      case 4:
        p.rect(5, 20, 4, 2, far).rect(5, 22, 4, 2, shoe);
        p.rect(5, 17, 7, 3, near).rect(3, 19, 4, 3, near).rect(1, 21, 4, 3, shoe);
        break;
      default:
        p.rect(5, 17, 3, 5, far).rect(4, 22, 5, 2, shoe).rect(10, 17, 3, 5, near).rect(10, 22, 5, 2, shoe);
        break;
    }

    const q = p.at(0, pose === 1 || pose === 3 ? 1 : 0);
    // Torso
    q.rect(4, 8, 10, 9, L.top).rect(4, 8, 2, 9, L.topDark);
    switch (L.detail) {
      case 'quilt':
        q.rect(5, 10, 9, 1, L.topLight).rect(5, 13, 9, 1, L.topLight).rect(5, 16, 9, 1, L.topDark);
        break;
      case 'collar':
        q.rect(9, 8, 4, 1, PAL.WHITE).rect(11, 9, 1, 3, L.topDark).rect(3, 9, 3, 7, PAL.WOOD).rect(3, 9, 3, 1, PAL.WOOD_DK);
        q.rect(6, 8, 1, 8, PAL.WOOD_DK);
        break;
      case 'suit':
        q.rect(10, 8, 3, 5, PAL.WHITE).rect(11, 9, 1, 4, PAL.INK).rect(9, 8, 1, 6, L.topLight);
        q.rect(7, 10, 2, 2, PAL.RED).px(8, 11, PAL.INK).px(7, 12, PAL.RED);
        break;
      default:
        q.rect(11, 8, 1, 9, PAL.SILVER).px(5, 9, PAL.SILVER).px(7, 9, PAL.SILVER).px(5, 12, PAL.SILVER);
        q.px(13, 9, PAL.SILVER).rect(9, 8, 2, 2, L.topLight).rect(4, 15, 10, 1, L.topLight);
        break;
    }
    // Forward arm and fist
    q.rect(9, 10, 5, 4, L.topDark);
    if (L.detail === 'quilt') q.rect(10, 11, 3, 1, L.topLight);
    if (L.detail === 'collar') q.rect(9, 10, 3, 4, L.top).rect(12, 10, 2, 4, L.skin);
    q.rect(13, 13, 3, 2, L.skin).px(15, 14, L.skinDark);
    // Head
    if (L.head === 'mask') {
      q.rect(8, 0, 5, 1, PAL.SILVER).rect(7, 1, 7, 7, PAL.SILVER);
      const facets = [PAL.WHITE, 0xbfe8ff, 0xe8c0f0, PAL.STEEL];
      for (let y = 0; y < 8; y++) {
        for (let x = 7; x < 14; x++) {
          if (y === 0 && (x < 8 || x > 12)) continue;
          q.px(x, y, facets[(x * 7 + y * 3) % 4]!);
        }
      }
      q.px(10, 3, PAL.INK).px(13, 3, PAL.INK).rect(10, 6, 3, 1, PAL.SLATE);
    } else {
      q.rect(8, 0, 5, 1, L.skin).rect(7, 1, 7, 6, L.skin).rect(8, 7, 5, 1, L.skin);
      q.rect(7, 1, 1, 5, L.skinDark).px(8, 4, L.skinDark).px(14, 4, L.skin).px(9, 1, PAL.SKIN_LT);
      if (L.head === 'hair') q.rect(8, 0, 5, 1, PAL.INK).rect(7, 1, 7, 1, PAL.INK).rect(7, 2, 1, 2, PAL.INK);
      if (L.shades) {
        q.rect(9, 3, 6, 2, PAL.INK).px(10, 3, PAL.SLATE).px(13, 3, PAL.SLATE);
      } else {
        q.rect(10, 2, 4, 1, L.skinDark).px(11, 3, PAL.WHITE).px(12, 3, PAL.INK).px(13, 3, PAL.WHITE);
      }
      if (L.goatee) q.rect(10, 6, 4, 1, PAL.INK).rect(11, 7, 3, 1, PAL.INK);
      else q.px(12, 6, L.skinDark).px(13, 6, L.skinDark);
    }
  }

  private bakeYe(): void {
    for (const era of ERAS) {
      const frames: Draw[] = [0, 1, 2, 3, 4, 5].map((pose) => (p: Painter) => this.drawYe(p, era.look, pose));
      this.sheet(TEX.YE + era.id, 20, 26, frames, PAL.INK);
    }
  }

  private bakePacks(): void {
    for (const pack of JETPACKS) {
      this.sheet(
        TEX.PACK + pack.id,
        8,
        13,
        [
          (p) => {
            p.rect(0, 0, 6, 8, pack.body).rect(0, 0, 6, 1, mix(pack.body, PAL.WHITE, 0.5));
            p.rect(0, 0, 1, 8, mix(pack.body, PAL.INK, 0.3)).rect(0, 3, 6, 1, pack.trim).rect(0, 6, 6, 1, pack.trim);
            p.rect(1, 8, 4, 2, PAL.SLATE).rect(0, 10, 6, 1, PAL.CHARCOAL).px(3, 1, PAL.WHITE);
            if (pack.id === 'hype') p.rect(1, 4, 4, 2, PAL.RED);
            if (pack.id === 'autotune') p.px(2, 1, PAL.MAGENTA).px(4, 4, PAL.MAGENTA);
          },
        ],
        PAL.INK,
      );
    }
  }

  private bakeVehicles(): void {
    const fur = 0x9a6238;
    const furDark = 0x6e4426;
    const mech = (legs: number): Draw => (p) => {
      // Back arm, legs
      p.rect(1, 18, 5, 8, furDark).rect(0, 25, 5, 4, PAL.SLATE);
      if (legs === 0) {
        p.rect(7, 29, 6, 5, furDark).rect(5, 33, 9, 3, PAL.STEEL).rect(17, 29, 6, 4, fur).rect(18, 32, 9, 3, PAL.SILVER);
      } else if (legs === 1) {
        p.rect(9, 29, 6, 4, furDark).rect(10, 32, 9, 3, PAL.STEEL).rect(15, 29, 6, 5, fur).rect(13, 33, 9, 3, PAL.SILVER);
      } else {
        p.rect(8, 29, 6, 3, furDark).rect(7, 31, 8, 3, PAL.STEEL).rect(17, 29, 6, 3, fur).rect(17, 31, 8, 3, PAL.SILVER);
      }
      // Torso with cockpit
      p.rect(5, 17, 20, 12, 0x8a5a36).rect(5, 17, 20, 2, PAL.STEEL).rect(5, 27, 20, 2, PAL.SLATE);
      p.rect(8, 17, 14, 1, PAL.GOLD).px(15, 18, PAL.GOLD_LT);
      p.rect(11, 20, 10, 7, PAL.INK).rect(13, 21, 6, 5, PAL.SKIN).rect(14, 22, 5, 1, PAL.INK).rect(12, 20, 2, 1, 0x5a7aa0);
      // Front arm and steel fist
      p.rect(23, 18, 6, 5, fur).rect(26, 22, 6, 6, PAL.STEEL).rect(26, 22, 6, 1, PAL.SILVER);
      // Head
      p.disc(8, 4, 3.5, 3.5, fur).disc(22, 4, 3.5, 3.5, fur).disc(8, 4, 1.5, 1.5, 0xd8a078).disc(22, 4, 1.5, 1.5, 0xd8a078);
      p.disc(15, 9.5, 10.5, 8, fur).disc(20, 13, 5, 3.5, 0xe6c29a);
      p.rect(22, 11, 2, 2, PAL.INK);
      p.rect(13, 6, 5, 5, PAL.WHITE).rect(14, 7, 3, 3, PAL.MAGENTA).px(15, 8, PAL.INK);
      p.rect(20, 6, 4, 5, PAL.WHITE).rect(21, 7, 2, 3, PAL.CYAN).px(22, 8, PAL.INK);
      p.rect(5, 15, 20, 1, PAL.SLATE);
    };
    this.sheet(TEX.MECH, 34, 38, [mech(0), mech(1), mech(2)], PAL.INK);

    const truck = (spin: number): Draw => (p) => {
      const body = 0x1b1b22;
      const edge = 0x3c3c4a;
      p.rect(2, 8, 38, 8, body).rect(2, 8, 38, 1, edge).rect(30, 6, 10, 2, body).rect(30, 6, 10, 1, edge);
      p.rect(8, 2, 21, 6, 0x23232c).rect(8, 2, 21, 1, edge).rect(29, 4, 2, 4, 0x23232c).rect(6, 4, 2, 4, 0x23232c);
      p.rect(11, 3, 7, 4, 0x34455f).rect(20, 3, 8, 4, 0x34455f).px(12, 4, 0x86a8d0);
      p.rect(22, 3, 4, 4, PAL.SKIN).rect(23, 4, 4, 1, PAL.INK);
      p.rect(40, 9, 2, 6, PAL.STEEL).px(40, 8, PAL.GOLD_LT).px(41, 8, PAL.GOLD_LT).rect(2, 9, 1, 2, PAL.RED);
      p.rect(4, 12, 34, 1, edge).rect(18, 9, 1, 6, edge).rect(0, 14, 2, 2, PAL.SLATE);
      for (const cx of [10, 32]) {
        p.disc(cx + 0.5, 16.5, 4.5, 4.5, PAL.INK).disc(cx + 0.5, 16.5, 2.5, 2.5, PAL.STEEL);
        if (spin === 0) p.rect(cx - 1, 16, 4, 1, PAL.CHARCOAL);
        else p.rect(cx, 15, 1, 4, PAL.CHARCOAL);
      }
    };
    this.sheet(TEX.TRUCK, 44, 23, [truck(0), truck(1)], PAL.INK);

    this.sheet(
      TEX.BOARD,
      28,
      9,
      [
        (p) => {
          p.rect(1, 1, 24, 3, 0xe4d9c2).rect(0, 2, 26, 1, 0xe4d9c2).rect(1, 1, 24, 1, PAL.CREAM).rect(1, 3, 24, 1, 0xb9ad94);
          p.rect(15, 0, 7, 2, 0xcfc3aa).rect(15, 0, 7, 1, PAL.CREAM);
          for (let x = 3; x < 14; x += 3) p.px(x, 2, 0x9c917a);
          p.rect(3, 4, 20, 1, PAL.CYAN).rect(6, 5, 14, 1, PAL.CYAN, 0.6).rect(9, 6, 8, 1, PAL.ELECTRIC, 0.4);
        },
      ],
      PAL.INK,
    );

    const shield = this.canvasTexture(TEX.SHIELD, 48, 48);
    if (shield) {
      shield.p.ring(24, 24, 23, 23, 0.9, PAL.GOLD).ring(24, 24, 23, 23, 0.96, PAL.GOLD_LT);
      shield.p.disc(24, 24, 21, 21, PAL.GOLD, 0.12);
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        shield.p.px(24 + Math.cos(ang) * 17, 24 + Math.sin(ang) * 17, PAL.GOLD_LT, 0.8);
      }
      shield.tex.refresh();
    }
  }

  /* ----------------------- pickups and hazards --------------------- */

  private bakeCollectibles(): void {
    const widths = [5, 4, 2.4, 1, 2.4, 4];
    const disc = (rx: number, body: number, rim: number, shine: number, label: number, hole: number): Draw => (p) => {
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          const dx = (x + 0.5 - 5) / rx;
          const dy = (y + 0.5 - 5) / 5;
          const d = dx * dx + dy * dy;
          if (d > 1) continue;
          let c = body;
          if (d > 0.62) c = rim;
          else if (d < 0.14) c = label;
          else if (dx < 0 && dy < 0 && d > 0.2 && d < 0.5) c = shine;
          p.px(x, y, c);
        }
      }
      if (rx >= 2.4) p.px(4, 4, hole).px(5, 5, hole).px(4, 5, hole).px(5, 4, hole);
    };
    this.sheet(
      TEX.RECORD,
      12,
      12,
      widths.map((rx) => disc(rx, PAL.GOLD, PAL.GOLD_DK, PAL.GOLD_LT, PAL.GOLD_DK, PAL.GOLD_LT)),
      PAL.INK,
    );
    this.sheet(
      TEX.VINYL,
      12,
      12,
      widths.map((rx) => disc(rx, 0x2a2a34, 0x16161d, 0x5a5a6a, PAL.ORANGE, PAL.GOLD_LT)),
      PAL.CHARCOAL,
    );

    const rainbow = [PAL.RED, PAL.ORANGE, PAL.GOLD, PAL.GREEN, PAL.CYAN, PAL.PURPLE];
    const crate = (shift: number): Draw => (p) => {
      p.rect(0, 0, 14, 14, PAL.SILVER).rect(0, 0, 14, 1, PAL.WHITE).rect(0, 13, 14, 1, PAL.STEEL).rect(13, 0, 1, 14, PAL.STEEL);
      for (let y = 1; y < 13; y++) {
        for (let x = 1; x < 13; x++) {
          p.px(x, y, rainbow[Math.floor((x + y + shift) / 2) % rainbow.length]!);
        }
      }
      p.rect(3, 3, 8, 8, PAL.INK).rect(3, 3, 8, 1, PAL.SLATE);
      p.matrix(5, 4, ['#.#', '#.#', '.#.', '.#.', '.#.', '.#.'], { '#': PAL.WHITE });
      p.px(0, 0, PAL.STEEL).px(13, 13, PAL.SLATE).px(1, 1, PAL.WHITE).px(12, 1, PAL.WHITE);
    };
    this.sheet(TEX.CRATE, 16, 16, [crate(0), crate(2), crate(4), crate(6)], PAL.INK);
  }

  private bakeHazards(): void {
    const drone = (blade: number): Draw => (p) => {
      p.rect(2, 3, 24, 1, PAL.SLATE);
      for (const hx of [3, 10, 17, 24]) {
        p.rect(hx, 2, 1, 2, PAL.CHARCOAL);
        if (blade === 0) p.rect(hx - 3, 1, 7, 1, PAL.SILVER);
        else p.rect(hx - 1, 1, 3, 1, PAL.SILVER).rect(hx - 3, 1, 1, 1, PAL.STEEL, 0.6).rect(hx + 3, 1, 1, 1, PAL.STEEL, 0.6);
      }
      p.rect(8, 4, 12, 4, PAL.CHARCOAL).rect(8, 4, 12, 1, PAL.SLATE).px(14, 3, PAL.RED);
      p.rect(9, 8, 13, 7, PAL.INK).rect(9, 8, 13, 1, PAL.CHARCOAL).rect(13, 7, 5, 1, PAL.CHARCOAL);
      p.rect(4, 9, 5, 5, PAL.CHARCOAL).rect(2, 8, 2, 7, PAL.SLATE).rect(0, 9, 2, 5, 0x1f4468);
      p.px(0, 10, PAL.WHITE).px(1, 11, PAL.ELECTRIC).px(20, 10, PAL.RED).rect(16, 11, 4, 2, PAL.SLATE);
    };
    this.sheet(TEX.DRONE, 30, 18, [drone(0), drone(1)], PAL.INK);

    const warn = (body: number): Draw => (p) => {
      p.rect(1, 0, 11, 12, body).rect(0, 1, 13, 10, body).rect(1, 0, 11, 1, mix(body, PAL.WHITE, 0.4));
      p.rect(5, 12, 3, 1, body).px(6, 13, body);
      p.rect(5, 2, 3, 5, PAL.WHITE).px(6, 7, PAL.WHITE).rect(5, 9, 3, 2, PAL.WHITE);
    };
    this.sheet(TEX.WARN, 15, 16, [warn(PAL.RED), warn(0xff7a5c)], PAL.INK);

    this.sheet(
      TEX.NODE,
      10,
      10,
      [
        (p) => {
          p.disc(4, 4, 4, 4, PAL.STEEL).disc(4, 4, 2.6, 2.6, PAL.SLATE).rect(3, 3, 2, 2, PAL.ELECTRIC).px(3, 3, PAL.WHITE);
        },
      ],
      PAL.INK,
    );
    this.sheet(
      TEX.PYLON,
      10,
      50,
      [
        (p) => {
          p.rect(0, 5, 1, 41, PAL.SLATE).rect(7, 5, 1, 41, PAL.SLATE);
          for (let y = 5; y < 44; y += 8) {
            p.line(0, y, 7, y + 7, PAL.STEEL).line(7, y, 0, y + 7, PAL.STEEL).rect(0, y, 8, 1, PAL.SLATE);
          }
          p.rect(1, 0, 6, 5, PAL.STEEL).rect(1, 0, 6, 1, PAL.SILVER).rect(2, 2, 4, 1, PAL.ELECTRIC);
          p.rect(0, 46, 8, 2, PAL.CHARCOAL);
        },
      ],
      PAL.INK,
    );
  }

  private bakePaparazzi(): void {
    const looks = [
      { skin: PAL.SKIN_LT, hair: 0x3a2618, coat: 0x4a4d5c, pants: 0x2a2a34, tie: PAL.RED },
      { skin: PAL.SKIN, hair: PAL.INK, coat: PAL.GREEN, pants: 0x3f5fa8, tie: PAL.GREEN },
      { skin: 0xe8b890, hair: 0xb8762a, coat: 0x2a2a34, pants: 0x6a5a48, tie: PAL.WHITE },
    ];
    looks.forEach((L, i) => {
      const pap = (pose: number): Draw => (p) => {
        // Legs: 0/1 run cycle, 2/3 planted
        if (pose === 0) {
          p.rect(2, 10, 2, 4, L.pants).rect(1, 14, 3, 2, PAL.INK).rect(6, 10, 2, 3, L.pants).rect(6, 13, 3, 2, PAL.INK);
        } else if (pose === 1) {
          p.rect(4, 10, 2, 4, L.pants).rect(3, 14, 3, 2, PAL.INK).rect(6, 10, 2, 2, L.pants).rect(7, 12, 3, 2, PAL.INK);
        } else {
          p.rect(2, 10, 2, 4, L.pants).rect(1, 14, 3, 2, PAL.INK).rect(6, 10, 2, 4, L.pants).rect(5, 14, 3, 2, PAL.INK);
        }
        p.rect(2, 4, 6, 6, L.coat).rect(7, 4, 1, 6, mix(L.coat, PAL.INK, 0.35)).px(4, 5, L.tie).px(4, 6, L.tie);
        p.rect(3, 0, 4, 4, L.skin).rect(3, 0, 4, 1, L.hair).px(6, 1, L.hair).px(3, 2, PAL.INK);
        if (pose < 2) {
          p.rect(0, 5, 3, 3, PAL.INK).px(0, 6, PAL.ELECTRIC).rect(2, 6, 2, 1, L.coat);
        } else {
          p.rect(0, 1, 3, 3, PAL.INK).px(0, 2, PAL.ELECTRIC).rect(2, 3, 2, 2, L.coat).px(1, 0, PAL.CHARCOAL);
          if (pose === 3) p.rect(0, 0, 3, 5, PAL.WHITE).px(0, 2, PAL.GOLD_LT);
        }
      };
      this.sheet(TEX.PAP + i, 12, 18, [pap(0), pap(1), pap(2), pap(3)], PAL.INK);
    });
  }

  private bakeFx(): void {
    const W = PAL.WHITE;
    const white = { '#': W };
    this.atlas(TEX.FX, [
      { name: 'p1', w: 1, h: 1, draw: (p) => p.px(0, 0, W) },
      { name: 'p2', w: 2, h: 2, draw: (p) => p.rect(0, 0, 2, 2, W) },
      { name: 'p3', w: 3, h: 3, draw: (p) => p.rect(0, 0, 3, 3, W) },
      { name: 'spark', w: 3, h: 3, draw: (p) => p.rect(1, 0, 1, 3, W).rect(0, 1, 3, 1, W) },
      { name: 'star', w: 5, h: 5, draw: (p) => p.rect(2, 0, 1, 5, W).rect(0, 2, 5, 1, W).rect(1, 1, 3, 3, W) },
      { name: 'flame', w: 5, h: 7, draw: (p) => p.matrix(0, 0, ['.###.', '#####', '#####', '.###.', '.###.', '..#..', '..#..'], white) },
      { name: 'smoke', w: 6, h: 6, draw: (p) => p.disc(3, 3, 3, 3, W) },
      { name: 'note1', w: 5, h: 8, draw: (p) => p.matrix(0, 0, ['..##.', '..#.#', '..#..', '..#..', '..#..', '.##..', '###..', '.#...'], white) },
      {
        name: 'note2',
        w: 8,
        h: 7,
        draw: (p) => p.matrix(0, 0, ['..######', '..#....#', '..#....#', '..#....#', '.##...##', '###..###', '.#....#.'], white),
      },
      {
        name: 'shard',
        w: 4,
        h: 4,
        draw: (p) => p.matrix(0, 0, ['#...', '##..', '###.', '####'], { '#': 0x1c1c24 }).px(1, 2, PAL.SLATE),
      },
      { name: 'ring', w: 16, h: 6, draw: (p) => p.ring(8, 3, 8, 3, 0.72, W) },
      {
        name: 'sneaker',
        w: 11,
        h: 8,
        outline: PAL.INK,
        draw: (p) => {
          p.rect(0, 1, 5, 3, 0xd9cfbb).rect(4, 2, 5, 2, 0xd9cfbb).rect(0, 0, 3, 1, 0xbfb49c);
          p.rect(0, 4, 9, 2, W).rect(2, 2, 4, 1, PAL.ORANGE).px(1, 5, PAL.SILVER).px(5, 5, PAL.SILVER);
        },
      },
    ]);
    const made = this.canvasTexture(TEX.PIXEL, 2, 2);
    if (made) {
      made.p.rect(0, 0, 2, 2, W);
      made.tex.refresh();
    }
  }
}
