import Phaser from 'phaser';
import { audio } from '../audio/ChipHopAudioEngine';
import { FONT_PX, GAME_H, GAME_W, PAL, SCENES, TEX, levelLabel } from '../config/constants';
import { getProfile, saveProfile } from '../config/eras';
import { fitCamera } from '../config/view';
import { EventBus, type GameEvents } from '../events/EventBus';

/* ------------------------------------------------------------------ */
/* Shared pixel UI kit (used by the HUD, title and locker scenes)      */
/* ------------------------------------------------------------------ */

/** HUD margin: keeps text clear of rounded corners and TV overscan. */
export const SAFE = 6;

/** Text in the baked arcade font. `size` is an integer scale of the 7x9 glyph cell. */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 1,
  tint: number = PAL.WHITE,
): Phaser.GameObjects.BitmapText {
  return scene.add.bitmapText(x, y, TEX.FONT, text, FONT_PX * size).setTint(tint);
}

/** Anything the keyboard/gamepad-style focus ring can land on. */
export interface Focusable {
  x: number;
  y: number;
  setFocus(on: boolean): void;
  activate(): void;
  onHover?: () => void;
}

export class PixelButton extends Phaser.GameObjects.Container implements Focusable {
  onHover?: () => void;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.BitmapText;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly boxW: number,
    private readonly boxH: number,
    text: string,
    private readonly onClick: () => void,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.label = pixelText(scene, 0, 0, text).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(boxW, boxH);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.POINTER_OVER, () => this.onHover?.());
    this.on(Phaser.Input.Events.POINTER_DOWN, () => this.activate());
    scene.add.existing(this);
    this.redraw();
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }

  setFocus(on: boolean): void {
    if (this.focused === on) return;
    this.focused = on;
    this.redraw();
    if (on) {
      this.scene.tweens.killTweensOf(this);
      this.setScale(1.08);
      this.scene.tweens.add({ targets: this, scale: 1, duration: 140, ease: 'Back.easeOut' });
    }
  }

  activate(): void {
    this.onClick();
  }

  private redraw(): void {
    const w = this.boxW;
    const h = this.boxH;
    const g = this.bg;
    g.clear();
    g.fillStyle(PAL.INK, 1).fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
    g.fillStyle(this.focused ? PAL.GOLD : PAL.WHITE, 1).fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(this.focused ? 0x2c9451 : PAL.HUD_GREEN, 1).fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    this.label.setTint(this.focused ? PAL.HUD_YELLOW : PAL.WHITE);
  }
}

/**
 * Focus navigation: arrows/WASD move to the nearest item in that direction,
 * Enter/Space activates, Esc cancels. Hovering with the mouse moves focus too,
 * so pointer and keys never disagree about what is selected.
 */
export class MenuNav {
  private index = 0;
  private enabled = true;
  private readonly handler: (ev: KeyboardEvent) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly items: Focusable[],
    start = 0,
    private readonly onCancel?: () => void,
  ) {
    items.forEach((item, i) => {
      item.onHover = () => {
        if (this.enabled && this.index !== i) {
          audio.play('select');
          this.focus(i);
        }
      };
    });
    this.handler = (ev) => this.onKey(ev);
    scene.input.keyboard?.on('keydown', this.handler);
    this.focus(start);
  }

  get current(): Focusable {
    return this.items[this.index]!;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  focus(i: number): void {
    this.index = Phaser.Math.Clamp(i, 0, this.items.length - 1);
    this.items.forEach((item, n) => item.setFocus(n === this.index));
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.handler);
  }

  private onKey(ev: KeyboardEvent): void {
    // Ignore auto-repeat so a key held from the previous screen cannot confirm this one.
    if (!this.enabled || ev.repeat) return;
    switch (ev.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move(0, -1);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.move(0, 1);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.move(-1, 0);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.move(1, 0);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.current.activate();
        break;
      case 'Escape':
      case 'Backspace':
        this.onCancel?.();
        break;
    }
  }

  private move(dx: number, dy: number): void {
    const from = this.current;
    let best = -1;
    let bestScore = Infinity;
    this.items.forEach((item, i) => {
      if (i === this.index) return;
      const ox = item.x - from.x;
      const oy = item.y - from.y;
      const along = ox * dx + oy * dy;
      if (along <= 1) return;
      const across = Math.abs(ox * dy) + Math.abs(oy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      audio.play('select');
      this.focus(best);
    }
  }
}

/** Dark bordered panel used behind menus. */
export function pixelPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number = 0x10131f): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(PAL.INK, 1).fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle(PAL.WHITE, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(fill, 1).fillRect(x, y, w, h);
  return g;
}

