// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Audio Engine (Web Audio API)
// Provides realistic sound effects for buzzer tones, button clicks,
// switch toggles, relay snaps, and servo sweeps.
// ═══════════════════════════════════════════════════════════════════════════

type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';

class AudioEngineImpl {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeOscillator: OscillatorNode | null = null;
  private activeOscGain: GainNode | null = null;
  private muted = false;

  /** Lazily initialize the AudioContext (must be called after user gesture). */
  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // Global volume
      this.masterGain.connect(this.ctx.destination);
    }
    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Set master volume (0.0 – 1.0). */
  setVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  /** Toggle mute. */
  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.3;
    }
  }

  // ── Continuous tone (for buzzer) ──────────────────────────────────────

  /**
   * Start a continuous tone at the given frequency.
   * If a tone is already playing, it smoothly transitions to the new frequency.
   */
  playTone(frequency: number, waveform: WaveformType = 'square', volume = 0.15) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    if (this.activeOscillator) {
      // Smoothly transition frequency
      this.activeOscillator.frequency.setTargetAtTime(frequency, ctx.currentTime, 0.02);
      if (this.activeOscGain) {
        this.activeOscGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
      }
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = waveform;
    osc.frequency.value = frequency;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.03); // Ramp up to avoid click

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();

    this.activeOscillator = osc;
    this.activeOscGain = gain;
  }

  /** Stop the continuous buzzer tone with a smooth fade-out. */
  stopTone() {
    if (!this.activeOscillator || !this.activeOscGain || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.activeOscGain.gain.setTargetAtTime(0, now, 0.03); // Fast fade-out

    const osc = this.activeOscillator;
    const gain = this.activeOscGain;

    this.activeOscillator = null;
    this.activeOscGain = null;

    // Stop after fade completes
    setTimeout(() => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Already stopped
      }
    }, 100);
  }

  // ── Short percussive sounds ──────────────────────────────────────────

  /**
   * Play a short mechanical click (button press, switch toggle, relay snap).
   * @param type — 'button' | 'switch' | 'relay'
   */
  playClick(type: 'button' | 'switch' | 'relay' = 'button') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    const now = ctx.currentTime;

    if (type === 'button') {
      // Short sharp click — noise burst + pitched thud
      this.playNoiseBurst(0.02, 0.12, now);
      this.playThud(800, 0.015, 0.08, now);
    } else if (type === 'switch') {
      // Snappier toggle click — two rapid thuds
      this.playNoiseBurst(0.015, 0.1, now);
      this.playThud(1200, 0.01, 0.06, now);
      this.playThud(600, 0.01, 0.04, now + 0.02);
    } else if (type === 'relay') {
      // Heavy electromagnetic snap — deep thud + metal ring
      this.playThud(300, 0.03, 0.15, now);
      this.playNoiseBurst(0.025, 0.08, now + 0.005);
      this.playThud(2000, 0.02, 0.04, now + 0.01);
    }
  }

  /** Play a short servo sweep sound. */
  playServoSweep() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.15);
    osc.frequency.linearRampToValueAtTime(80, now + 0.3);

    gain.gain.setValueAtTime(0.03, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private playNoiseBurst(duration: number, volume: number, startTime: number) {
    const ctx = this.ctx!;
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // Decay envelope
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    source.start(startTime);
  }

  private playThud(freq: number, duration: number, volume: number, startTime: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, startTime + duration);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  /** Dispose the audio context completely. */
  dispose() {
    this.stopTone();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
  }
}

/** Singleton audio engine instance. */
export const AudioEngine = new AudioEngineImpl();
