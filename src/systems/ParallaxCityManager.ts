import Phaser from 'phaser';
import { CAMERA, CITIES, DEPTH, FLOOR_Y, GAME_H, GAME_W, RUNWAY, TEX } from '../config/constants';
import { view } from '../config/view';
import type { SeededRNG } from './ObstacleSpawner';

interface Car {
  sprite: Phaser.GameObjects.Image;
  /** Own road speed in px/s; negative drives left (with the scroll). */
  drive: number;
}

interface Prop {
  sprite: Phaser.GameObjects.Image;
  kind: string;
}

const PROP_KINDS = [
  { kind: 'ac', weight: 4 },
  { kind: 'vent', weight: 4 },
  { kind: 'duct', weight: 2 },
  { kind: 'antenna', weight: 2 },
  { kind: 'tank', weight: 1.5 },
  { kind: 'skylight', weight: 2 },
];

/** Scroll speed of each layer as a fraction of the runway speed. */
const FACTOR = { CLOUDS: 0.05, SKYLINE: 0.15, MID: 0.45, STREET: 0.7 } as const;

/**
 * The five-layer city: sky and clouds, distant skyline, midground brownstones with
 * billboards, the street gap (cabs and the elevated train), and the rooftop runway
 * with its props. Layers are tile sprites scrolled by tilePosition, so nothing is
 * ever created or destroyed while running.
 */
export class ParallaxCityManager {
  private readonly skyBack: Phaser.GameObjects.Image;
  private readonly skyFront: Phaser.GameObjects.Image;
  private readonly clouds: Phaser.GameObjects.TileSprite;
  private readonly skyline: Phaser.GameObjects.TileSprite;
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly street: Phaser.GameObjects.TileSprite;
  private readonly runway: Phaser.GameObjects.TileSprite;
  private readonly subway: Phaser.GameObjects.Image;
  private readonly cars: Car[] = [];
  private readonly props: Prop[] = [];

