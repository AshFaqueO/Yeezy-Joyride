import Phaser from 'phaser';
import { DEPTH } from '../config/constants';

export type RigPose = 'run' | 'fly' | 'glide' | 'crash';

/** One piece of character art and where its joints are, in 0..1 image fractions. */
export interface PoseDef {
  /** Texture key (see BootScene) for this pose's high-resolution image. */
  key: string;
  /** Height in world pixels when drawn. */
  height: number;
  /** Row where the image is cut into torso (above) and legs (below). 0 = do not split. */
  split: number;
  /** Hip joint x, the pivot the legs swing around. */
  hipX: number;
  /** Jetpack nozzle, where the exhaust particles start. */
  nozzleX: number;
  nozzleY: number;
  /** Where the hitbox centre sits across the image (the jetpack hangs off one side). */
  bodyX: number;
}

export interface RigDef {
  poses: Partial<Record<RigPose, PoseDef>> & { fly: PoseDef };
}

/** Kanye: one flying pose cut from the reference art. */
const YE_FLY: PoseDef = { key: 'char_ye_fly', height: 41, split: 0.655, hipX: 0.62, nozzleX: 0.11, nozzleY: 0.57, bodyX: 0.6 };

export const RIGS: Record<string, RigDef> = {
  ye: { poses: { fly: YE_FLY } },
  slim: {
    poses: {
      run: { key: 'char_slim_run', height: 40, split: 0.71, hipX: 0.52, nozzleX: 0.19, nozzleY: 0.7, bodyX: 0.56 },
      fly: { key: 'char_slim_fly', height: 46, split: 0.625, hipX: 0.43, nozzleX: 0.11, nozzleY: 0.54, bodyX: 0.45 },
      glide: { key: 'char_slim_glide', height: 42, split: 0.69, hipX: 0.47, nozzleX: 0.06, nozzleY: 0.52, bodyX: 0.52 },
      crash: { key: 'char_slim_crash', height: 28, split: 0, hipX: 0.5, nozzleX: 0.1, nozzleY: 0.5, bodyX: 0.5 },
    },
  },
};

/** Rows of leg art kept above the cut so a swinging leg never opens a gap at the waist. */
const OVERLAP = 0.07;

const RUN_STRIDE_HZ = 3.1;
const RUN_SWING = 0.34;
const AIR_SWING = 0.42;
const SPRING = 130;
const DAMPING = 13;

/** Registers the torso/legs frames on each pose texture. Call once after loading. */
export function prepareRigTextures(scene: Phaser.Scene): void {
  for (const rig of Object.values(RIGS)) {
    for (const pose of Object.values(rig.poses)) {
      const texture = scene.textures.get(pose.key);
      if (!texture || texture.key === '__MISSING' || texture.has('torso')) continue;
      // Smooth sampling for the illustrated art; everything else in the game stays nearest-neighbour.
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      const img = texture.getSourceImage() as HTMLImageElement;
      const w = img.width;
      const h = img.height;
      if (pose.split > 0) {
        const cut = Math.round(h * pose.split);
        const top = Math.round(h * (pose.split - OVERLAP));
        texture.add('torso', 0, 0, 0, w, cut);
        texture.add('legs', 0, 0, top, w, h - top);
      } else {
        texture.add('torso', 0, 0, 0, w, h);
      }
    }
  }
}

/**
 * Paper-doll character: a torso image with the legs as a second piece hinged at
 * the hip. The legs are driven by a damped spring, so they stride on the roof,
 * trail behind on the way up, and kick forward when falling, with natural lag.
 */
