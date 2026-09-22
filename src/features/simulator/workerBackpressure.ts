/**
 * Deterministic protocol state used by SimulationWorker. It intentionally has
 * no DOM, timer, or Worker dependency so lifecycle behavior can be asserted
 * with a controlled clock and without starting a real browser worker.
 */
export type WorkerProtocolState = 'ready' | 'running' | 'paused' | 'stopped';

export class WorkerBackpressureGate {
  private state: WorkerProtocolState = 'ready';
  private pendingCredit = false;

  reset() {
    this.state = 'ready';
    this.pendingCredit = false;
  }

  start(): boolean {
    if (this.state === 'stopped') return false;
    this.state = 'running';
    return true;
  }

  pause(): boolean {
    if (this.state !== 'running') return false;
    this.state = 'paused';
    return true;
  }

  resume(): boolean {
    if (this.state !== 'paused') return false;
    this.state = 'running';
    return true;
  }

  stop() {
    this.state = 'stopped';
    this.pendingCredit = false;
  }

  /** Duplicate requests collapse into the one outstanding presentation credit. */
  requestResult(): boolean {
    if (this.state === 'stopped' || this.pendingCredit) return false;
    this.pendingCredit = true;
    return true;
  }

  /** Manual step owns its presentation credit and is accepted while paused. */
  requestStep(): boolean {
    if (this.state !== 'paused' || this.pendingCredit) return false;
    this.pendingCredit = true;
    return true;
  }

  /** A RESULT consumes exactly one credit. */
  claimResultPublication(): boolean {
    if (!this.pendingCredit) return false;
    this.pendingCredit = false;
    return true;
  }

  get currentState(): WorkerProtocolState {
    return this.state;
  }

  get hasPendingCredit(): boolean {
    return this.pendingCredit;
  }
}

export interface ScopeRingBatch {
  timestamps: Float64Array;
  values: Float64Array;
}

/** Fixed-capacity row-major ring used for scope samples in the worker. */
export class BoundedScopeRing {
  private capacity: number;
  private channelCount: number;
  private timestamps: Float64Array;
  private values: Float64Array;
  private writeIndex = 0;
  private sampleCount = 0;

  constructor(capacity: number, channelCount: number) {
    this.capacity = Math.max(1, Math.trunc(capacity));
    this.channelCount = 0;
    this.timestamps = new Float64Array(0);
    this.values = new Float64Array(0);
    this.configure(channelCount);
  }

  configure(channelCount: number) {
    this.channelCount = Math.max(0, Math.trunc(channelCount));
    this.timestamps = new Float64Array(this.capacity);
    this.values = new Float64Array(this.capacity * this.channelCount);
    this.clear();
  }

  clear() {
    this.writeIndex = 0;
    this.sampleCount = 0;
  }

  push(timestamp: number, values: ArrayLike<number>): boolean {
    if (this.channelCount === 0 || values.length < this.channelCount) return false;
    const destinationOffset = this.writeIndex * this.channelCount;
    this.timestamps[this.writeIndex] = timestamp;
    for (let channelIndex = 0; channelIndex < this.channelCount; channelIndex += 1) {
      this.values[destinationOffset + channelIndex] = values[channelIndex];
    }
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.sampleCount = Math.min(this.capacity, this.sampleCount + 1);
    return true;
  }

  drain(): ScopeRingBatch | null {
    if (this.sampleCount === 0 || this.channelCount === 0) return null;

    const timestamps = new Float64Array(this.sampleCount);
    const values = new Float64Array(this.sampleCount * this.channelCount);
    const start = (this.writeIndex - this.sampleCount + this.capacity) % this.capacity;
    for (let sampleIndex = 0; sampleIndex < this.sampleCount; sampleIndex += 1) {
      const sourceIndex = (start + sampleIndex) % this.capacity;
      timestamps[sampleIndex] = this.timestamps[sourceIndex];
      values.set(
        this.values.subarray(sourceIndex * this.channelCount, (sourceIndex + 1) * this.channelCount),
        sampleIndex * this.channelCount,
      );
    }
    this.clear();
    return { timestamps, values };
  }

  get size(): number {
    return this.sampleCount;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`[worker protocol] ${message}`);
}

/**
 * Framework-free deterministic assertions for CI environments that do not
 * install a browser test runner. Calling this function throws on a protocol
 * regression and otherwise returns normally.
 */
export function assertWorkerBackpressureProtocol() {
  const gate = new WorkerBackpressureGate();
  assert(gate.requestResult(), 'the first result request should create a credit');
  assert(!gate.requestResult(), 'duplicate result credits must collapse');
  assert(gate.hasPendingCredit, 'the collapsed credit must remain outstanding');
  assert(gate.start(), 'a ready worker should start');
  assert(gate.claimResultPublication(), 'a result should consume one credit');
  assert(!gate.claimResultPublication(), 'a second result cannot publish without a credit');

  assert(gate.pause(), 'a running worker should pause');
  assert(gate.requestStep(), 'a paused worker should accept one manual step');
  assert(!gate.requestStep(), 'a second step cannot overtake its result');
  assert(gate.claimResultPublication(), 'the step result should consume its credit');
  assert(gate.resume(), 'a paused worker should resume');
  gate.stop();
  assert(!gate.requestResult(), 'a stopped worker cannot accept stale credits');
  assert(!gate.resume(), 'a stopped worker cannot resume');

  const ring = new BoundedScopeRing(3, 2);
  assert(ring.push(1, [10, 11]), 'first scope sample should be retained');
  assert(ring.push(2, [20, 21]), 'second scope sample should be retained');
  assert(ring.push(3, [30, 31]), 'third scope sample should be retained');
  assert(ring.push(4, [40, 41]), 'wrapped scope sample should replace the oldest sample');
  assert(ring.size === 3, 'scope ring must remain at fixed capacity');
  const batch = ring.drain();
  assert(Boolean(batch), 'a non-empty scope ring should drain');
  assert(batch?.timestamps.join(',') === '2,3,4', 'scope timestamps must remain chronological after wrap');
  assert(batch?.values.join(',') === '20,21,30,31,40,41', 'scope values must retain row-major order');
  assert(ring.size === 0, 'drain must clear retained scope samples');
}

