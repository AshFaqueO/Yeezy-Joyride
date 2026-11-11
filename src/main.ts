import Phaser from 'phaser';
import { audio } from './audio/ChipHopAudioEngine';
import { getProfile, saveProfile } from './config/eras';
import { fitCamera, measureView, view } from './config/view';
import { EventBus } from './events/EventBus';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { LockerScene } from './scenes/LockerScene';
import { TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';

function stageSpace(): { w: number; h: number } {
  const stage = document.getElementById('stage');
  if (!stage) return { w: window.innerWidth, h: window.innerHeight };
  const style = window.getComputedStyle(stage);
  return {
    w: stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    h: stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
  };
}

// Size the canvas for this display before Phaser boots.
{
  const { w, h } = stageSpace();
  measureView(w, h);
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0b12',
  // Nearest-neighbour sampling for the baked pixel art; the character art opts into
  // linear filtering per texture. Sub-pixel positions are allowed so motion stays smooth.
  pixelArt: true,
  roundPixels: false,
  antialias: false,
  scale: {
    // Manual sizing: the canvas holds real device pixels and CSS shrinks it by 1/dpr.
    mode: Phaser.Scale.NONE,
    width: view.width,
    height: view.height,
    zoom: view.cssScale,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  input: { activePointers: 3 },
  // The first scene starts automatically; UIScene is launched in parallel by GameScene.
  scene: [BootScene, TitleScene, GameScene, UIScene, LockerScene],
};

const game = new Phaser.Game(config);

/** Nearest-neighbour CSS scaling only when it is 1:1; otherwise let the browser smooth it. */
function styleCanvas(): void {
  game.canvas.style.imageRendering = view.crisp ? 'pixelated' : 'auto';
}
styleCanvas();

/** Re-measures on window changes and re-aims every live camera. */
function fitStage(): void {
  const { w, h } = stageSpace();
  measureView(w, h);
  game.scale.setZoom(view.cssScale);
  game.scale.resize(view.width, view.height);
  for (const scene of game.scene.getScenes(false)) fitCamera(scene);
  styleCanvas();
}

window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', () => window.setTimeout(fitStage, 120));

// Browsers only allow audio after a gesture, so every early input tries to unlock it.
const unlock = (): void => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
window.addEventListener('touchend', unlock);

window.addEventListener('keydown', (ev) => {
  if (ev.code !== 'KeyM' || ev.repeat) return;
  const muted = audio.toggleMute();
  getProfile().muted = muted;
  saveProfile();
  EventBus.emit('mute', { muted });
});

document.addEventListener('contextmenu', (ev) => ev.preventDefault());

if (import.meta.env.DEV) {
  Object.assign(window, { __game: game, __audio: audio });
}
