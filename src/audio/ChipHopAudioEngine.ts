/**
 * Procedural Web Audio synthesizer. No samples are loaded: the chip-hop loop and
 * every sound effect are built from oscillators and filtered noise.
 *
 * Signal graph (all levels authored in dB):
 *
 *   music voices -> Music bus -> MusicDuck -+
 *   sfx voices   -> SFX bus ---------------+-> Master -> limiter -> speakers
 *
 * Ducking rides a dedicated MusicDuck gain, so it never overwrites the Music level.
 */

export type BusName = 'master' | 'music' | 'sfx';

export type SfxName =
  | 'record'
  | 'beep'
  | 'launch'
  | 'zap'
  | 'shutter'
  | 'fanfare'
  | 'explode'
  | 'hit'
  | 'land'
  | 'ignite'
  | 'crate'
  | 'smash'
  | 'select'
  | 'confirm'
  | 'deny'
  | 'buy'
  | 'levelup'
  | 'ring'
  | 'sneaker'
  | 'jump'
  | 'charge'
  | 'break';

/** Maps "../assets/music/theme.mp3" style glob keys to { theme: url }. */
function byBaseName(found: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(found)) {
    out[path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'))] = url;
  }
  return out;
}

/**
 * Optional soundtrack files in src/assets/music/. "theme" is the default; a
 * character can name its own (for example "slim"). With no file for a name the
 * synthesized chip-hop loop plays. Resolved at build time, so nothing 404s.
 */
const TRACK_URLS = byBaseName(
  import.meta.glob<string>('../assets/music/*.{mp3,ogg,m4a,wav}', { eager: true, query: '?url', import: 'default' }),
);
/**
 * Optional sound-effect files in src/assets/sfx/. A file named after an effect
 * (record.wav, zap.wav ...) replaces the synthesized version; "thruster" is the
 * looping jetpack burn. Anything without a file stays synthesized.
 */
const SAMPLE_URLS = byBaseName(
  import.meta.glob<string>('../assets/sfx/*.{wav,mp3,ogg}', { eager: true, query: '?url', import: 'default' }),
);
const DEFAULT_TRACK = 'theme';
/** Mastered songs are far louder than the synth voices; trim them to sit under the SFX. */
const TRACK_TRIM_DB = -14;
const THRUSTER_SYNTH_LEVEL = 0.2;
const THRUSTER_SAMPLE_LEVEL = 0.6;

const dbToGain = (db: number): number => Math.pow(10, db / 20);
const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const BPM = 88;
const STEP = 60 / BPM / 4;
const LOOKAHEAD_S = 0.14;
const TICK_MS = 25;

/** i - VI - III - VII in F minor; five voiced tones per bar plus an 808 root. */
const BARS = [
  { bass: 41, tones: [53, 56, 60, 63, 67] },
  { bass: 37, tones: [49, 53, 56, 60, 63] },
  { bass: 44, tones: [56, 60, 63, 67, 70] },
  { bass: 39, tones: [51, 55, 58, 62, 65] },
] as const;

const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
const KICK_FILL = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const STAB = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0];
/** Chord-tone index per 16th for the lead; -1 rests. Two phrases alternate. */
const LEAD_A = [4, -1, 3, -1, 2, -1, 3, 4, -1, 2, -1, 1, 2, -1, -1, -1];
const LEAD_B = [2, -1, 3, 4, -1, 4, -1, 3, 2, -1, 1, -1, 2, 3, 4, -1];
/** F minor pentatonic for the "pitch-corrected" Auto-Tune pack blips. */
const PENTATONIC = [65, 68, 70, 72, 75, 77, 80];

