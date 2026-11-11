import Phaser from 'phaser';
import type { VehicleId } from '../config/eras';

/** Every cross-scene event and the payload it carries. */
export interface GameEvents {
  score: { score: number; distance: number };
  records: { count: number };
  'level-up': { index: number; label: string };
  vehicle: { id: VehicleId | null; name: string };
  'game-over': { score: number; records: number; distance: number; best: number; newBest: boolean; seed: number };
  'run-start': { levelLabel: string };
  pause: { paused: boolean };
  mute: { muted: boolean };
  blind: { strength: number };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

/**
 * Typed wrapper over one shared emitter. Gameplay emits; the HUD scene listens.
 * Neither side holds a reference to the other.
 */
class TypedEventBus {
  private readonly emitter = new Phaser.Events.EventEmitter();

  on<K extends keyof GameEvents>(event: K, handler: Handler<K>, context?: unknown): this {
    this.emitter.on(event, handler, context);
    return this;
  }

  once<K extends keyof GameEvents>(event: K, handler: Handler<K>, context?: unknown): this {
    this.emitter.once(event, handler, context);
    return this;
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<K>, context?: unknown): this {
    this.emitter.off(event, handler, context);
    return this;
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): this {
    this.emitter.emit(event, payload);
    return this;
  }
}

export const EventBus = new TypedEventBus();