/* ------------------------------------------------------------------ */
/* HUD scene                                                           */
/* ------------------------------------------------------------------ */

type UIState = 'playing' | 'paused' | 'over';

/**
 * Parallel overlay scene. It never reads gameplay state directly: everything it
 * shows arrives through the EventBus, and it only redraws when a value changes.
 */
export class UIScene extends Phaser.Scene {
  private state: UIState = 'playing';
  private levelBox!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.BitmapText;
  private recordText!: Phaser.GameObjects.BitmapText;
  private recordIcon!: Phaser.GameObjects.Sprite;
  private scoreText!: Phaser.GameObjects.BitmapText;
  private vehicleText!: Phaser.GameObjects.BitmapText;
  private soundButton!: PixelButton;
  private blind!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.BitmapText;
  private overlay: Phaser.GameObjects.Container | null = null;
  private nav: MenuNav | null = null;
  private pausedAt = 0;

  constructor() {
    super(SCENES.UI);
  }

  init(): void {
    this.state = 'playing';
    this.overlay = null;
    this.nav = null;
  }

  create(): void {
    fitCamera(this);
    this.blind = this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.WHITE).setOrigin(0).setAlpha(0);

    // Top-left: level plate, with the record counter directly below it.
    this.levelBox = this.add.graphics();
    this.levelText = pixelText(this, SAFE + 5, SAFE + 3, '');
    this.setLevel((this.registry.get('levelLabel') as string | undefined) ?? levelLabel(0));
    this.recordIcon = this.add.sprite(SAFE + 7, SAFE + 26, TEX.VINYL, 0).play('vinyl-spin');
    this.recordText = pixelText(this, SAFE + 16, SAFE + 22, 'x0', 1, PAL.HUD_YELLOW);

    // Top-right: score, then P1 right-aligned beneath it.
    this.scoreText = pixelText(this, GAME_W - SAFE, SAFE + 2, 'SCORE 000000').setOrigin(1, 0);
    pixelText(this, GAME_W - SAFE, SAFE + 14, 'P1').setOrigin(1, 0);

    this.vehicleText = pixelText(this, SAFE + 2, GAME_H - SAFE - 10, '', 1, PAL.HUD_YELLOW).setVisible(false);

    // Touch-friendly pause and sound toggles, top centre.
    new PixelButton(this, GAME_W / 2 - 16, SAFE + 8, 26, 15, 'II', () => this.togglePause());
    this.soundButton = new PixelButton(this, GAME_W / 2 + 16, SAFE + 8, 30, 15, audio.isMuted ? 'OFF' : 'SND', () => this.toggleMute());

    this.banner = pixelText(this, GAME_W / 2, 92, '', 2, PAL.HUD_YELLOW).setOrigin(0.5).setAlpha(0);

