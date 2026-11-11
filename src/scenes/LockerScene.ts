import Phaser from 'phaser';
import { audio } from '../audio/ChipHopAudioEngine';
import { GAME_H, GAME_W, PAL, SCENES, TEX } from '../config/constants';
import { ERAS, JETPACKS, equipEra, equipJetpack, eraById, getProfile, type EraDef, type JetpackDef } from '../config/eras';
import { fitCamera } from '../config/view';
import { RIGS } from '../entities/CharacterRig';
import { MenuNav, PixelButton, SAFE, pixelText, type Focusable } from './UIScene';

const CARD_W = 116;
const CARD_H = 96;
const GAP = 8;
const EQUIPPED_TINT = 0x8fe6a4;
const PREVIEW_H = 56;

interface CardSpec {
  title: string;
  blurb: string;
  equipped: () => boolean;
  equip: () => void;
  buildPreview: (card: LockerCard) => void;
}

/** One selectable item: preview art, name, and whether it is the one equipped. */
class LockerCard extends Phaser.GameObjects.Container implements Focusable {
  onHover?: () => void;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly status: Phaser.GameObjects.BitmapText;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly spec: CardSpec,
    private readonly onActivate: (card: LockerCard) => void,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    const title = pixelText(scene, 0, -CARD_H / 2 + 5, spec.title).setOrigin(0.5, 0);
    this.status = pixelText(scene, 0, CARD_H / 2 - 13, '').setOrigin(0.5, 0);
    this.add([this.bg, title, this.status]);
    spec.buildPreview(this);
    this.setSize(CARD_W, CARD_H);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.POINTER_OVER, () => this.onHover?.());
    this.on(Phaser.Input.Events.POINTER_DOWN, () => this.activate());
    scene.add.existing(this);
    this.refresh();
  }

  setFocus(on: boolean): void {
    this.focused = on;
    this.refresh();
  }

  activate(): void {
    this.onActivate(this);
  }

  refresh(): void {
    const g = this.bg;
    const w = CARD_W;
    const h = CARD_H;
    const equipped = this.spec.equipped();
    g.clear();
    g.fillStyle(PAL.INK, 1).fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
    g.fillStyle(this.focused ? PAL.GOLD : equipped ? EQUIPPED_TINT : PAL.SLATE, 1).fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
    g.fillStyle(this.focused ? 0x26304c : 0x161b2c, 1).fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    g.fillStyle(PAL.INK, 0.45).fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 16);
    g.fillStyle(PAL.ASPHALT, 1).fillRect(-30, 33, 60, 2);
    this.status.setText(equipped ? 'EQUIPPED' : 'SELECT').setTint(equipped ? EQUIPPED_TINT : PAL.SILVER);
  }
}

