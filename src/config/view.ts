import type Phaser from 'phaser';
import { GAME_H, GAME_W } from './constants';

/**
 * The world is authored on a 640x360 grid, but the canvas is created at the
 * display's real pixel size and every camera zooms in to match. Baked pixel art
 * scales up crisply, while the high-resolution character art keeps its detail.
 */
export const view = {
  /** Canvas pixels per world unit. */
  zoom: 1,
  /** Canvas size in real pixels. */
  width: GAME_W,
  height: GAME_H,
  /** CSS pixels per canvas pixel. */
  cssScale: 1,
  /** True when canvas pixels map 1:1 to screen pixels (no browser resampling). */
  crisp: true,
};

/** Recomputes the canvas size for the space available to the page. */
export function measureView(availW: number, availH: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const fit = Math.max(0.25, Math.min(availW / GAME_W, availH / GAME_H));
  const exact = fit * dpr;
  let zoom: number;
  let cssWidth: number;
  if (exact >= 2) {
    // Room for a whole-number zoom: one world pixel is exactly N screen pixels.
    zoom = Math.min(Math.floor(exact), 6);
    cssWidth = (GAME_W * zoom) / dpr;
  } else {
    // Small window or phone: render at the next whole zoom and let the browser
    // scale the canvas down smoothly, which keeps the pixel font readable.
    zoom = Math.max(1, Math.ceil(exact));
    cssWidth = GAME_W * fit;
  }
  view.zoom = zoom;
  view.width = GAME_W * zoom;
  view.height = GAME_H * zoom;
  view.cssScale = cssWidth / view.width;
  view.crisp = exact >= 2;
}

/** Points a scene's main camera at the 640x360 world at the current zoom. */
export function fitCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras?.main;
  if (!cam) return;
  cam.setOrigin(0, 0);
  cam.setSize(view.width, view.height);
  cam.setZoom(view.zoom);
}