    const hint = pixelText(this, GAME_W / 2, GAME_H - 34, 'HOLD SPACE OR TOUCH TO FLY').setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0, delay: 2600, duration: 600, onComplete: () => hint.destroy() });

    EventBus.on('score', this.onScore, this);
    EventBus.on('records', this.onRecords, this);
    EventBus.on('level-up', this.onLevelUp, this);
    EventBus.on('vehicle', this.onVehicle, this);
    EventBus.on('game-over', this.onGameOver, this);
    EventBus.on('blind', this.onBlind, this);
    EventBus.on('mute', this.onMute, this);

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-P', () => this.togglePause());
    keyboard?.on('keydown-ESC', () => {
      if (this.state !== 'over') this.togglePause();
    });
    const onBlur = (): void => {
      if (this.state === 'playing') this.togglePause();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off('score', this.onScore, this);
      EventBus.off('records', this.onRecords, this);
      EventBus.off('level-up', this.onLevelUp, this);
      EventBus.off('vehicle', this.onVehicle, this);
      EventBus.off('game-over', this.onGameOver, this);
      EventBus.off('blind', this.onBlind, this);
      EventBus.off('mute', this.onMute, this);
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.nav?.destroy();
    });
  }

  /* ------------------------------ HUD ------------------------------ */

  private setLevel(label: string): void {
    this.levelText.setText(label);
    const w = this.levelText.width + 9;
    this.levelBox.clear();
    this.levelBox.fillStyle(PAL.INK, 1).fillRect(SAFE - 1, SAFE - 1, w + 2, 17);
    this.levelBox.fillStyle(PAL.WHITE, 1).fillRect(SAFE, SAFE, w, 15);
    this.levelBox.fillStyle(PAL.HUD_GREEN, 1).fillRect(SAFE + 1, SAFE + 1, w - 2, 13);
  }

  private onScore({ score }: GameEvents['score']): void {
    this.scoreText.setText(`SCORE ${String(Math.min(score, 999999)).padStart(6, '0')}`);
  }

  private onRecords({ count }: GameEvents['records']): void {
    this.recordText.setText(`x${count}`);
    if (count === 0) return;
    this.tweens.killTweensOf(this.recordIcon);
    this.recordIcon.setScale(1.5);
    this.tweens.add({ targets: this.recordIcon, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  private onLevelUp({ label }: GameEvents['level-up']): void {
    this.setLevel(label);
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(label).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1700, duration: 500 });
  }

  private onVehicle({ id, name }: GameEvents['vehicle']): void {
    this.vehicleText.setVisible(id !== null).setText(name);
  }

  private onBlind({ strength }: GameEvents['blind']): void {
    this.tweens.killTweensOf(this.blind);
    this.blind.setAlpha(strength);
    this.tweens.add({ targets: this.blind, alpha: 0, duration: 1300, ease: 'Quad.easeIn' });
  }

  private onMute({ muted }: GameEvents['mute']): void {
    this.soundButton.setLabel(muted ? 'OFF' : 'SND');
  }

  private toggleMute(): void {
    const muted = audio.toggleMute();
    getProfile().muted = muted;
    saveProfile();
    EventBus.emit('mute', { muted });
  }

  /* --------------------------- pause overlay ------------------------ */

  private togglePause(): void {
    if (this.state === 'over') return;
    if (this.state === 'playing') {
      this.state = 'paused';
      this.pausedAt = this.time.now;
      this.scene.pause(SCENES.GAME);
      audio.setThruster(false);
      audio.setBusDb('music', -22);
      this.showPause();
      EventBus.emit('pause', { paused: true });
    } else if (this.time.now - this.pausedAt > 120) {
      this.closeOverlay();
      this.state = 'playing';
      audio.setBusDb('music', -12);
      this.scene.resume(SCENES.GAME);
      EventBus.emit('pause', { paused: false });
    }
  }

  private showPause(): void {
    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.INK, 0.62).setOrigin(0).setInteractive();
    const title = pixelText(this, GAME_W / 2, 110, 'PAUSED', 3).setOrigin(0.5);
    const tip = pixelText(this, GAME_W / 2, 248, 'P: RESUME   M: SOUND', 1, PAL.SILVER).setOrigin(0.5);
    const resume = new PixelButton(this, GAME_W / 2, 164, 132, 20, 'RESUME', () => this.togglePause());
    const quit = new PixelButton(this, GAME_W / 2, 192, 132, 20, 'QUIT TO TITLE', () => this.leaveTo(SCENES.TITLE));
    this.overlay = this.add.container(0, 0, [dim, title, tip, resume, quit]);
    this.nav = new MenuNav(this, [resume, quit], 0);
  }

  private closeOverlay(): void {
    this.nav?.destroy();
    this.nav = null;
    this.overlay?.destroy(true);
    this.overlay = null;
  }

  /* ---------------------------- game over --------------------------- */

  private onGameOver(result: GameEvents['game-over']): void {
    if (this.state === 'over') return;
    this.closeOverlay();
    this.state = 'over';
    this.vehicleText.setVisible(false);

    const w = 268;
    const h = 196;
    const x = (GAME_W - w) / 2;
    const y = (GAME_H - h) / 2 + 4;
    const cx = GAME_W / 2;
    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.INK, 0.5).setOrigin(0).setInteractive();
    const panel = pixelPanel(this, x, y, w, h);
    const title = pixelText(this, cx, y + 18, 'WIPED OUT', 2, PAL.RED).setOrigin(0.5);

    const rows: Array<[string, string, number]> = [
      ['SCORE', String(result.score).padStart(6, '0'), PAL.WHITE],
      ['DISTANCE', `${result.distance}M`, PAL.WHITE],
      ['RECORDS', `+${result.records}`, PAL.HUD_YELLOW],
      ['BEST', String(result.best).padStart(6, '0'), result.newBest ? PAL.HUD_YELLOW : PAL.SILVER],
    ];
    const parts: Phaser.GameObjects.GameObject[] = [dim, panel, title];
    rows.forEach(([name, value, tint], i) => {
      parts.push(pixelText(this, x + 28, y + 40 + i * 14, name, 1, PAL.SILVER));
      parts.push(pixelText(this, x + w - 28, y + 40 + i * 14, value, 1, tint).setOrigin(1, 0));
    });
    if (result.newBest) {
      const best = pixelText(this, cx, y + 100, 'NEW BEST!', 1, PAL.HUD_YELLOW).setOrigin(0.5);
      this.tweens.add({ targets: best, scale: 1.25, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      parts.push(best);
    }
    parts.push(pixelText(this, cx, y + h - 9, `SEED ${result.seed}`, 1, PAL.SLATE).setOrigin(0.5));

    const retry = new PixelButton(this, cx, y + 120, 150, 20, 'RUN IT BACK', () => this.retry());
    const locker = new PixelButton(this, cx, y + 144, 150, 20, 'ERA LOCKER', () => this.leaveTo(SCENES.LOCKER));
    const home = new PixelButton(this, cx, y + 168, 150, 20, 'TITLE', () => this.leaveTo(SCENES.TITLE));
    parts.push(retry, locker, home);

    this.overlay = this.add.container(0, 0, parts).setAlpha(0);
    this.overlay.y = 14;
    this.tweens.add({ targets: this.overlay, alpha: 1, y: 0, duration: 220, ease: 'Quad.easeOut' });
    this.nav = new MenuNav(this, [retry, locker, home], 0);
    // Brief input lock so a thrust press that outlives the crash cannot restart by accident.
    const nav = this.nav;
    nav.setEnabled(false);
    this.time.delayedCall(450, () => nav.setEnabled(true));
  }

  private retry(): void {
    audio.play('confirm');
    audio.setBusDb('music', -12);
    this.scene.get(SCENES.GAME).scene.restart();
  }

  private leaveTo(target: string): void {
    audio.play('confirm');
    audio.setBusDb('music', -12);
    this.scene.stop(SCENES.GAME);
    this.scene.start(target);
  }
}