/** Era Locker: pick a character and a jetpack. Everything is unlocked from the start. */
export class LockerScene extends Phaser.Scene {
  private cards: LockerCard[] = [];
  private nav: MenuNav | null = null;
  private blurbText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super(SCENES.LOCKER);
  }

  init(): void {
    this.cards = [];
    this.nav = null;
  }

  create(): void {
    fitCamera(this);
    this.cameras.main.setScroll(0, 0);
    this.add.image(-32, -32, TEX.SKY + 2).setOrigin(0);
    this.add.tileSprite(0, 80, GAME_W, 280, TEX.SKYLINE + 2).setOrigin(0).setAlpha(0.55);
    this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.INK, 0.45).setOrigin(0);

    pixelText(this, 14, SAFE + 4, 'ERA LOCKER', 2, PAL.GOLD);
    const total = pixelText(this, GAME_W - 14, SAFE + 9, `x${getProfile().records}`, 1, PAL.HUD_YELLOW).setOrigin(1, 0);
    this.add.sprite(GAME_W - 14 - total.width - 9, SAFE + 13, TEX.VINYL, 0).play('vinyl-spin');

    pixelText(this, 14, 36, 'CHARACTERS', 1, PAL.SILVER);
    const packsX = (GAME_W - (JETPACKS.length * CARD_W + (JETPACKS.length - 1) * GAP)) / 2;
    pixelText(this, packsX, 150, 'JETPACKS', 1, PAL.SILVER);

    const erasX = (GAME_W - (ERAS.length * CARD_W + (ERAS.length - 1) * GAP)) / 2;
    ERAS.forEach((era, i) => {
      const x = erasX + CARD_W / 2 + i * (CARD_W + GAP);
      this.cards.push(new LockerCard(this, x, 96, this.eraSpec(era), (c) => this.choose(c)));
    });
    JETPACKS.forEach((pack, i) => {
      const x = packsX + CARD_W / 2 + i * (CARD_W + GAP);
      this.cards.push(new LockerCard(this, x, 210, this.packSpec(pack), (c) => this.choose(c)));
    });

    this.blurbText = pixelText(this, GAME_W / 2, 272, '', 1, PAL.WHITE).setOrigin(0.5);
    pixelText(this, GAME_W / 2, 288, 'ARROWS: BROWSE   ENTER: EQUIP   ESC: BACK', 1, PAL.SLATE).setOrigin(0.5);
    const back = new PixelButton(this, GAME_W / 2 - 80, 324, 140, 22, 'BACK', () => this.leave(SCENES.TITLE));
    const play = new PixelButton(this, GAME_W / 2 + 80, 324, 140, 22, 'PLAY', () => this.leave(SCENES.GAME));

    const start = Math.max(
      0,
      this.cards.findIndex((c) => c.spec.equipped()),
    );
    const items: Focusable[] = [...this.cards, back, play];
    this.nav = new MenuNav(this, items, start, () => this.leave(SCENES.TITLE));

    audio.setIntensity(0);
    audio.startMusic();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nav?.destroy();
      this.nav = null;
    });
  }

  private eraSpec(era: EraDef): CardSpec {
    return {
      title: era.name,
      blurb: era.blurb,
      equipped: () => getProfile().era === era.id,
      equip: () => {
        equipEra(era.id);
        // Each character brings their own soundtrack.
        audio.setTrack(era.music);
      },
      buildPreview: (card) => {
        const rig = era.rig ? RIGS[era.rig] : undefined;
        if (rig) {
          // Illustrated characters: show the standing pose at full detail.
          const pose = rig.poses.run ?? rig.poses.fly;
          const art = this.add.image(0, 5, pose.key);
          art.setScale(PREVIEW_H / art.height);
          card.add(art);
        } else {
          const sprite = this.add.sprite(0, 6, TEX.YE + era.id, 0).setScale(2).play(`${TEX.YE}${era.id}-run`);
          card.add(sprite);
        }
      },
    };
  }

  private packSpec(pack: JetpackDef): CardSpec {
    return {
      title: pack.name,
      blurb: pack.blurb,
      equipped: () => getProfile().jetpack === pack.id,
      equip: () => equipJetpack(pack.id),
      buildPreview: (card) => {
        card.add(this.add.image(0, 6, TEX.PACK + pack.id, 0).setScale(3));
      },
    };
  }

  override update(): void {
    // The blurb follows focus; cheap enough to resolve per frame for a handful of items.
    const current = this.nav?.current;
    let text = current instanceof LockerCard ? current.spec.blurb : '';
    const isPack = current instanceof LockerCard && this.cards.indexOf(current) >= ERAS.length;
    if (isPack && eraById(getProfile().era).rig) text = `${text} - PACK ART STAYS AS DRAWN`;
    if (this.blurbText.text !== text) this.blurbText.setText(text);
  }

  private choose(card: LockerCard): void {
    card.spec.equip();
    audio.play('confirm');
    this.tweens.add({ targets: card, scale: 1.06, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    for (const c of this.cards) c.refresh();
  }

  private leave(target: string): void {
    audio.play('confirm');
    this.scene.start(target);
  }
}
