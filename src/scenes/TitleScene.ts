import Phaser from 'phaser';
import { audio } from '../audio/ChipHopAudioEngine';
import { DEPTH, GAME_H, GAME_W, PAL, SCENES, TEX } from '../config/constants';
import { eraById, getProfile } from '../config/eras';
import { fitCamera } from '../config/view';
import { CharacterRig, RIGS } from '../entities/CharacterRig';
import { SeededRNG } from '../systems/ObstacleSpawner';
import { ParallaxCityManager } from '../systems/ParallaxCityManager';
import { MenuNav, PixelButton, SAFE, pixelText } from './UIScene';

/** Animated rooftop title screen with access to the run and the Era Locker. */
export class TitleScene extends Phaser.Scene {
  private parallax!: ParallaxCityManager;
  private nav: MenuNav | null = null;
  private hero: CharacterRig | null = null;
  private heroFx: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private readonly nozzle = new Phaser.Math.Vector2();

  init(): void {
    this.hero = null;
    this.heroFx = [];
  }

  constructor() {
    super(SCENES.TITLE);
  }

  create(): void {
    const profile = getProfile();
    fitCamera(this);
    this.cameras.main.setScroll(0, 0);
    this.parallax = new ParallaxCityManager(this, new SeededRNG(2004));
    this.parallax.setCity(0, true);

    // Ye hovering on the left, pack lit.
    const yeX = 138;
    const yeY = 176;
    const flame = this.add
      .particles(yeX - 20, yeY + 12, TEX.FX, {
        frame: ['flame', 'p3', 'p2'],
        lifespan: { min: 200, max: 420 },
        speedX: { min: -130, max: -40 },
        speedY: { min: 120, max: 260 },
        scale: 2,
        color: [0xfff6b0, PAL.GOLD, PAL.ORANGE, PAL.RED_DK],
        alpha: { start: 1, end: 0 },
        frequency: 18,
        quantity: 2,
      })
      .setDepth(DEPTH.PACK - 0.5);
    const notes = this.add
      .particles(yeX - 22, yeY + 14, TEX.FX, {
        frame: ['note1', 'note2'],
        lifespan: 900,
        speedX: { min: -150, max: -80 },
        speedY: { min: -10, max: 80 },
        scale: 2,
        tint: PAL.GOLD,
        alpha: { start: 1, end: 0 },
        frequency: 190,
      })
      .setDepth(DEPTH.PACK - 0.5);
    const pack = this.add.image(yeX - 20, yeY - 2, TEX.PACK + profile.jetpack, 0).setScale(2).setDepth(DEPTH.PACK);
    const ye = this.add.image(yeX, yeY, TEX.YE + profile.era, 4).setScale(2).setDepth(DEPTH.PLAYER);
    const rigName = eraById(profile.era).rig;
    const rigDef = rigName ? RIGS[rigName] : undefined;
    if (rigDef) {
      // Illustrated character: full-detail rig at double size, exhaust pinned to its nozzle.
      this.hero = new CharacterRig(this, rigDef);
      this.hero.root.setScale(2);
      this.heroFx = [flame, notes];
      pack.setVisible(false);
      ye.setVisible(false);
    }
    this.tweens.add({
      targets: [ye, pack, flame, notes],
      y: '-=12',
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Logo
    const cx = 396;
    pixelText(this, cx + 3, 67, 'YEEZY', 6, PAL.RED_DK).setOrigin(0.5).setDepth(DEPTH.OVERLAY);
    const logo = pixelText(this, cx, 64, 'YEEZY', 6, PAL.GOLD).setOrigin(0.5).setDepth(DEPTH.OVERLAY);
    const sub = pixelText(this, cx, 116, 'JOYRIDE', 4, PAL.WHITE).setOrigin(0.5).setDepth(DEPTH.OVERLAY);
    this.tweens.add({ targets: [logo, sub], scale: 1.04, duration: 682, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    pixelText(this, cx, 144, 'A 16-BIT ROOFTOP RUNNER', 1, PAL.HUD_YELLOW).setOrigin(0.5).setDepth(DEPTH.OVERLAY);

    const play = new PixelButton(this, cx, 184, 150, 22, 'PLAY', () => this.go(SCENES.GAME)).setDepth(DEPTH.OVERLAY);
    const locker = new PixelButton(this, cx, 212, 150, 22, 'ERA LOCKER', () => this.go(SCENES.LOCKER)).setDepth(DEPTH.OVERLAY);
    this.nav = new MenuNav(this, [play, locker], 0);

    // Bank and best score
    this.add.sprite(SAFE + 7, SAFE + 7, TEX.VINYL, 0).play('vinyl-spin').setDepth(DEPTH.OVERLAY);
    pixelText(this, SAFE + 16, SAFE + 3, `x${profile.records}`, 1, PAL.HUD_YELLOW).setDepth(DEPTH.OVERLAY);
    pixelText(this, GAME_W - SAFE, SAFE + 3, `BEST ${String(profile.best).padStart(6, '0')}`).setOrigin(1, 0).setDepth(DEPTH.OVERLAY);

    const hint = pixelText(this, GAME_W / 2, GAME_H - 14, 'SPACE / TOUCH: FLY    P: PAUSE    M: SOUND', 1, PAL.WHITE)
      .setOrigin(0.5)
      .setDepth(DEPTH.OVERLAY);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    audio.setIntensity(0);
    audio.startMusic();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nav?.destroy();
      this.nav = null;
    });
  }

  private go(target: string): void {
    audio.unlock();
    audio.play('confirm');
    this.scene.start(target);
  }

  override update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.parallax.update(dt, 78);
    if (this.hero) {
      // Hover on a slow sine; feeding its velocity to the rig makes the legs sway with it.
      const phase = time / 520;
      this.hero.update(dt, 140, 222 + Math.sin(phase) * 7, false, Math.cos(phase) * 150, false);
      this.hero.root.setRotation(this.hero.lean);
      this.hero.nozzle(this.nozzle);
      for (const fx of this.heroFx) fx.setPosition(this.nozzle.x, this.nozzle.y);
    }
  }
}