export class ChipHopAudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private musicDuck!: GainNode;
  private sfx!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private thrusterGain: GainNode | null = null;
  private thrusterSynth: GainNode | null = null;
  private thrusterLevel = THRUSTER_SYNTH_LEVEL;
  private readonly tracks = new Map<string, AudioBuffer>();
  private readonly tracksLoading = new Set<string>();
  private readonly samples = new Map<string, AudioBuffer>();
  private trackName = DEFAULT_TRACK;
  private trackSource: AudioBufferSourceNode | null = null;

  private readonly busDb: Record<BusName, number> = { master: -3, music: -12, sfx: -6 };
  private muted = false;
  private wantMusic = false;
  private intensity = 1;
  private timer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
  private loopCount = 0;
  private thrusting = false;

  get isMuted(): boolean {
    return this.muted;
  }

  /** Creates the graph. Safe to call before a user gesture; the context stays suspended. */
  init(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) return;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = muted ? 0 : dbToGain(this.busDb.master);
    this.master.connect(limiter);

    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = dbToGain(this.busDb.music);
    this.music.connect(this.musicDuck);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = dbToGain(this.busDb.sfx);
    this.sfx.connect(this.master);

    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    this.buildThruster(ctx);
    this.ensureTrack(this.trackName);
    for (const [name, url] of Object.entries(SAMPLE_URLS)) void this.loadSample(ctx, name, url);
  }

  /**
   * Chooses which soundtrack plays (per character). Unknown names fall back to the
   * default track, and to the synthesized loop when there is no file at all.
   */
  setTrack(name: string): void {
    const next = TRACK_URLS[name] ? name : DEFAULT_TRACK;
    if (next === this.trackName) return;
    this.trackName = next;
    this.ensureTrack(next);
    if (this.trackSource || this.timer !== null) this.restartMusic();
  }

  /** Fetches and decodes a soundtrack once; switches to it if it is still the one wanted. */
  private ensureTrack(name: string): void {
    const ctx = this.ctx;
    const url = TRACK_URLS[name];
    if (!ctx || !url || this.tracks.has(name) || this.tracksLoading.has(name)) return;
    this.tracksLoading.add(name);
    void fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('missing'))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        this.tracks.set(name, buffer);
        // The synth loop may have started while this was decoding: hand over to the file.
        if (this.trackName === name && (this.trackSource || this.timer !== null)) this.restartMusic();
      })
      .catch(() => {
        // Unreadable or unsupported file: the synthesized loop keeps playing.
      })
      .finally(() => this.tracksLoading.delete(name));
  }

  private async loadSample(ctx: AudioContext, name: string, url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      this.samples.set(name, await ctx.decodeAudioData(await response.arrayBuffer()));
      if (name === 'thruster') this.attachThrusterSample(ctx);
    } catch {
      // Bad file: that effect simply stays synthesized.
    }
  }

  private stopMusicSources(): void {
    if (this.trackSource) {
      this.trackSource.stop();
      this.trackSource.disconnect();
      this.trackSource = null;
    }
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private restartMusic(): void {
    this.stopMusicSources();
    if (this.wantMusic && this.ctx && this.ctx.state === 'running') this.startScheduler();
  }

  /** Call from a pointer or key handler: browsers only start audio after a gesture. */
  unlock(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (this.wantMusic) this.startScheduler();
      });
    } else if (this.wantMusic) {
      this.startScheduler();
    }
  }

  setBusDb(bus: BusName, db: number): void {
    this.busDb[bus] = db;
    if (!this.ctx) return;
    const node = bus === 'master' ? this.master : bus === 'music' ? this.music : this.sfx;
    if (bus === 'master' && this.muted) return;
    node.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.03);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : dbToGain(this.busDb.master), this.ctx.currentTime, 0.02);
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** 0 = sparse menu groove (drums + stabs), 1 = full gameplay arrangement. */
  setIntensity(value: number): void {
    this.intensity = value;
  }

  startMusic(): void {
    this.wantMusic = true;
    if (this.ctx && this.ctx.state === 'running') this.startScheduler();
  }

  stopMusic(): void {
    this.wantMusic = false;
    this.stopMusicSources();
  }

  /** Sidechain-style dip on the music so warnings and impacts cut through. */
  duck(db = -6, holdMs = 320): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(dbToGain(db), now, 0.012);
    g.setTargetAtTime(1, now + holdMs / 1000, 0.16);
  }

  /** Continuous jetpack roar, gated by whether thrust is held. */
  setThruster(on: boolean): void {
    if (on === this.thrusting) return;
    this.thrusting = on;
    if (!this.ctx || !this.thrusterGain) return;
    this.thrusterGain.gain.setTargetAtTime(on ? this.thrusterLevel : 0, this.ctx.currentTime, on ? 0.02 : 0.07);
  }

  /* ------------------------------------------------------------------ */
  /* Sound effects                                                       */
  /* ------------------------------------------------------------------ */

  play(name: SfxName, param = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const out = this.sfx;
    // +/-8% pitch spread keeps repeated effects from sounding like a machine gun.
    const v = 1 + (Math.random() * 2 - 1) * 0.08;

    // A supplied sound file wins over the synthesized version of the same effect.
    const sample = this.samples.get(name);
    if (sample) {
      const src = ctx.createBufferSource();
      src.buffer = sample;
      src.playbackRate.value = name === 'record' ? v * Math.pow(2, Math.min(param, 8) / 12) : v;
      const level = ctx.createGain();
      level.gain.value = 0.8;
      src.connect(level).connect(out);
      src.start(t);
      return;
    }

    switch (name) {
      case 'record': {
        const f = 988 * Math.pow(2, (Math.min(param, 8) * 2) / 12) * v;
        this.tone('triangle', f, f, t, 0.09, 0.22, out);
        this.tone('sine', f * 1.5, f * 1.5, t + 0.045, 0.14, 0.2, out);
        break;
      }
      case 'beep':
        this.tone('square', 1320 + param * 220, 1320 + param * 220, t, 0.07, 0.16, out);
        break;
      case 'launch':
        this.noise(t, 0.45, 0.35, 'bandpass', 500 * v, 2600 * v, 1.2, out);
        this.tone('sawtooth', 520 * v, 180 * v, t, 0.4, 0.12, out);
        break;
      case 'zap':
        this.tone('sawtooth', 96 * v, 70 * v, t, 0.36, 0.26, out);
        this.tone('square', 1900 * v, 240 * v, t, 0.22, 0.1, out);
        this.noise(t, 0.3, 0.3, 'highpass', 3200, 5200, 0.8, out);
        break;
      case 'shutter':
        this.noise(t, 0.035, 0.5, 'highpass', 2800 * v, 2800 * v, 0.7, out);
        this.noise(t + 0.07, 0.05, 0.45, 'highpass', 2200 * v, 2200 * v, 0.7, out);
        this.tone('square', 2600 * v, 2600 * v, t, 0.02, 0.08, out);
        break;
      case 'fanfare':
        [72, 76, 79, 84].forEach((m, i) => this.tone('square', midiToHz(m), midiToHz(m), t + i * 0.075, 0.11, 0.17, out));
        [72, 79, 84, 88].forEach((m) => this.tone('triangle', midiToHz(m), midiToHz(m), t + 0.3, 0.42, 0.14, out));
        break;
      case 'explode':
        this.noise(t, 0.5, 0.75, 'lowpass', 1500 * v, 90, 0.6, out);
        this.tone('sine', 150 * v, 42, t, 0.4, 0.6, out);
        break;
      case 'hit':
        this.noise(t, 0.6, 0.85, 'lowpass', 2200, 80, 0.6, out);
        this.tone('sawtooth', 460, 55, t, 0.65, 0.3, out);
        this.tone('sine', 170, 40, t, 0.5, 0.6, out);
        break;
      case 'land':
        this.tone('sine', 150 * v, 58 * v, t, 0.09, 0.45, out);
        this.noise(t, 0.05, 0.16, 'lowpass', 900, 300, 0.7, out);
        break;
      case 'ignite':
        this.noise(t, 0.09, 0.3, 'bandpass', 700 * v, 1500 * v, 0.9, out);
        break;
      case 'crate':
        this.tone('triangle', 420, 1700, t, 0.22, 0.24, out);
        this.tone('square', 840, 3400, t + 0.03, 0.2, 0.07, out);
        break;
      case 'smash':
        this.noise(t, 0.26, 0.6, 'bandpass', 1900 * v, 500, 0.8, out);
        this.tone('square', 260 * v, 80 * v, t, 0.2, 0.2, out);
        break;
      case 'select':
        this.tone('square', 660, 660, t, 0.045, 0.13, out);
        break;
      case 'confirm':
        this.tone('square', 660, 660, t, 0.06, 0.15, out);
        this.tone('square', 990, 990, t + 0.06, 0.1, 0.15, out);
        break;
      case 'deny':
        this.tone('sawtooth', 170, 120, t, 0.18, 0.22, out);
        break;
      case 'buy':
        [77, 80, 84, 89, 92].forEach((m, i) => this.tone('triangle', midiToHz(m), midiToHz(m), t + i * 0.055, 0.16, 0.2, out));
        break;
      case 'levelup':
        [65, 68, 72, 75, 77, 80].forEach((m, i) => this.tone('square', midiToHz(m), midiToHz(m), t + i * 0.06, 0.1, 0.14, out));
        this.tone('triangle', midiToHz(89), midiToHz(89), t + 0.36, 0.4, 0.2, out);
        break;
      case 'ring': {
        // Two scale notes snapped with no glide: the hard-tuned vocal jump.
        const i = Math.floor(Math.random() * (PENTATONIC.length - 1));
        const a = midiToHz(PENTATONIC[i]!);
        const b = midiToHz(PENTATONIC[i + 1]!);
        this.tone('sawtooth', a, a, t, 0.05, 0.1, out, 900);
        this.tone('sawtooth', b, b, t + 0.05, 0.08, 0.1, out, 1400);
        break;
      }
      case 'sneaker':
        this.tone('triangle', 330 * v, 150 * v, t, 0.07, 0.3, out);
        this.noise(t, 0.03, 0.2, 'highpass', 4000, 4000, 0.7, out);
        break;
      case 'jump':
        this.tone('square', 240 * v, 620 * v, t, 0.14, 0.14, out);
        break;
      case 'charge':
        this.tone('sawtooth', 110, 110 + param * 330, t, 0.1, 0.1, out, 1200);
        break;
      case 'break':
        this.noise(t, 0.35, 0.6, 'lowpass', 1800, 150, 0.6, out);
        [79, 75, 72, 67].forEach((m, i) => this.tone('square', midiToHz(m), midiToHz(m), t + i * 0.06, 0.09, 0.13, out));
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Voice primitives                                                    */
  /* ------------------------------------------------------------------ */

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    gain: number,
    dest: AudioNode,
    lowpassHz = 0,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (lowpassHz > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpassHz;
      osc.connect(lp).connect(env);
    } else {
      osc.connect(env);
    }
    env.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private noise(
    t: number,
    dur: number,
    gain: number,
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    dest: AudioNode,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(Math.max(30, f0), t);
    if (f1 !== f0) biquad.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biquad).connect(env).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  private buildThruster(ctx: AudioContext): void {
    const gate = ctx.createGain();
    gate.gain.value = 0;
    gate.connect(this.sfx);
    this.thrusterGain = gate;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.6;
    // A slow wobble on the filter makes the burn flutter instead of hiss.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 160;
    lfo.connect(lfoDepth).connect(band.frequency);
    const synth = ctx.createGain();
    synth.connect(gate);
    this.thrusterSynth = synth;
    src.connect(band).connect(synth);

    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 58;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.35;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 220;
    rumble.connect(rumbleLp).connect(rumbleGain).connect(synth);

    src.start();
    lfo.start();
    rumble.start();
  }

  /** Swaps the synthesized burn for the supplied jetpack loop, behind the same gate. */
  private attachThrusterSample(ctx: AudioContext): void {
    const buffer = this.samples.get('thruster');
    if (!buffer || !this.thrusterGain) return;
    this.thrusterSynth?.gain.setValueAtTime(0, ctx.currentTime);
    const loop = ctx.createBufferSource();
    loop.buffer = buffer;
    loop.loop = true;
    loop.connect(this.thrusterGain);
    loop.start();
    this.thrusterLevel = THRUSTER_SAMPLE_LEVEL;
    if (this.thrusting) this.thrusterGain.gain.setTargetAtTime(this.thrusterLevel, ctx.currentTime, 0.02);
  }

  /* ------------------------------------------------------------------ */
  /* Music: lookahead step sequencer                                     */
  /* ------------------------------------------------------------------ */

  private startScheduler(): void {
    const ctx = this.ctx;
    if (!ctx || this.timer !== null || this.trackSource) return;
    const track = this.tracks.get(this.trackName);
    if (track) {
      const trim = ctx.createGain();
      trim.gain.value = dbToGain(TRACK_TRIM_DB);
      trim.connect(this.music);
      const source = ctx.createBufferSource();
      source.buffer = track;
      source.loop = true;
      source.connect(trim);
      source.start();
      this.trackSource = source;
      return;
    }
    this.ensureTrack(this.trackName);
    this.nextStepTime = ctx.currentTime + 0.08;
    this.step = 0;
    this.bar = 0;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // After a background-tab stall, skip ahead rather than burst-play the backlog.
    if (this.nextStepTime < ctx.currentTime - 0.05) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(this.step, this.bar, this.nextStepTime);
      this.nextStepTime += STEP;
      this.step++;
      if (this.step === 16) {
        this.step = 0;
        this.bar = (this.bar + 1) % BARS.length;
        if (this.bar === 0) this.loopCount++;
      }
    }
  }

  private playStep(step: number, bar: number, t: number): void {
    const chord = BARS[bar]!;
    const full = this.intensity >= 1;
    const out = this.music;

    const kick = bar === 3 ? KICK_FILL : KICK;
    if (kick[step]) this.kick808(t, midiToHz(chord.bass));
    if (SNARE[step]) this.snare(t);

    // Hats: straight 8ths, a ghost 16th, and 32nd rolls closing every other bar.
    const rollBar = bar % 2 === 1;
    if (step % 2 === 0) this.hat(t, step % 4 === 2 ? 0.2 : 0.13, step === 6);
    else if (full && step % 4 === 3) this.hat(t, 0.06, false);
    if (full && rollBar && step >= 13) {
      this.hat(t, 0.1, false);
      this.hat(t + STEP / 2, 0.14, false);
    }

    if (STAB[step]) {
      for (const m of chord.tones.slice(0, 4)) {
        this.tone('square', midiToHz(m), midiToHz(m), t, 0.26, 0.04, out, 1500);
      }
    }

    if (full) {
      const phrase = this.loopCount % 2 === 0 ? LEAD_A : LEAD_B;
      const idx = phrase[step]!;
      if (idx >= 0) this.lead(t, midiToHz(chord.tones[idx]! + 12), STEP * 1.7);
    }
  }

  private kick808(t: number, hz: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz * 2.6, t);
    osc.frequency.exponentialRampToValueAtTime(hz, t + 0.055);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
    osc.connect(env).connect(this.music);
    osc.start(t);
    osc.stop(t + 0.48);
    // An octave harmonic so the bassline survives phone and laptop speakers.
    this.tone('triangle', hz * 2, hz * 2, t, 0.3, 0.22, this.music);
    this.noise(t, 0.012, 0.25, 'highpass', 1800, 1800, 0.7, this.music);
  }

  private snare(t: number): void {
    this.noise(t, 0.14, 0.5, 'bandpass', 1900, 1500, 0.9, this.music);
    this.tone('triangle', 210, 130, t, 0.08, 0.3, this.music);
  }

  private hat(t: number, gain: number, open: boolean): void {
    this.noise(t, open ? 0.13 : 0.035, gain, 'highpass', 7200, 7200, 0.7, this.music);
  }

  /** Pitched-up soul-sample stand-in: triangle + quiet square with vibrato. */
  private lead(t: number, hz: number, dur: number): void {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(this.music);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.6;
    const depth = ctx.createGain();
    depth.gain.value = hz * 0.006;
    vibrato.connect(depth);

    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = hz;
    const sq = ctx.createOscillator();
    sq.type = 'square';
    sq.frequency.value = hz * 1.003;
    const sqGain = ctx.createGain();
    sqGain.gain.value = 0.22;
    depth.connect(tri.frequency);
    depth.connect(sq.frequency);
    tri.connect(env);
    sq.connect(sqGain).connect(env);

    for (const node of [vibrato, tri, sq]) {
      node.start(t);
      node.stop(t + dur + 0.03);
    }
  }
}

/** One engine for the whole game; BootScene initializes it. */
export const audio = new ChipHopAudioEngine();
