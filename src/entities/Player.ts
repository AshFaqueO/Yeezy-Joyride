import Phaser from 'phaser';
import { audio } from '../audio/ChipHopAudioEngine';
import { DEPTH, FLOOR_Y, JUICE, PAL, PHYS, PLAYER_X, TEX } from '../config/constants';
import { eraById, jetpackById, vehicleById, type EraId, type JetpackDef, type VehicleId } from '../config/eras';
import type { JuiceManager } from '../systems/JuiceManager';
import { CharacterRig, RIGS } from './CharacterRig';

export type PlayerMode = 'jetpack' | VehicleId;
export type HitResult = 'ignored' | 'blast' | 'absorbed' | 'dead';

const MECH_GRAVITY = 900;
const TRUCK_GRAVITY = 900;
const BOARD_GRAVITY = 300;
const MECH_CHARGE_SECONDS = 0.7;
const SHIELD_MAGNET_RADIUS = 96;

/**
 * Compact Ye: a 20x26 sprite with a 16x22 hitbox. Holds the jetpack state
 * machine and the four power-up transformations. The body is driven only through
 * acceleration and velocity; the world scrolls past a fixed x.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  mode: PlayerMode = 'jetpack';
  alive = true;
  thrusting = false;
  /** Obstacle contacts the current vehicle can still absorb. */
  vehicleHits = 0;

  private readonly pack: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Image;
  private readonly board: Phaser.GameObjects.Image;
  private readonly flame: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly notes: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly jetDef: JetpackDef;
  /** Illustrated characters draw through a rig; this sprite then only carries the physics body. */
  private readonly rig: CharacterRig | null;
  private readonly nozzle = new Phaser.Math.Vector2();
  /** Hoverboard flip angle in degrees (tweened). */
  flip = 0;
  private deadSpin = 0;
  private dustIn = 0;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly hitbox = new Phaser.Geom.Rectangle();

  private invulnUntil = 0;
  private vehicleEndsAt = 0;
  private wasOnFloor = true;
  private wasHeld = false;
  private fireIn = 0;
  private noteIn = 0;
  private charge = 0;
  private airJumps = 0;
  private lastFallSpeed = 0;
  private now = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly era: EraId,
    jetpack: JetpackDef['id'],
    private readonly juice: JuiceManager,
    private readonly projectiles: Phaser.Physics.Arcade.Group,
  ) {
    super(scene, PLAYER_X, FLOOR_Y - 20, TEX.YE + era, 0);
    this.jetDef = jetpackById(jetpack);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.PLAYER);

    this.pack = scene.add.image(this.x, this.y, TEX.PACK + jetpack, 0).setDepth(DEPTH.PACK);
    this.aura = scene.add.image(this.x, this.y, TEX.SHIELD).setDepth(DEPTH.PLAYER + 0.5).setVisible(false);
    this.board = scene.add.image(this.x, this.y, TEX.BOARD, 0).setDepth(DEPTH.PACK).setVisible(false);

    const flameColors: Record<JetpackDef['id'], number[]> = {
      gold: [0xfff6b0, PAL.GOLD, PAL.ORANGE, PAL.RED_DK],
      autotune: [PAL.WHITE, PAL.CYAN, PAL.MAGENTA, PAL.PURPLE],
      hype: [PAL.WHITE, PAL.GOLD_LT, PAL.ORANGE, PAL.RED],
    };
    this.flame = scene.add
      .particles(0, 0, TEX.FX, {
        frame: ['flame', 'p3', 'p2', 'p2'],
        lifespan: { min: 160, max: 340 },
        speedX: { min: -110, max: -30 },
        speedY: { min: 110, max: 230 },
        color: flameColors[jetpack],
        alpha: { start: 1, end: 0.1 },
        frequency: 16,
        quantity: 2,
        emitting: false,
      })
      .setDepth(DEPTH.PACK - 0.5);
    this.notes = scene.add
      .particles(0, 0, TEX.FX, {
        frame: ['note1', 'note2', 'note1', 'shard', 'spark'],
        lifespan: { min: 500, max: 800 },
        speedX: { min: -150, max: -70 },
        speedY: { min: 20, max: 110 },
        gravityY: -40,
        rotate: { min: -20, max: 20 },
        alpha: { start: 1, end: 0 },
        tint: jetpack === 'autotune' ? PAL.CYAN : PAL.GOLD,
        emitting: false,
      })
      .setDepth(DEPTH.PACK - 0.5);

    // Soft contact shadow on the roof: shrinks and fades with altitude, so height reads at a glance.
    this.shadow = scene.add.ellipse(this.x, FLOOR_Y + 2, 22, 5, PAL.INK, 0.4).setDepth(DEPTH.PROPS + 0.5);

    const rigName = eraById(era).rig;
    this.rig = rigName && RIGS[rigName] ? new CharacterRig(scene, RIGS[rigName]) : null;
    if (this.rig) this.setVisible(false);

    this.applyJetpackBody();
    this.play(`${TEX.YE}${era}-run`);
  }

  /** What squash, blink and flips act on: the rig when there is one, else this sprite. */
  private get visual(): Phaser.GameObjects.Container | this {
    return this.rig ? this.rig.root : this;
  }

  /** World-space hitbox for the manual (non-Arcade) hazard tests. */
  get hitRect(): Phaser.Geom.Rectangle {
    const b = this.body as Phaser.Physics.Arcade.Body;
    return this.hitbox.setTo(b.x, b.y, b.width, b.height);
  }

  get onGround(): boolean {
    return (this.body as Phaser.Physics.Arcade.Body).blocked.down;
  }

  /** Falling in the mech crushes whatever it lands on. */
  get stomping(): boolean {
    return this.mode === 'mech' && !this.onGround;
  }

  get speedScale(): number {
    return this.alive && this.mode !== 'jetpack' ? vehicleById(this.mode).speedScale : 1;
  }

  /** The Mic Drop shield pulls records in while it lasts. */
  get magnet(): { x: number; y: number; radius: number } | null {
    return this.alive && this.mode === 'shield' ? { x: this.x, y: this.y, radius: SHIELD_MAGNET_RADIUS } : null;
  }

  get invulnerable(): boolean {
    return this.now < this.invulnUntil;
  }

  /* ------------------------------ update ---------------------------- */

  tick(time: number, dt: number, held: boolean, overVent: boolean): void {
    this.now = time;
    const body = this.body as Phaser.Physics.Arcade.Body;

    if (!this.alive) {
      this.thrusting = false;
      this.flame.emitting = false;
      if (body.blocked.down) {
        this.setAngularVelocity(0);
        this.setAngle(-90);
        this.setVelocityX(0);
      }
      this.updateShadow(body, false);
      if (this.rig) {
        const down = body.blocked.down;
        const crashPose = this.rig.has('crash');
        if (down && crashPose) this.rig.setPose('crash');
        this.rig.update(dt, body.center.x, body.bottom, false, 0, false);
        if (!down) this.deadSpin -= 11 * dt;
        else if (crashPose) this.deadSpin = 0;
        else {
          // No crash art: lay the flying pose on its back.
          this.deadSpin = -Math.PI / 2;
          this.rig.root.y -= 9;
        }
        this.rig.root.setRotation(this.deadSpin).setAlpha(1).setVisible(true);
      }
      return;
    }

    const pressed = held && !this.wasHeld;
    const released = !held && this.wasHeld;
    const onFloor = body.blocked.down;
    if (!onFloor) this.lastFallSpeed = body.velocity.y;

    switch (this.mode) {
      case 'mech':
        this.tickMech(dt, held, released, onFloor);
        break;
      case 'truck':
        this.tickTruck(pressed, released, onFloor, overVent);
        break;
      case 'board':
        this.tickBoard(pressed, onFloor);
        break;
      default:
        this.tickJetpack(dt, held, pressed, onFloor);
        break;
    }

    if (onFloor && !this.wasOnFloor) this.land();
    this.wasOnFloor = onFloor;
    this.wasHeld = held;

    if (this.mode === 'shield' && time >= this.vehicleEndsAt) this.exitVehicle(false);

    // Blink while the post-hit grace period runs.
    const blink = this.invulnerable && Math.floor(time / 70) % 2 === 0 ? 0.35 : 1;
    this.setAlpha(blink);
    this.rig?.root.setAlpha(blink);
    this.syncAttachments(time, dt, onFloor);
  }

  private tickJetpack(dt: number, held: boolean, pressed: boolean, onFloor: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.thrusting = held;
    this.setAccelerationY(held ? PHYS.THRUST * this.jetDef.thrustScale : 0);

    if (pressed) {
      // Ignition: bleed off the fall so the pack answers instantly, then stretch.
      if (body.velocity.y > 0) this.setVelocityY(body.velocity.y * PHYS.IGNITION_DAMP);
      this.juice.squash([this.visual, this.pack], JUICE.IGNITE_STRETCH.x, JUICE.IGNITE_STRETCH.y, JUICE.IGNITE_STRETCH.ms);
      audio.play('ignite');
      if (onFloor) this.juice.dust(this.x - 4, FLOOR_Y, 5);
    }

    this.flame.emitting = held;
    if (held) {
      this.noteIn -= dt;
      if (this.noteIn <= 0) {
        this.noteIn = 0.16;
        this.notes.emitParticleAt(this.rig ? this.nozzle.x : this.x - 10, this.rig ? this.nozzle.y : this.y + 8, 1);
      }
      this.fireIn -= dt;
      if (this.fireIn <= 0) this.fireProjectile(body);
    }

    if (this.rig) this.rig.setPose(onFloor && !held ? 'run' : held ? 'fly' : 'glide');

    const runKey = `${TEX.YE}${this.era}-run`;
    if (onFloor && !held) {
      if (this.anims.currentAnim?.key !== runKey || !this.anims.isPlaying) this.play(runKey);
    } else {
      this.anims.stop();
      this.setFrame(held || body.velocity.y < 0 ? 4 : 5);
    }
  }

  /** Auto-Tune rings and Hype sneakers fire downward while thrusting. */
  private fireProjectile(body: Phaser.Physics.Arcade.Body): void {
    if (this.jetDef.id === 'gold') {
      this.fireIn = 1;
      return;
    }
    const ring = this.jetDef.id === 'autotune';
    this.fireIn = ring ? 0.17 : 0.12;
    const shot = this.projectiles.get(this.x - 9, this.y + 10) as Phaser.Physics.Arcade.Image | null;
    if (!shot) return;
    shot.setTexture(TEX.FX, ring ? 'ring' : 'sneaker');
    shot.enableBody(true, this.x - 9, this.y + 10, true, true);
    shot.setDepth(DEPTH.PROJECTILE).setAlpha(1).setAngle(0).setScale(1);
    shot.setData('ring', ring).setData('bounces', 0).setData('born', this.now);
    const sb = shot.body as Phaser.Physics.Arcade.Body;
    sb.setSize(shot.width, shot.height);
    if (ring) {
      shot.setTint(Math.floor(this.now / 170) % 2 === 0 ? PAL.CYAN : PAL.MAGENTA);
      sb.setAllowGravity(false);
      shot.setVelocity(-50, 250);
      audio.play('ring');
    } else {
      shot.clearTint();
      sb.setAllowGravity(true);
      sb.setGravityY(520);
      shot.setVelocity(Phaser.Math.Between(-120, -30), 230);
      shot.setAngularVelocity(-500);
      // Recoil: each sneaker kicks Ye upward.
      this.setVelocityY(Math.max(body.velocity.y - 17, -PHYS.MAX_VY));
      audio.play('sneaker');
    }
  }

  private tickMech(dt: number, held: boolean, released: boolean, onFloor: boolean): void {
    this.thrusting = false;
    if (onFloor) {
      if (held) {
        const before = this.charge;
        this.charge = Math.min(1, this.charge + dt / MECH_CHARGE_SECONDS);
        // Crouch deeper as the jump charges.
        this.setScale(1 + this.charge * 0.1, 1 - this.charge * 0.14);
        if (Math.floor(before * 5) !== Math.floor(this.charge * 5)) audio.play('charge', this.charge);
      }
      if (released) {
        this.setVelocityY(-(250 + 270 * this.charge));
        this.juice.squash([this], 0.84, 1.2, 110);
        this.juice.dust(this.x, FLOOR_Y, 8);
        audio.play('jump');
        this.charge = 0;
      }
      if (!held && !released && this.anims.currentAnim?.key !== 'mech-walk') this.play('mech-walk');
      if (held) this.anims.stop();
    } else {
      this.charge = 0;
      this.anims.stop();
      this.setFrame(2);
    }
  }

  private tickTruck(pressed: boolean, released: boolean, onFloor: boolean, overVent: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.thrusting = false;
    if (onFloor && overVent) {
      // Rooftop vents are launch ramps for the truck.
      this.setVelocityY(-400);
      this.juice.squash([this], 0.86, 1.18, 110);
      this.juice.dust(this.x, FLOOR_Y, 8);
      audio.play('jump');
    } else if (onFloor && pressed) {
      this.setVelocityY(-345);
      this.juice.squash([this], 0.9, 1.14, 90);
      audio.play('jump');
    } else if (released && body.velocity.y < -120) {
      // Variable jump height: letting go early cuts the rise.
      this.setVelocityY(body.velocity.y * 0.5);
    }
    this.setAngle(onFloor ? 0 : Phaser.Math.Clamp(body.velocity.y * 0.03, -10, 10));
  }

  private tickBoard(pressed: boolean, onFloor: boolean): void {
    this.thrusting = false;
    if (onFloor) this.airJumps = 0;
    if (pressed && (onFloor || this.airJumps < 2)) {
      if (!onFloor) this.airJumps++;
      this.setVelocityY(-225);
      audio.play('jump');
      // Low-gravity flip.
      this.scene.tweens.killTweensOf(this);
      this.flip = 0;
      this.scene.tweens.add({
        targets: this,
        flip: -360,
        duration: 460,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          this.flip = 0;
        },
      });
    }
    this.setAngle(this.flip);
    this.rig?.setPose(onFloor ? 'glide' : 'fly');
    this.anims.stop();
    this.setFrame(onFloor ? 5 : 4);
  }

  private land(): void {
    const impact = this.lastFallSpeed;
    if (impact < 70) return;
    const heavy = this.mode === 'mech' || this.mode === 'truck';
    const { x, y, ms } = JUICE.LAND_SQUASH;
    this.juice.squash(heavy ? [this] : [this.visual, this.pack], x, y, ms);
    this.juice.dust(this.x, FLOOR_Y, heavy ? 12 : 6);
    if (heavy) this.juice.addTrauma(0.22, 0, 1);
    audio.play('land');
  }

  private syncAttachments(time: number, dt: number, onFloor: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const vehicle = this.mode === 'mech' || this.mode === 'truck';
    this.updateShadow(body, vehicle);
    // Kick up roof dust with each stride.
    if (onFloor && !this.thrusting && this.mode === 'jetpack') {
      this.dustIn -= dt;
      if (this.dustIn <= 0) {
        this.dustIn = 0.16;
        this.juice.dust(body.center.x - 6, FLOOR_Y, 2);
      }
    }
    const rig = this.rig;
    if (rig) {
      // The rig stands on the bottom-centre of the hitbox and reacts to the body's motion.
      const striding = onFloor && !this.thrusting && this.mode !== 'board';
      rig.update(dt, body.center.x, body.bottom, onFloor, body.velocity.y, striding);
      rig.root.setRotation(rig.lean + Phaser.Math.DegToRad(this.flip)).setVisible(!vehicle);
      rig.nozzle(this.nozzle);
      this.setVisible(vehicle);
    }
    const showPack = this.mode === 'jetpack' || this.mode === 'shield';
    this.pack.setVisible(showPack && !rig);
    if (showPack) {
      this.pack.setPosition(this.x - 10 * this.scaleX, this.y - 1);
      if (rig) this.flame.setPosition(this.nozzle.x, this.nozzle.y);
      else this.flame.setPosition(this.x - 10, this.y + 6);
    }
    if (this.mode === 'shield') {
      const left = (this.vehicleEndsAt - time) / 1000;
      const pulse = 1 + Math.sin(time / 110) * 0.07;
      // Flicker in the last two seconds as a "running out" warning.
      this.aura.setVisible(left > 2 || Math.floor(time / 90) % 2 === 0);
      this.aura.setPosition(body.center.x, rig ? body.bottom - 20 : this.y).setScale(rig ? pulse * 1.25 : pulse).setAngle(time / 12);
    }
    if (this.mode === 'board') {
      this.board.setPosition(body.center.x, body.bottom + 2).setAngle(this.flip);
      if (Math.floor(time / 60) % 2 === 0) this.juice.sparkle(this.x - 12, this.y + 17, PAL.CYAN, 1);
    }
  }

  private updateShadow(body: Phaser.Physics.Arcade.Body, vehicle: boolean): void {
    const height = Math.max(0, FLOOR_Y - body.bottom);
    const k = Phaser.Math.Clamp(1 - height / 230, 0.3, 1);
    this.shadow
      .setPosition(body.center.x, FLOOR_Y + 2)
      .setScale((vehicle ? 1.7 : 1) * k, k)
      .setAlpha(0.42 * k);
  }

  /* --------------------------- transformations ---------------------- */

  private applyJetpackBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.rig) {
      // Taller box (shoulders to boots) hanging below the 20x26 proxy frame's top edge.
      body.setSize(PHYS.HITBOX_W, PHYS.PHOTO_HITBOX_H).setOffset(2, this.frame.height - PHYS.PHOTO_HITBOX_H);
    } else {
      body.setSize(PHYS.HITBOX_W, PHYS.HITBOX_H).setOffset(2, 3);
    }
    body.setGravityY(PHYS.GRAVITY);
    body.setMaxVelocity(0, PHYS.MAX_VY);
    body.setAllowGravity(true);
  }

  enterVehicle(id: VehicleId): void {
    const def = vehicleById(id);
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.clearVehicleVisuals();
    this.mode = id;
    this.vehicleHits = def.hits;
    this.vehicleEndsAt = def.durationMs > 0 ? this.now + def.durationMs : 0;
    this.charge = 0;
    this.airJumps = 0;
    this.setAccelerationY(0);
    this.flame.emitting = false;
    this.thrusting = false;

    switch (id) {
      case 'mech':
        this.setTexture(TEX.MECH, 0);
        body.setSize(24, 32).setOffset(5, 5);
        body.setGravityY(MECH_GRAVITY);
        body.setMaxVelocity(0, 560);
        this.play('mech-walk');
        break;
      case 'truck':
        this.setTexture(TEX.TRUCK, 0);
        body.setSize(38, 16).setOffset(3, 6);
        body.setGravityY(TRUCK_GRAVITY);
        body.setMaxVelocity(0, 560);
        this.play('truck-roll');
        break;
      case 'board':
        body.setGravityY(BOARD_GRAVITY);
        body.setMaxVelocity(0, 300);
        this.board.setVisible(true);
        break;
      default:
        this.aura.setVisible(true);
        break;
    }
    // Keep the new, larger body above the roof instead of letting it start embedded.
    const maxY = FLOOR_Y - this.height / 2 - 2;
    if (this.y > maxY) this.setY(maxY);
    this.setVelocityY(Math.min(body.velocity.y, 0));
    this.invulnUntil = this.now + 350;
    this.juice.squash([this], 1.35, 1.35, 120);
  }

  private clearVehicleVisuals(): void {
    this.scene.tweens.killTweensOf(this);
    this.flip = 0;
    this.setAngle(0).setScale(1);
    if (this.rig) {
      this.scene.tweens.killTweensOf(this.rig.root);
      this.rig.root.setScale(1);
    }
    this.aura.setVisible(false);
    this.board.setVisible(false);
  }

  /** Back to the jetpack. A broken vehicle grants a short grace period. */
  exitVehicle(broken: boolean): void {
    if (this.mode === 'jetpack') return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const bottom = body.bottom;
    this.clearVehicleVisuals();
    this.mode = 'jetpack';
    this.vehicleHits = 0;
    this.anims.stop();
    this.setTexture(TEX.YE + this.era, 5);
    this.applyJetpackBody();
    this.setY(Math.min(bottom, FLOOR_Y) - this.height / 2 - 1);
    this.wasOnFloor = false;
    this.lastFallSpeed = 0;
    if (broken) {
      this.invulnUntil = this.now + PHYS.INVULN_MS;
      this.setVelocityY(-150);
    }
  }

  /**
   * Resolves an obstacle contact.
   * blast: shield soaked it and survives. absorbed: vehicle destroyed, Ye lives.
   */
  takeHit(): HitResult {
    if (!this.alive || this.invulnerable) return 'ignored';
    if (this.mode !== 'jetpack') {
      this.vehicleHits--;
      if (this.vehicleHits > 0) {
        this.invulnUntil = this.now + 250;
        return 'blast';
      }
      this.exitVehicle(true);
      return 'absorbed';
    }
    this.die();
    return 'dead';
  }

  private die(): void {
    this.alive = false;
    this.thrusting = false;
    this.clearVehicleVisuals();
    this.pack.setVisible(false);
    this.flame.emitting = false;
    this.anims.stop();
    this.setFrame(5).setAlpha(1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocity(400, 520);
    body.setBounce(0, 0.35);
    this.setAccelerationY(0);
    this.setVelocity(60, -230);
    this.setAngularVelocity(-620);
  }

  override destroy(fromScene?: boolean): void {
    this.pack.destroy();
    this.aura.destroy();
    this.board.destroy();
    this.flame.destroy();
    this.notes.destroy();
    this.shadow.destroy();
    this.rig?.destroy();
    super.destroy(fromScene);
  }
}
