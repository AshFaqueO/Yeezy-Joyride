import Phaser from 'phaser';
import { audio } from '../audio/ChipHopAudioEngine';
import { CEIL_Y, DEPTH, FLOOR_Y, GAME_W, PAL, TEX } from '../config/constants';
import type { JuiceManager } from '../systems/JuiceManager';

type DroneState = 'idle' | 'warn' | 'fly';

const WARN_SECONDS = 1.2;
/** In the last stretch the marker stops tracking, so a late dodge still works. */
const LOCK_SECONDS = 0.3;
const FLY_SPEED = 330;

/**
 * Surveillance drone "headline missile".
 * Warning: a red [!] box rides the right screen edge and tracks the player's
 * height for 1.2s while beeping faster. Attack: a DSLR quadcopter rockets across
 * the screen at the locked height, trailing smoke.
 */
export class CameraDrone extends Phaser.Physics.Arcade.Sprite {
  private phase: DroneState = 'idle';
  private timer = 0;
  private delay = 0;
  private lockY = 0;
  private beepIn = 0;
  private smokeIn = 0;
  private readonly warnIcon: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.DRONE, 0);
    this.warnIcon = scene.add
      .sprite(GAME_W - 12, 0, TEX.WARN, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.WARNING)
      .setVisible(false);
    this.setDepth(DEPTH.HAZARD + 0.5);
  }

  get isFlying(): boolean {
    return this.phase === 'fly';
  }

  /** Begins the lock-on. A delay staggers salvos so they can each be read. */
  arm(playerY: number, delaySeconds: number): void {
    this.phase = 'warn';
    this.delay = delaySeconds;
    this.timer = WARN_SECONDS;
    this.lockY = playerY;
    this.beepIn = 0;
    this.setActive(true).setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
  }

  tick(dt: number, playerY: number, speed: number, juice: JuiceManager): void {
    if (this.phase === 'warn') {
      if (this.delay > 0) {
        this.delay -= dt;
        return;
      }
      if (!this.warnIcon.visible) {
        this.warnIcon.setVisible(true);
        audio.duck(-6, 260);
      }
      this.timer -= dt;
      if (this.timer > LOCK_SECONDS) {
        const t = 1 - Math.exp(-7 * dt);
        this.lockY += (playerY - this.lockY) * t;
      }
      this.lockY = Phaser.Math.Clamp(this.lockY, CEIL_Y + 12, FLOOR_Y - 12);
      const urgency = 1 - Math.max(0, this.timer) / WARN_SECONDS;
      this.warnIcon.y = Math.round(this.lockY - this.scene.cameras.main.scrollY);
      this.warnIcon.setFrame(Math.floor(this.timer * (6 + urgency * 14)) % 2);
      this.warnIcon.setScale(this.timer <= LOCK_SECONDS ? 1.25 : 1);
      this.beepIn -= dt;
      if (this.beepIn <= 0) {
        this.beepIn = Phaser.Math.Linear(0.3, 0.08, urgency);
        audio.play('beep', this.timer <= LOCK_SECONDS ? 1 : 0);
      }
      if (this.timer <= 0) this.fire(speed);
      return;
    }

    if (this.phase === 'fly') {
      this.setVelocityX(-(speed + FLY_SPEED));
      this.smokeIn -= dt;
      if (this.smokeIn <= 0) {
        this.smokeIn = 0.035;
        juice.smoke(this.x + 14, this.y + 2);
      }
      if (this.x < -50) this.retire();
    }
  }

  private fire(speed: number): void {
    this.phase = 'fly';
    this.warnIcon.setVisible(false);
    this.enableBody(true, GAME_W + 50, this.lockY, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(22, 10).setOffset(3, 5);
    this.setVelocity(-(speed + FLY_SPEED), 0);
    this.play('drone-fly');
    audio.play('launch');
    audio.duck(-6, 380);
  }

  /** Destroyed by a vehicle or shield. */
  explode(juice: JuiceManager): void {
    juice.burst(this.x, this.y, 'medium', PAL.ORANGE);
    this.retire();
  }

  retire(): void {
    this.phase = 'idle';
    this.warnIcon.setVisible(false);
    this.disableBody(true, true);
  }

  override destroy(fromScene?: boolean): void {
    this.warnIcon.destroy();
    super.destroy(fromScene);
  }
}