export class CharacterRig {
  readonly root: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly legs: Phaser.GameObjects.Image;
  private pose: RigPose = 'fly';
  private def: PoseDef;
  private legAngle = 0;
  private legVel = 0;
  private tilt = 0;
  private stride = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly rig: RigDef,
    depth: number = DEPTH.PLAYER,
  ) {
    this.def = rig.poses.fly;
    this.legs = scene.add.image(0, 0, this.def.key, 'legs');
    this.torso = scene.add.image(0, 0, this.def.key, 'torso');
    this.root = scene.add.container(0, 0, [this.legs, this.torso]).setDepth(depth);
    this.applyPose();
  }

  /** Nozzle position in world space, for the exhaust emitters. */
  nozzle(out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const { w, h } = this.size();
    const lx = (this.def.nozzleX - this.def.bodyX) * w * this.root.scaleX;
    const ly = (this.def.nozzleY - 1) * h * this.root.scaleY;
    const cos = Math.cos(this.root.rotation);
    const sin = Math.sin(this.root.rotation);
    return out.set(this.root.x + lx * cos - ly * sin, this.root.y + lx * sin + ly * cos);
  }

  has(pose: RigPose): boolean {
    return this.rig.poses[pose] !== undefined;
  }

  setPose(pose: RigPose): void {
    const next = this.rig.poses[pose] ? pose : 'fly';
    if (next === this.pose) return;
    this.pose = next;
    this.def = this.rig.poses[next]!;
    this.applyPose();
  }

  private size(): { w: number; h: number } {
    const src = this.torso.texture.getSourceImage() as HTMLImageElement;
    const s = this.def.height / src.height;
    return { w: src.width * s, h: this.def.height };
  }

  /** Lays the two pieces out so the feet rest on the root's origin. */
  private applyPose(): void {
    const d = this.def;
    this.torso.setTexture(d.key, 'torso');
    const src = this.torso.texture.getSourceImage() as HTMLImageElement;
    const s = d.height / src.height;
    const w = src.width * s;
    const left = -d.bodyX * w;
    const top = -d.height;
    this.torso.setOrigin(0, 0).setScale(s).setPosition(left, top);
    if (d.split > 0) {
      const hipY = top + d.height * d.split;
      const legFrameH = src.height * (1 - d.split + OVERLAP);
      this.legs
        .setTexture(d.key, 'legs')
        .setVisible(true)
        .setScale(s)
        // Pivot at the hip: hipX across, and OVERLAP rows down from the top of the leg piece.
        .setOrigin(d.hipX, (src.height * OVERLAP) / legFrameH)
        .setPosition(left + d.hipX * w, hipY);
    } else {
      this.legs.setVisible(false);
    }
  }

  /**
   * @param grounded feet on the roof (legs stride) vs airborne (legs trail by velocity)
   * @param vy vertical speed in px/s, positive is falling
   */
  update(dt: number, x: number, y: number, grounded: boolean, vy: number, running: boolean): void {
    let target = 0;
    let bob = 0;
    if (grounded && running) {
      this.stride += dt * RUN_STRIDE_HZ * Math.PI * 2;
      target = Math.sin(this.stride) * RUN_SWING;
      bob = Math.abs(Math.cos(this.stride)) * 1.4;
    } else if (!grounded) {
      // Falling swings the feet forward and up; climbing lets them hang back.
      target = Phaser.Math.Clamp(-vy / 260, -1, 1) * AIR_SWING;
    }
    // Damped spring: the legs chase the target with a little overshoot and settle.
    this.legVel += (SPRING * (target - this.legAngle) - DAMPING * this.legVel) * dt;
    this.legAngle += this.legVel * dt;
    this.legs.setRotation(this.legAngle);

    const wantTilt = grounded ? 0 : Phaser.Math.Clamp(vy / 260, -1, 1) * 0.16;
    this.tilt += (wantTilt - this.tilt) * (1 - Math.exp(-9 * dt));
    this.root.setPosition(x, y - bob);
  }

  /** Lean of the whole body from vertical speed; callers may add their own spin on top. */
  get lean(): number {
    return this.tilt;
  }

  /** Stops the stride and lets the legs settle (menus, previews). */
  rest(): void {
    this.legAngle = 0;
    this.legVel = 0;
    this.legs.setRotation(0);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
