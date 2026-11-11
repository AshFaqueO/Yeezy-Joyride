import Phaser from 'phaser';
import { PixelTextureBaker } from '../assets/PixelTextureBaker';
import { audio } from '../audio/ChipHopAudioEngine';
import { SCENES, TEX } from '../config/constants';
import { ERAS, eraById, getProfile } from '../config/eras';
import { prepareRigTextures } from '../entities/CharacterRig';

const CHARACTER_ART = import.meta.glob<string>('../assets/img/chars/*.png', { eager: true, query: '?url', import: 'default' });

/** Bakes every texture, registers animations, and prepares the audio graph. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  preload(): void {
    // High-resolution character art. Vite hashes each file and keeps the URLs relative.
    for (const [path, url] of Object.entries(CHARACTER_ART)) {
      const name = path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));
      this.load.image(`char_${name}`, url);
    }
  }

  create(): void {
    prepareRigTextures(this);
    new PixelTextureBaker(this).bakeAll();
    this.createAnimations();
    const profile = getProfile();
    audio.init(profile.muted);
    audio.setTrack(eraById(profile.era).music);
    this.scene.start(SCENES.TITLE);
  }

  private createAnimations(): void {
    const loop = (key: string, texture: string, start: number, end: number, frameRate: number): void => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start, end }),
        frameRate,
        repeat: -1,
      });
    };
    for (const era of ERAS) loop(`${TEX.YE}${era.id}-run`, TEX.YE + era.id, 0, 3, 12);
    for (let i = 0; i < 3; i++) loop(`pap${i}-run`, TEX.PAP + i, 0, 1, 9);
    loop('record-spin', TEX.RECORD, 0, 5, 12);
    loop('vinyl-spin', TEX.VINYL, 0, 5, 8);
    loop('crate-shine', TEX.CRATE, 0, 3, 9);
    loop('drone-fly', TEX.DRONE, 0, 1, 22);
    loop('mech-walk', TEX.MECH, 0, 1, 6);
    loop('truck-roll', TEX.TRUCK, 0, 1, 16);
  }
}
