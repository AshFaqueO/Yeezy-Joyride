import Phaser from 'phaser';
import { audio } from '../audio/ChipHopAudioEngine';
import {
  CEIL_Y,
  DEPTH,
  FLOOR_Y,
  GAME_W,
  JUICE,
  PAL,
  RUN,
  SCENES,
  TEX,
  levelLabel,
} from '../config/constants';
import { VEHICLES, getProfile, saveProfile, vehicleById } from '../config/eras';
import { fitCamera } from '../config/view';
import type { CameraDrone } from '../entities/CameraDrone';
import type { ElectricZapper } from '../entities/ElectricZapper';
import { Player } from '../entities/Player';
import { EventBus } from '../events/EventBus';
import { JuiceManager } from '../systems/JuiceManager';
import { ObstacleSpawner, SeededRNG } from '../systems/ObstacleSpawner';
import { ParallaxCityManager } from '../systems/ParallaxCityManager';
import { RecordPatternSpawner } from '../systems/RecordPatternSpawner';

/** Metres over which difficulty ramps from 0 to 1. */
const DIFFICULTY_DISTANCE_M = 3200;
const STREAK_WINDOW_MS = 420;

/** Core run: physics loop, parallax, spawners, collisions, scoring. */
export class GameScene extends Phaser.Scene {
  private rng!: SeededRNG;
  private seed = 0;
  private juice!: JuiceManager;
  private parallax!: ParallaxCityManager;
  private records!: RecordPatternSpawner;
  private obstacles!: ObstacleSpawner;
  private player!: Player;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private crate!: Phaser.Physics.Arcade.Sprite;
  private keys: Phaser.Input.Keyboard.Key[] = [];

  private elapsed = 0;
  private speed = 0;
  private distancePx = 0;
  private recordsRun = 0;
  private bonus = 0;
  private lastScore = -1;
  private levelIndex = 0;
  private crateIn = 0;
  private streak = 0;
  private lastPickupAt = 0;
  private deadFor = 0;
  private finished = false;

  constructor() {
    super(SCENES.GAME);
  }

  /** Run state lives here, not in the constructor: the scene instance is reused on restart. */
  init(): void {
    this.elapsed = 0;
    this.speed = RUN.SPEED_START;
    this.distancePx = 0;
    this.recordsRun = 0;
    this.bonus = 0;
    this.lastScore = -1;
    this.levelIndex = 0;
    this.streak = 0;
    this.lastPickupAt = 0;
    this.deadFor = 0;
    this.finished = false;
  }

