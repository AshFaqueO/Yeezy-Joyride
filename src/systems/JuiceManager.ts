import Phaser from 'phaser';
import { view } from '../config/view';
import { CAMERA, DEPTH, FONT_PX, GAME_H, JUICE, PAL, TEX } from '../config/constants';

export type FeedbackTier = 'small' | 'medium' | 'large';

type Scalable = Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;

/**
 * All transient feedback in one place: hit-stop, trauma screen shake, squash and
 * stretch, particle bursts, flashes and score pops. It also owns the camera rig,
 * because shake has to be composed on top of the follow offset, never mixed into it.
 */
export class JuiceManager {
  private trauma = 0;
  private shakeClock = 0;
  private dirX = 0;
  private dirY = 0;
  private freezeUntil = 0;
  private frozen = false;

  private focusY = 200;
  private camX = 0;
  private camY = 0;

  private readonly burstEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparkleEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private readonly scene: Phaser.Scene) {
    this.burstEmitter = scene.add
      .particles(0, 0, TEX.FX, {
        frame: ['p2', 'p3', 'spark', 'p1'],
        lifespan: { min: 260, max: 620 },
        speed: { min: 50, max: 210 },
        angle: { min: 0, max: 360 },
        gravityY: 320,
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.FX);
    this.sparkleEmitter = scene.add
      .particles(0, 0, TEX.FX, {
        frame: ['star', 'spark', 'p1'],
        lifespan: { min: 180, max: 380 },
        speed: { min: 15, max: 70 },
        angle: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.FX);
    this.smokeEmitter = scene.add
      .particles(0, 0, TEX.FX, {
        frame: 'smoke',
        lifespan: { min: 320, max: 560 },
        speedX: { min: 20, max: 70 },
        speedY: { min: -18, max: 18 },
        scale: { start: 0.6, end: 1.5 },
        alpha: { start: 0.65, end: 0 },
        tint: PAL.SILVER,
        emitting: false,
      })
      .setDepth(DEPTH.HAZARD - 1);
    this.dustEmitter = scene.add
      .particles(0, 0, TEX.FX, {
        frame: ['p2', 'p3'],
        lifespan: { min: 180, max: 340 },
        speedX: { min: -90, max: 40 },
        speedY: { min: -50, max: -8 },
        gravityY: 160,
        alpha: { start: 0.9, end: 0 },
        tint: PAL.CONCRETE,
        emitting: false,
      })
      .setDepth(DEPTH.PROPS);
  }

  /** True while a hit-stop is holding the simulation. */
  get isFrozen(): boolean {
    return this.frozen;
  }

  /* --------------------------- screen shake -------------------------- */

  /** Hits add trauma (0..1). A direction biases the shake along the impact. */
  addTrauma(amount: number, dirX = 0, dirY = 0): void {
    this.trauma = Phaser.Math.Clamp(this.trauma + amount, 0, 1);
    const len = Math.hypot(dirX, dirY);
    if (len > 0) {
      this.dirX = dirX / len;
      this.dirY = dirY / len;
    }
  }

  /* ----------------------------- hit-stop ---------------------------- */

  /**
   * Freezes physics, tweens, animations and timers for a few real milliseconds.
   * Overlapping calls extend the freeze; only the latest deadline restores time.
   */
  hitStop(ms: number = JUICE.HIT_STOP_MS): void {
    this.freezeUntil = Math.max(this.freezeUntil, performance.now() + ms);
    if (this.frozen) return;
    this.frozen = true;
    this.scene.physics.world.pause();
    this.scene.tweens.pauseAll();
    this.scene.anims.pauseAll();
    this.scene.time.paused = true;
  }

  private releaseFreeze(): void {
    this.frozen = false;
    this.scene.physics.world.resume();
    this.scene.tweens.resumeAll();
    this.scene.anims.resumeAll();
    this.scene.time.paused = false;
  }

  /* ------------------------- squash and stretch ---------------------- */

  /** Snaps to a volume-preserving squash, then springs back with overshoot. */
  squash(targets: Scalable[], scaleX: number, scaleY: number, ms: number): void {
    this.scene.tweens.killTweensOf(targets);
    for (const t of targets) t.setScale(scaleX, scaleY);
    this.scene.tweens.add({ targets, scaleX: 1, scaleY: 1, duration: ms * 2, ease: 'Back.easeOut' });
  }

  /* ------------------------------ particles -------------------------- */

  burst(x: number, y: number, tier: FeedbackTier, color: number): void {
    const count = tier === 'small' ? 6 : tier === 'medium' ? 14 : 34;
    this.burstEmitter.setParticleTint(color);
    this.burstEmitter.explode(count, x, y);
    if (tier !== 'small') {
      this.burstEmitter.setParticleTint(PAL.WHITE);
      this.burstEmitter.explode(Math.ceil(count / 3), x, y);
    }
  }

  sparkle(x: number, y: number, color: number, count = 4): void {
    this.sparkleEmitter.setParticleTint(color);
    this.sparkleEmitter.explode(count, x, y);
  }

  smoke(x: number, y: number): void {
    this.smokeEmitter.explode(1, x, y);
  }

  dust(x: number, y: number, count = 6): void {
    this.dustEmitter.explode(count, x, y);
  }

  /** Brief full-screen flash; alpha keeps it from becoming a strobe. */
  flash(ms: number, color: number = PAL.WHITE, strength = 0.7): void {
    const r = ((color >> 16) & 255) * strength;
    const g = ((color >> 8) & 255) * strength;
    const b = (color & 255) * strength;
    this.scene.cameras.main.flash(ms, r, g, b, true);
  }

  /** Floating label that rises and fades (score pops, power-up names). */
  popText(x: number, y: number, text: string, tint: number = PAL.WHITE, size = 1): void {
    const label = this.scene.add
      .bitmapText(x, y, TEX.FONT, text, FONT_PX * size)
      .setOrigin(0.5)
      .setTint(tint)
      .setDepth(DEPTH.OVERLAY);
    label.setScale(0.4);
    this.scene.tweens.add({ targets: label, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: label,
      y: y - 22,
      alpha: 0,
      delay: 380,
      duration: 420,
      ease: 'Quad.easeIn',
      onComplete: () => label.destroy(),
    });
  }

  /* -------------------------------- camera --------------------------- */

  /**
   * 2D rig: vertical deadzone, horizontal look-ahead, bounds clamp, all smoothed
   * frame-rate independently. Call after the player has moved this frame.
   *
   * @param speedRatio 0..1+, how far into its speed range the run is.
   */
  private follow(dt: number, targetY: number, speedRatio: number): void {
    // Deadzone: the focus only moves by the overflow beyond the box.
    const over = targetY - this.focusY;
    if (Math.abs(over) > CAMERA.DEADZONE_Y) this.focusY += over - Math.sign(over) * CAMERA.DEADZONE_Y;

    // Map the focus onto the small pan range and clamp to the level bounds.
    const wantY = Phaser.Math.Clamp((this.focusY - GAME_H * 0.55) * 0.16, -CAMERA.PAN_UP, CAMERA.PAN_DOWN);
    const wantX = Phaser.Math.Clamp(speedRatio, 0, 1.3) * CAMERA.LOOK_AHEAD;
    const t = 1 - Math.exp(-CAMERA.RATE * dt);
    this.camX += (Math.min(wantX, CAMERA.OVERSCAN - JUICE.SHAKE_MAX_X) - this.camX) * t;
    this.camY += (wantY - this.camY) * t;
  }

  /**
   * Per-frame tick with real (unscaled) delta. Releases hit-stop, decays trauma,
   * and writes the final camera scroll: smooth follow first, shake added last.
   */
  update(deltaMs: number, targetY: number, speedRatio: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.frozen && performance.now() >= this.freezeUntil) this.releaseFreeze();
    if (!this.frozen) this.follow(dt, targetY, speedRatio);

    let shakeX = 0;
    let shakeY = 0;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - JUICE.SHAKE_DECAY * dt);
      const s = this.trauma * this.trauma;
      this.shakeClock += dt * 34;
      // Summed sines read as smooth noise; a random offset per frame just buzzes.
      const nx = Math.sin(this.shakeClock * 1.7) * 0.6 + Math.sin(this.shakeClock * 2.9 + 1.3) * 0.4;
      const ny = Math.sin(this.shakeClock * 2.3 + 0.7) * 0.6 + Math.sin(this.shakeClock * 3.7) * 0.4;
      const kick = Math.cos(this.shakeClock * 1.1);
      shakeX = JUICE.SHAKE_MAX_X * s * (nx * 0.55 + this.dirX * kick * 0.7);
      shakeY = JUICE.SHAKE_MAX_Y * s * (ny * 0.55 + this.dirY * kick * 0.7);
      if (this.trauma === 0) {
        this.dirX = 0;
        this.dirY = 0;
      }
    }
    // Snap to whole screen pixels (not whole world pixels) so the follow stays smooth when zoomed.
    const z = view.zoom;
    this.scene.cameras.main.setScroll(Math.round((this.camX + shakeX) * z) / z, Math.round((this.camY + shakeY) * z) / z);
  }
}