  private scroll = { clouds: 0, skyline: 0, mid: 0, street: 0, runway: 0 };
  private nextPropIn = 120;
  private subwayWait = 3;
  private cityIndex = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rng: SeededRNG,
  ) {
    const o = CAMERA.OVERSCAN;
    const w = GAME_W + o * 2;

    this.skyBack = scene.add.image(-o, -o, TEX.SKY + 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.SKY);
    this.skyFront = scene.add.image(-o, -o, TEX.SKY + 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.SKY).setAlpha(0);

    this.clouds = scene.add.tileSprite(-o, -24, w, 160, TEX.CLOUDS).setOrigin(0).setScrollFactor(FACTOR.CLOUDS).setDepth(DEPTH.CLOUDS);
    this.skyline = scene.add.tileSprite(-o, 30, w, 280, TEX.SKYLINE + 0).setOrigin(0).setScrollFactor(FACTOR.SKYLINE).setDepth(DEPTH.SKYLINE);
    this.mid = scene.add.tileSprite(-o, GAME_H - 240, w, 240, TEX.MID).setOrigin(0).setScrollFactor(FACTOR.MID).setDepth(DEPTH.MID);
    this.street = scene.add.tileSprite(-o, RUNWAY.TOP, w, RUNWAY.TILE_H, TEX.STREET).setOrigin(0).setScrollFactor(FACTOR.STREET).setDepth(DEPTH.STREET);
    this.runway = scene.add.tileSprite(-o, RUNWAY.TOP, w, RUNWAY.TILE_H, TEX.RUNWAY).setOrigin(0).setDepth(DEPTH.RUNWAY);

    this.subway = scene.add
      .image(GAME_W + 300, RUNWAY.TOP + 8, TEX.SUBWAY)
      .setOrigin(0, 1)
      .setScrollFactor(FACTOR.STREET)
      .setDepth(DEPTH.TRAFFIC);

    const frames = ['cab', 'cab', 'sedan', 'cab', 'red'];
    frames.forEach((frame, i) => {
      const leftBound = i % 2 === 0;
      const sprite = scene.add
        .image(rng.range(0, GAME_W), RUNWAY.TOP + (leftBound ? 76 : 83), TEX.CAB, frame)
        .setOrigin(0.5, 1)
        .setScrollFactor(FACTOR.STREET)
        .setDepth(DEPTH.TRAFFIC + (leftBound ? 0 : 0.5))
        .setFlipX(!leftBound);
      this.cars.push({ sprite, drive: leftBound ? -rng.range(30, 80) : rng.range(70, 120) });
    });

    for (let i = 0; i < 9; i++) {
      const sprite = scene.add.image(-200, FLOOR_Y + 1, TEX.PROPS, 'ac').setOrigin(0.5, 1).setDepth(DEPTH.PROPS).setVisible(false);
      this.props.push({ sprite, kind: 'ac' });
    }
  }

  /** Swaps skyline and palette for a city. The sky cross-fades; tints snap. */
  setCity(levelIndex: number, instant = false): void {
    const index = levelIndex % CITIES.length;
    const city = CITIES[index]!;
    this.cityIndex = index;
    this.skyline.setTexture(TEX.SKYLINE + index);
    this.clouds.setTint(city.cloudTint);
    this.mid.setTint(city.midTint);
    this.street.setTint(city.nearTint);
    this.runway.setTint(city.nearTint);
    this.subway.setTint(city.nearTint);
    for (const car of this.cars) car.sprite.setTint(city.nearTint);
    for (const prop of this.props) prop.sprite.setTint(city.nearTint);

    this.scene.tweens.killTweensOf(this.skyFront);
    if (instant) {
      this.skyBack.setTexture(TEX.SKY + index);
      this.skyFront.setAlpha(0);
      return;
    }
    this.skyFront.setTexture(TEX.SKY + index).setAlpha(0);
    this.scene.tweens.add({
      targets: this.skyFront,
      alpha: 1,
      duration: 900,
      onComplete: () => {
        this.skyBack.setTexture(TEX.SKY + index);
        this.skyFront.setAlpha(0);
      },
    });
  }

  /** True when a rooftop vent sits under the given x (the truck launches off them). */
  ventNear(x: number): boolean {
    return this.props.some((p) => p.sprite.visible && p.kind === 'vent' && Math.abs(p.sprite.x - x) < 12);
  }

  update(dt: number, speed: number): void {
    const dx = speed * dt;
    this.scroll.clouds += (dx + 6 * dt) * FACTOR.CLOUDS;
    this.scroll.skyline += dx * FACTOR.SKYLINE;
    this.scroll.mid += dx * FACTOR.MID;
    this.scroll.street += dx * FACTOR.STREET;
    this.scroll.runway += dx;
    // Snap to whole screen pixels: finer than a world pixel, but never between texels.
    const snap = (v: number): number => Math.round(v * view.zoom) / view.zoom;
    this.clouds.tilePositionX = snap(this.scroll.clouds);
    this.skyline.tilePositionX = snap(this.scroll.skyline);
    this.mid.tilePositionX = snap(this.scroll.mid);
    this.street.tilePositionX = snap(this.scroll.street);
    this.runway.tilePositionX = snap(this.scroll.runway);

    this.updateTraffic(dt, dx * FACTOR.STREET);
    this.updateProps(dx);
  }

  private updateTraffic(dt: number, streetDx: number): void {
    for (const car of this.cars) {
      car.sprite.x += car.drive * dt - streetDx;
      if (car.sprite.x < -60) this.respawnCar(car, GAME_W + this.rng.range(40, 260));
      else if (car.sprite.x > GAME_W + 300) this.respawnCar(car, -this.rng.range(40, 60));
    }

    if (this.subwayWait > 0) {
      this.subwayWait -= dt;
      if (this.subwayWait <= 0) this.subway.x = GAME_W + 80;
    } else {
      this.subway.x -= streetDx + 170 * dt;
      if (this.subway.x < -260) this.subwayWait = this.rng.range(5, 11);
    }
  }

  private respawnCar(car: Car, x: number): void {
    const leftBound = car.drive < 0;
    car.sprite.x = x;
    car.sprite.setFrame(this.rng.pick(['cab', 'cab', 'cab', 'sedan', 'red']));
    car.drive = leftBound ? -this.rng.range(30, 80) : this.rng.range(70, 120);
  }

  private updateProps(dx: number): void {
    for (const prop of this.props) {
      if (!prop.sprite.visible) continue;
      prop.sprite.x -= dx;
      if (prop.sprite.x < -60) prop.sprite.setVisible(false);
    }
    this.nextPropIn -= dx;
    if (this.nextPropIn > 0) return;

    const spawnX = GAME_W + 60;
    const def = this.rng.weighted(PROP_KINDS);
    const frame = this.scene.textures.getFrame(TEX.PROPS, def.kind);
    const half = (frame?.width ?? 30) / 2 + 6;
    // Only place props on solid rooftop, never floating over an alley gap.
    const tileX = Phaser.Math.Wrap(this.scroll.runway + spawnX, 0, RUNWAY.TILE_W);
    const onRoof = RUNWAY.ROOFS.some(([a, b]) => tileX - half >= a && tileX + half <= b);
    const free = this.props.find((p) => !p.sprite.visible);
    if (!onRoof || !free) {
      this.nextPropIn = 36;
      return;
    }
    free.kind = def.kind;
    free.sprite
      .setFrame(def.kind)
      .setPosition(spawnX, FLOOR_Y + 1)
      .setTint(CITIES[this.cityIndex]!.nearTint)
      .setVisible(true);
    this.nextPropIn = this.rng.range(90, 230);
  }
}
