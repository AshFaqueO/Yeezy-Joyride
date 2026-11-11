import Phaser from 'phaser';
import { audio } from '../audio/ChipHopAudioEngine';
import { DEPTH, FLOOR_Y, PAL, TEX } from '../config/constants';

type PapState = 'idle' | 'run' | 'aim' | 'flash' | 'flee';

const NOTICE_NEAR = 46;
const NOTICE_FAR = 190;
/** A player flying lower than this makes the photographers scatter instead of shoot. */
const SCARE_HEIGHT = 62;
const AIM_SECONDS = 0.42;
const AIM_COMMIT_SECONDS = 0.16;
const FLASH_SECONDS = 0.2;
const CONE_LENGTH = 170;
const CONE_HALF_ANGLE = 0.24;

/**
 * Rooftop photographer. Scurries along the roof; when Ye passes overhead it plants
 * its feet, telegraphs, and fires a blinding flash cone. Buzz it at low altitude and
 * it runs for cover instead.
 */
export class RooftopPaparazzi extends Phaser.Physics.Arcade.Sprite {
  private phase: PapState = 'idle';
  private timer = 0;
  private walk = 0;
  private variant = 0;
  private aimAngle = 0;
  private hasShot = false;
  private readonly cone: Phaser.GameObjects.Graphics;
  private readonly tri = new Phaser.Geom.Triangle();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.PAP + 0, 0);
    this.setOrigin(0.5, 1).setDepth(DEPTH.NPC);
    this.cone = scene.add.graphics().setDepth(DEPTH.FX).setVisible(false);
  }

  spawn(x: number, variant: number, walk: number): void {
    this.variant = variant;
    this.walk = walk;
    this.phase = 'run';
    this.hasShot = false;
    this.setTexture(TEX.PAP + variant, 0);
    this.enableBody(true, x, FLOOR_Y + 1, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(8, 14).setOffset(2, 3);
    this.setFlipX(walk > 0);
    this.play(`pap${variant}-run`);
  }

  /** Sends this photographer running (buzzed, hit by a sneaker, or a vehicle nearby). */
  scatter(): void {
    if (this.phase === 'flee' || this.phase === 'idle') return;
    this.phase = 'flee';
    this.cone.setVisible(false);
    this.walk = Math.random() < 0.5 ? 90 : -60;
    this.setFlipX(this.walk > 0);
    this.play({ key: `pap${this.variant}-run`, frameRate: 18 });
    this.scene.tweens.add({ targets: this, y: FLOOR_Y - 7, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  /**
   * @returns true on the single frame the flash fires *and* catches the player.
   */
  tick(dt: number, speed: number, playerX: number, playerY: number): boolean {
    if (this.phase === 'idle') return false;
    let blinded = false;
    const dx = this.x - playerX;

    switch (this.phase) {
      case 'run':
        this.setVelocityX(-speed + this.walk);
        if (!this.hasShot && dx > NOTICE_NEAR && dx < NOTICE_FAR) {
          if (playerY > FLOOR_Y - SCARE_HEIGHT) {
            this.scatter();
          } else {
            this.phase = 'aim';
            this.timer = AIM_SECONDS;
            this.setFlipX(false);
            this.anims.stop();
            this.setFrame(2);
          }
        }
        break;
      case 'aim':
        this.setVelocityX(-speed);
        this.timer -= dt;
        // Track, then commit shortly before the shutter drops so a late dodge works.
        if (this.timer > AIM_COMMIT_SECONDS) {
          this.aimAngle = Math.atan2(playerY - (this.y - 15), playerX - (this.x - 5));
        }
        this.buildCone(0.16);
        if (this.timer <= 0) {
          this.phase = 'flash';
          this.timer = FLASH_SECONDS;
          this.hasShot = true;
          this.setFrame(3);
          this.buildCone(1);
          audio.play('shutter');
          blinded = Phaser.Geom.Triangle.Contains(this.tri, playerX, playerY);
        }
        break;
      case 'flash':
        this.setVelocityX(-speed);
        this.timer -= dt;
        this.cone.setAlpha(Math.max(0, this.timer / FLASH_SECONDS));
        this.cone.x -= speed * dt;
        if (this.timer <= 0) {
          this.cone.setVisible(false);
          this.phase = 'run';
          this.play(`pap${this.variant}-run`);
          this.setFlipX(this.walk > 0);
        }
        break;
      case 'flee':
        this.setVelocityX(-speed + this.walk);
        break;
    }

    if (this.x < -30 || this.x > 900) this.retire();
    return blinded;
  }

  /** Faint while aiming (the telegraph), full strength on the shutter frame. */
  private buildCone(alpha: number): void {
    const ox = this.x - 5;
    const oy = this.y - 15;
    const a1 = this.aimAngle - CONE_HALF_ANGLE;
    const a2 = this.aimAngle + CONE_HALF_ANGLE;
    this.tri.setTo(
      ox,
      oy,
      ox + Math.cos(a1) * CONE_LENGTH,
      oy + Math.sin(a1) * CONE_LENGTH,
      ox + Math.cos(a2) * CONE_LENGTH,
      oy + Math.sin(a2) * CONE_LENGTH,
    );
    this.cone.clear().setPosition(0, 0).setAlpha(alpha).setVisible(true);
    this.cone.fillStyle(PAL.WHITE, 0.5);
    this.cone.fillTriangle(this.tri.x1, this.tri.y1, this.tri.x2, this.tri.y2, this.tri.x3, this.tri.y3);
    this.cone.fillStyle(PAL.GOLD_LT, 0.9);
    this.cone.fillCircle(ox, oy, 4);
  }

  retire(): void {
    this.phase = 'idle';
    this.cone.setVisible(false);
    this.scene.tweens.killTweensOf(this);
    this.disableBody(true, true);
  }

  override destroy(fromScene?: boolean): void {
    this.cone.destroy();
    super.destroy(fromScene);
  }
}
