import { BoundedScopeRing } from './workerBackpressure';

export const MIN_SCOPE_TIME_PER_DIV_MS = 0.01;
export const MAX_SCOPE_TIME_PER_DIV_MS = 10_000;

export interface ScopeCaptureBatch {
  timestamps: Float64Array;
  /** Row-major samples: sample index x channel count + channel index. */
  values: Float64Array;
  samplePeriodMs: number;
  captureRevision: number;
}

export function normalizeScopeTimePerDivisionMs(timePerDivMs: number): number {
  const finiteValue = Number.isFinite(timePerDivMs) ? timePerDivMs : 1;
  return Math.max(MIN_SCOPE_TIME_PER_DIV_MS, Math.min(MAX_SCOPE_TIME_PER_DIV_MS, finiteValue));
}

export function scopeSampleIntervalSeconds(
  timePerDivMs: number,
  horizontalDivisions: number,
  targetSamplesPerScreen: number,
): number {
  const visibleDuration_s = (
    normalizeScopeTimePerDivisionMs(timePerDivMs) * Math.max(1, horizontalDivisions)
  ) / 1000;
  return Math.max(Number.EPSILON, visibleDuration_s / Math.max(1, targetSamplesPerScreen));
}

export function nextScopeCaptureRevision(currentRevision: number): number {
  const normalized = Number.isSafeInteger(currentRevision) && currentRevision >= 0
    ? currentRevision
    : 0;
  return normalized >= Number.MAX_SAFE_INTEGER ? 1 : normalized + 1;
}

export function isCurrentScopeCaptureRevision(
  receivedRevision: number,
  currentRevision: number,
): boolean {
  return Number.isSafeInteger(receivedRevision) && receivedRevision === currentRevision;
}

/**
 * Worker-side scope retention and cadence policy. The class has no Worker,
 * timer, or solver dependency, so the exact production behavior can run with
 * a deterministic clock in regression coverage.
 */
export class ScopeCaptureBuffer {
  private readonly ring: BoundedScopeRing;
  private channelCount = 0;
  private sampleInterval_s = 0;
  private captureRevision = 0;
  private lastSampleTime_s = Number.NEGATIVE_INFINITY;

  constructor(capacity: number, channelCount = 0) {
    this.ring = new BoundedScopeRing(capacity, channelCount);
    this.channelCount = Math.max(0, Math.trunc(channelCount));
  }

  configureChannels(channelCount: number): void {
    this.channelCount = Math.max(0, Math.trunc(channelCount));
    this.ring.configure(this.channelCount);
    this.resetCadence();
  }

  configureTiming(sampleInterval_s: number | undefined, revision = this.captureRevision): void {
    this.sampleInterval_s = Number.isFinite(sampleInterval_s)
      ? Math.max(0, sampleInterval_s || 0)
      : 0;
    this.captureRevision = Number.isSafeInteger(revision) && revision >= 0
      ? revision
      : this.captureRevision;
    this.clear();
  }

  capture(timestamp_s: number, values: ArrayLike<number>, force = false): boolean {
    if (!this.isCaptureDue(timestamp_s, force) || values.length < this.channelCount) return false;
    if (!this.ring.push(timestamp_s, values)) return false;
    this.lastSampleTime_s = timestamp_s;
    return true;
  }

  isCaptureDue(timestamp_s: number, force = false): boolean {
    if (!Number.isFinite(timestamp_s) || this.channelCount === 0) return false;
    return force || !Number.isFinite(this.lastSampleTime_s)
      || timestamp_s - this.lastSampleTime_s + Number.EPSILON >= this.sampleInterval_s;
  }

  drain(fallbackSamplePeriod_s = this.sampleInterval_s): ScopeCaptureBatch | null {
    const batch = this.ring.drain();
    if (!batch) return null;
    const { timestamps, values } = batch;
    const fallbackPeriod_s = Number.isFinite(fallbackSamplePeriod_s) && fallbackSamplePeriod_s > 0
      ? fallbackSamplePeriod_s
      : this.sampleInterval_s || 0.001;
    const samplePeriodMs = timestamps.length > 1
      ? Math.max(
          Number.EPSILON,
          ((timestamps[timestamps.length - 1] - timestamps[0]) * 1000) / (timestamps.length - 1),
        )
      : Math.max(Number.EPSILON, fallbackPeriod_s * 1000);
    return {
      timestamps,
      values,
      samplePeriodMs,
      captureRevision: this.captureRevision,
    };
  }

  clear(resetCadence = true): void {
    this.ring.clear();
    if (resetCadence) this.resetCadence();
  }

  private resetCadence(): void {
    this.lastSampleTime_s = Number.NEGATIVE_INFINITY;
  }

  get size(): number {
    return this.ring.size;
  }

  get revision(): number {
    return this.captureRevision;
  }

  get sampleIntervalSeconds(): number {
    return this.sampleInterval_s;
  }
}

export function scopeBatchTransferables(
  batch: Pick<ScopeCaptureBatch, 'timestamps' | 'values'>,
): ArrayBuffer[] {
  return [batch.timestamps.buffer as ArrayBuffer, batch.values.buffer as ArrayBuffer];
}
