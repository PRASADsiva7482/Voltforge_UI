import type { CanvasNode } from './canvasTypes';

interface AudioOutput {
  playTone(frequency: number, waveform: 'square', volume: number): void;
  stopTone(): void;
  playClick(type: 'button' | 'switch' | 'relay'): void;
}

/** Audio belongs to the document lifecycle, not to culled visual components. */
export class CanvasAudioState {
  private previous = new Map<string, CanvasNode>();
  private simulating = false;
  constructor(private output: AudioOutput) {}
  update(nodes: CanvasNode[], simulating: boolean) {
    const next = new Map<string, CanvasNode>();
    for (const node of nodes) {
      next.set(node.id, node);
      const old = this.previous.get(node.id);
      if (old === node && simulating === this.simulating) continue;
      const p = node.properties, before = old?.properties;
      const beeping = Boolean(simulating && p?.isBeeping), wasBeeping = Boolean(this.simulating && before?.isBeeping);
      try {
        if (beeping && !wasBeeping) this.output.playTone(Number(p?.frequency) || 1000, 'square', .08);
        else if (!beeping && wasBeeping) this.output.stopTone();
        if (['PUSH_BUTTON', 'BUTTON'].includes(node.type) && p?.isPressed && !before?.isPressed) this.output.playClick('button');
        if (node.type === 'SWITCH_SPST' && old && Boolean(p?.isClosed) !== Boolean(before?.isClosed)) this.output.playClick('switch');
        if (['RELAY_SINGLE', 'RELAY_2CH', 'RELAY_4CH', 'RELAY_SPDT'].includes(node.type) && Boolean(p?.isActive) !== Boolean(before?.isActive)) this.output.playClick('relay');
      } catch { /* Sound is optional, including browsers without an audio device. */ }
    }
    for (const [id, old] of this.previous) if (!next.has(id) && this.simulating && old.properties?.isBeeping) this.output.stopTone();
    this.previous = next; this.simulating = simulating;
  }
  dispose() {
    if (this.simulating && [...this.previous.values()].some(node => node.properties?.isBeeping)) this.output.stopTone();
    this.previous.clear(); this.simulating = false;
  }
}