  create(): void {
    fitCamera(this);
    const profile = getProfile();
    this.seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.rng = new SeededRNG(this.seed);
    this.crateIn = this.rng.range(13, 19);

    this.juice = new JuiceManager(this);
    // Scenery draws from its own stream so cosmetic rolls never shift the obstacle sequence.
    this.parallax = new ParallaxCityManager(this, new SeededRNG(this.seed ^ 0x51ed270b));
    this.parallax.setCity(0, true);

    // Static roof and ceiling. Zones are invisible; the runway art is separate.
    const floor = this.add.zone(GAME_W / 2, FLOOR_Y + 30, GAME_W * 3, 60);
    const ceiling = this.add.zone(GAME_W / 2, CEIL_Y - 30, GAME_W * 3, 60);
    this.physics.add.existing(floor, true);
    this.physics.add.existing(ceiling, true);

    this.projectiles = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      defaultKey: TEX.FX,
      defaultFrame: 'ring',
      maxSize: 28,
    });

    this.records = new RecordPatternSpawner(this, this.rng);
    this.obstacles = new ObstacleSpawner(this, this.rng, this.records, this.juice);
    this.player = new Player(this, profile.era, profile.jetpack, this.juice, this.projectiles);

    this.crate = this.physics.add.sprite(-100, 0, TEX.CRATE, 0).setDepth(DEPTH.RECORDS + 0.5);
    this.crate.disableBody(true, true);

    // Registered once here, never per frame.
    this.physics.add.collider(this.player, floor);
    this.physics.add.collider(this.player, ceiling);
    this.physics.add.overlap(this.player, this.records.group, (_p, record) => {
      this.collectRecord(record as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.obstacles.drones, (_p, drone) => {
      this.onDroneContact(drone as CameraDrone);
    });
    this.physics.add.overlap(this.player, this.crate, () => this.collectCrate());

    const kb = this.input.keyboard;
    if (kb) {
      this.keys = [
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      ];
    }

    audio.setIntensity(1);
    audio.startMusic();

    this.registry.set('levelLabel', levelLabel(0));
    this.scene.launch(SCENES.UI);
    this.scene.bringToTop(SCENES.UI);
    EventBus.emit('run-start', { levelLabel: levelLabel(0) });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      audio.setThruster(false);
      this.scene.stop(SCENES.UI);
    });
  }

  private thrustHeld(): boolean {
    if (this.keys.some((k) => k.isDown)) return true;
    const input = this.input;
    return input.activePointer.isDown || input.pointer1.isDown || input.pointer2.isDown;
  }

  override update(time: number, delta: number): void {
    // Juice runs on real time so hit-stop can end and shake can decay while frozen.
    const ratio = (this.speed - RUN.SPEED_START) / (RUN.SPEED_MAX - RUN.SPEED_START);
    this.juice.update(delta, this.player.y, this.player.alive ? ratio : 0);
    if (this.juice.isFrozen) return;

    const dt = Math.min(delta, 50) / 1000;
    this.elapsed += dt;

    if (this.player.alive) {
      const cruise = Math.min(RUN.SPEED_MAX, RUN.SPEED_START + this.elapsed * RUN.SPEED_RAMP) * this.player.speedScale;
      this.speed += (cruise - this.speed) * (1 - Math.exp(-3 * dt));
    } else {
      // Skid to a halt after a wipe-out.
      this.speed *= Math.exp(-(this.player.onGround ? 3.4 : 0.9) * dt);
      this.deadFor += dt;
      if (!this.finished && this.deadFor > 1.1 && this.speed < 14) this.finishRun();
    }

    const dx = this.speed * dt;
    this.distancePx += dx;
    const distanceM = this.distancePx / RUN.PX_PER_M;
    const difficulty = Math.min(1, distanceM / DIFFICULTY_DISTANCE_M);

    this.parallax.update(dt, this.speed);
    this.records.update(this.speed, this.player.magnet);
    const blinded = this.obstacles.update(dt, this.speed, dx, difficulty, this.player.x, this.player.y);
    this.updateCrate(time, dt);
    this.updateProjectiles(time);

    const overVent = this.player.mode === 'truck' && this.parallax.ventNear(this.player.x);
    this.player.tick(time, dt, this.thrustHeld(), overVent);
    audio.setThruster(this.player.thrusting && this.player.alive);

    if (this.player.alive) {
      this.checkZappers();
      if (blinded) this.onBlinded();
      if (this.player.mode === 'mech' || this.player.mode === 'truck') this.obstacles.scatterNear(this.player.x + 30, 60);

      const level = Math.floor(distanceM / RUN.LEVEL_LENGTH_M);
      if (level !== this.levelIndex) this.levelUp(level);

      const score = Math.floor(distanceM) + this.recordsRun * RUN.RECORD_SCORE + this.bonus;
      if (score !== this.lastScore) {
        this.lastScore = score;
        EventBus.emit('score', { score, distance: Math.floor(distanceM) });
      }
    }
  }

  /* ----------------------------- pickups ---------------------------- */

  private collectRecord(record: Phaser.Physics.Arcade.Sprite): void {
    if (!record.active || !this.player.alive) return;
    this.records.collect(record);
    this.recordsRun++;
    // Quick pickups climb a pitch ladder.
    const now = this.time.now;
    this.streak = now - this.lastPickupAt < STREAK_WINDOW_MS ? this.streak + 1 : 0;
    this.lastPickupAt = now;
    audio.play('record', this.streak);
    this.juice.sparkle(record.x, record.y, PAL.GOLD_LT, 3);
    EventBus.emit('records', { count: this.recordsRun });
  }

  private updateCrate(time: number, dt: number): void {
    if (this.crate.active) {
      this.crate.setVelocity(-this.speed, Math.cos(time / 260) * 26);
      if (Math.floor(time / 120) % 3 === 0) this.juice.sparkle(this.crate.x, this.crate.y, PAL.WHITE, 1);
      if (this.crate.x < -30) this.crate.disableBody(true, true);
      return;
    }
    if (!this.player.alive || this.player.mode !== 'jetpack') return;
    this.crateIn -= dt;
    if (this.crateIn > 0) return;
    this.crateIn = this.rng.range(22, 32);
    this.crate.enableBody(true, GAME_W + 30, this.rng.range(CEIL_Y + 50, FLOOR_Y - 60), true, true);
    (this.crate.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.crate.play('crate-shine');
  }

  private collectCrate(): void {
    if (!this.crate.active || !this.player.alive || this.player.mode !== 'jetpack') return;
    const { x, y } = this.crate;
    this.crate.disableBody(true, true);
    const def = this.rng.weighted(VEHICLES);
    this.player.enterVehicle(def.id);
    this.bonus += 100;
    audio.play('crate');
    audio.play('fanfare');
    audio.duck(-6, 500);
    this.juice.hitStop(JUICE.HIT_STOP_MS);
    this.juice.flash(160, PAL.GOLD_LT, 0.55);
    this.juice.addTrauma(0.3);
    this.juice.burst(x, y, 'large', PAL.GOLD);
    this.juice.popText(this.player.x + 40, this.player.y - 26, def.name, PAL.HUD_YELLOW);
    EventBus.emit('vehicle', { id: def.id, name: def.name });
  }

  /* ----------------------------- hazards ---------------------------- */

  private checkZappers(): void {
    const rect = this.player.hitRect;
    for (const zapper of this.obstacles.zappers) {
      if (!zapper.active || !zapper.hits(rect)) continue;
      const mode = this.player.mode;
      // Mech stomps flatten any barrier; the truck rams the low pylon gates.
      if ((mode === 'mech' && this.player.stomping) || (mode === 'truck' && zapper.kind === 'gate')) {
        this.smashZapper(zapper, 50);
        continue;
      }
      this.resolveHit(zapper.x, zapper.kind === 'gate' ? FLOOR_Y - 24 : zapper.y, 'zap', () => this.smashZapper(zapper, 0));
      return;
    }
  }

  private smashZapper(zapper: ElectricZapper, points: number): void {
    const y = zapper.kind === 'gate' ? FLOOR_Y - 24 : zapper.y;
    this.juice.burst(zapper.x, y, 'medium', PAL.ELECTRIC);
    this.juice.addTrauma(0.3);
    audio.play('smash');
    zapper.kill();
    if (points > 0) {
      this.bonus += points;
      this.juice.popText(zapper.x, y - 14, `+${points}`, PAL.HUD_YELLOW);
    }
  }

  private onDroneContact(drone: CameraDrone): void {
    if (!drone.active || !drone.isFlying || !this.player.alive) return;
    if (this.player.mode === 'mech') {
      // The mech crushes drones outright.
      drone.explode(this.juice);
      this.bonus += 50;
      this.juice.popText(drone.x, drone.y - 12, '+50', PAL.HUD_YELLOW);
      this.juice.addTrauma(0.35, -1, 0);
      this.juice.hitStop(40);
      audio.play('explode');
      audio.duck();
      return;
    }
    this.resolveHit(drone.x, drone.y, 'explode', () => drone.explode(this.juice));
  }

  /**
   * One place decides what a hazard contact means: ignored (grace period),
   * soaked by the shield, vehicle destroyed, or the run ends.
   */
  private resolveHit(srcX: number, srcY: number, sfx: 'zap' | 'explode', destroySource: () => void): void {
    const wasVehicle = this.player.mode;
    const result = this.player.takeHit();
    if (result === 'ignored') return;

    const dirX = this.player.x - srcX;
    const dirY = this.player.y - srcY;
    this.juice.hitStop(JUICE.HIT_STOP_MS);
    audio.duck(-6, 420);

    if (result === 'dead') {
      audio.play(sfx);
      audio.play('hit');
      this.juice.addTrauma(0.95, dirX, dirY);
      this.juice.flash(140, PAL.WHITE, 0.8);
      this.juice.burst(this.player.x, this.player.y, 'large', sfx === 'zap' ? PAL.ELECTRIC : PAL.ORANGE);
      this.obstacles.halt();
      EventBus.emit('vehicle', { id: null, name: '' });
      return;
    }

    // Vehicle or shield took it: the obstacle is destroyed either way.
    destroySource();
    audio.play('smash');
    this.juice.addTrauma(0.55, dirX, dirY);
    this.juice.burst(this.player.x, this.player.y, 'medium', PAL.GOLD);
    if (result === 'absorbed') {
      audio.play('break');
      this.juice.flash(110, PAL.WHITE, 0.5);
      this.juice.popText(this.player.x + 30, this.player.y - 24, `${vehicleById(wasVehicle === 'jetpack' ? 'mech' : wasVehicle).name} DOWN`, PAL.RED);
      EventBus.emit('vehicle', { id: null, name: '' });
    } else {
      const left = this.player.vehicleHits;
      EventBus.emit('vehicle', { id: 'shield', name: `${vehicleById('shield').name} x${left}` });
    }
  }

  private onBlinded(): void {
    // Shield and armoured vehicles shrug off the flash.
    if (this.player.mode !== 'jetpack' || this.player.invulnerable) return;
    EventBus.emit('blind', { strength: 0.92 });
    this.juice.addTrauma(0.2);
    audio.duck(-6, 300);
  }

  /** Rings and sneakers: scroll, bounce, and knock out rooftop gates. */
  private updateProjectiles(time: number): void {
    for (const child of this.projectiles.getChildren()) {
      const shot = child as Phaser.Physics.Arcade.Image;
      if (!shot.active) continue;
      const ring = shot.getData('ring') as boolean;
      const body = shot.body as Phaser.Physics.Arcade.Body;

      for (const zapper of this.obstacles.zappers) {
        if (zapper.active && zapper.kind === 'gate' && zapper.gateBounds.contains(shot.x, shot.y)) {
          this.smashZapper(zapper, 25);
          shot.disableBody(true, true);
          break;
        }
      }
      if (!shot.active) continue;

      if (ring) {
        shot.setScale(1 + (time - (shot.getData('born') as number)) / 500);
        if (shot.y >= FLOOR_Y - 3) {
          this.obstacles.scatterNear(shot.x, 22);
          this.juice.sparkle(shot.x, FLOOR_Y - 2, shot.tintTopLeft, 3);
          shot.disableBody(true, true);
        }
      } else if (shot.y >= FLOOR_Y - 4 && body.velocity.y > 0) {
        const bounces = (shot.getData('bounces') as number) + 1;
        shot.setData('bounces', bounces);
        this.obstacles.scatterNear(shot.x, 20);
        if (bounces > 2) {
          shot.disableBody(true, true);
        } else {
          shot.setY(FLOOR_Y - 4);
          shot.setVelocity(body.velocity.x - this.speed * 0.3, -body.velocity.y * 0.45);
        }
      }
      if (shot.active && (shot.x < -20 || shot.y > FLOOR_Y + 40)) shot.disableBody(true, true);
    }
  }

  /* --------------------------- progression -------------------------- */

  private levelUp(level: number): void {
    this.levelIndex = level;
    const label = levelLabel(level);
    this.registry.set('levelLabel', label);
    this.parallax.setCity(level);
    this.bonus += 250;
    this.juice.flash(260, PAL.WHITE, 0.6);
    audio.play('levelup');
    EventBus.emit('level-up', { index: level, label });
  }

  private finishRun(): void {
    this.finished = true;
    const profile = getProfile();
    const distance = Math.floor(this.distancePx / RUN.PX_PER_M);
    // Count the skid after the crash too, so score and distance agree on the results panel.
    const score = distance + this.recordsRun * RUN.RECORD_SCORE + this.bonus;
    EventBus.emit('score', { score, distance });
    const newBest = score > profile.best;
    profile.records += this.recordsRun;
    if (newBest) profile.best = score;
    saveProfile();
    EventBus.emit('game-over', {
      score,
      records: this.recordsRun,
      distance,
      best: profile.best,
      newBest,
      seed: this.seed,
    });
  }
}
