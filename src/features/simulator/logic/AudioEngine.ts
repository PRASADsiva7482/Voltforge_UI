export class AudioEngine {
  private static audioContext: AudioContext | null = null;
  private static oscillator: OscillatorNode | null = null;
  private static gain: GainNode | null = null;

  private static getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }
      this.audioContext = new AudioContextCtor();
    }

    return this.audioContext;
  }

  static playTone(frequency: number): void {
    const context = this.getAudioContext();
    if (!context) return;

    this.stopTone();

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.05;

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();

    this.oscillator = oscillator;
    this.gain = gain;

    if (context.state === 'suspended') {
      void context.resume();
    }
  }

  static stopTone(): void {
    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }

    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
  }
}
