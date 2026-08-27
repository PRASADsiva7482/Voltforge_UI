import type { LogicCaptureFrame } from '../features/simulator/logic/protocolAnalyzers';

export interface OscilloscopeCaptureInput {
  channelIds: string[];
  timestamps_s: Float64Array;
  /** Row-major samples: sample index x channel count + channel index. */
  values: Float64Array;
  samplePeriodMs: number;
}

export interface OscilloscopeCaptureSnapshot {
  oscilloscopeData: Record<string, number[]>;
  logicCapture: LogicCaptureFrame[];
  oscilloscopeSamplePeriodMs: number;
}

export class FixedCapacityRing<T> {
  private readonly values: Array<T | undefined>;
  private writeIndex = 0;
  private retainedSize = 0;

  constructor(private readonly capacity: number) {
    this.capacity = Math.max(1, Math.trunc(capacity));
    this.values = new Array<T | undefined>(this.capacity);
  }

  push(value: T): void {
    this.values[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.retainedSize = Math.min(this.capacity, this.retainedSize + 1);
  }

  snapshot(): T[] {
    const snapshot = new Array<T>(this.retainedSize);
    const start = (this.writeIndex - this.retainedSize + this.capacity) % this.capacity;
    for (let index = 0; index < this.retainedSize; index += 1) {
      snapshot[index] = this.values[(start + index) % this.capacity]!;
    }
    return snapshot;
  }

  clear(): void {
    this.values.fill(undefined);
    this.writeIndex = 0;
    this.retainedSize = 0;
  }

  get size(): number {
    return this.retainedSize;
  }
}

export class FixedCapacityNumericRing {
  private readonly values: Float64Array;
  private writeIndex = 0;
  private retainedSize = 0;

  constructor(private readonly capacity: number) {
    this.capacity = Math.max(1, Math.trunc(capacity));
    this.values = new Float64Array(this.capacity);
  }

  push(value: number): void {
    this.values[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.retainedSize = Math.min(this.capacity, this.retainedSize + 1);
  }

  snapshot(): number[] {
    const snapshot = new Array<number>(this.retainedSize);
    const start = (this.writeIndex - this.retainedSize + this.capacity) % this.capacity;
    for (let index = 0; index < this.retainedSize; index += 1) {
      snapshot[index] = this.values[(start + index) % this.capacity];
    }
    return snapshot;
  }
}

/** Accumulates one transferable worker batch before the store publishes once. */
export class OscilloscopeCaptureAccumulator {
  private readonly channelBuffers = new Map<string, FixedCapacityNumericRing>();
  private readonly logicFrames: FixedCapacityRing<LogicCaptureFrame>;

  constructor(
    private readonly channelCapacity: number,
    logicFrameCapacity: number,
  ) {
    this.channelCapacity = Math.max(1, Math.trunc(channelCapacity));
    this.logicFrames = new FixedCapacityRing<LogicCaptureFrame>(logicFrameCapacity);
  }

  append(batch: OscilloscopeCaptureInput): OscilloscopeCaptureSnapshot | null {
    const channelCount = batch.channelIds.length;
    const sampleCount = batch.timestamps_s.length;
    if (channelCount === 0 || sampleCount === 0 || batch.values.length < channelCount * sampleCount) {
      return null;
    }

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const channels: Record<string, number> = {};
      let capturedChannelCount = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const channelId = batch.channelIds[channelIndex];
        const voltage = batch.values[sampleIndex * channelCount + channelIndex];
        if (!channelId || !Number.isFinite(voltage)) continue;

        let buffer = this.channelBuffers.get(channelId);
        if (!buffer) {
          buffer = new FixedCapacityNumericRing(this.channelCapacity);
          this.channelBuffers.set(channelId, buffer);
        }
        buffer.push(voltage);
        channels[channelId] = voltage;
        capturedChannelCount += 1;
      }

      const timestamp_s = batch.timestamps_s[sampleIndex];
      if (Number.isFinite(timestamp_s) && capturedChannelCount > 0) {
        this.logicFrames.push({ timestamp_s, channels });
      }
    }

    const oscilloscopeData: Record<string, number[]> = {};
    this.channelBuffers.forEach((buffer, channelId) => {
      oscilloscopeData[channelId] = buffer.snapshot();
    });
    return {
      oscilloscopeData,
      logicCapture: this.logicFrames.snapshot(),
      oscilloscopeSamplePeriodMs: Number.isFinite(batch.samplePeriodMs)
        ? Math.max(Number.EPSILON, batch.samplePeriodMs)
        : 1,
    };
  }

  clear(): void {
    this.channelBuffers.clear();
    this.logicFrames.clear();
  }
}
