import { useSimulationStore } from '../../../store/simulationStore';
import { OscilloscopeCaptureAccumulator } from '../../../store/oscilloscopeCapture';
import {
  decodeI2c,
  decodeSpi,
  decodeUart,
  type LogicCaptureFrame,
} from '../logic/protocolAnalyzers';
import { SIMULATION_MODELS } from '../simulationModels';
import {
  isCurrentScopeCaptureRevision,
  nextScopeCaptureRevision,
  ScopeCaptureBuffer,
  scopeBatchTransferables,
  scopeSampleIntervalSeconds,
} from '../scopeCapture';
import { WorkerBackpressureGate } from '../workerBackpressure';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Scope capture contract failed: ${message}`);
}

function assertNumbers(actual: ArrayLike<number>, expected: number[], message: string): void {
  assert(
    Array.from(actual).join('|') === expected.join('|'),
    `${message}; expected ${expected.join(', ')}, received ${Array.from(actual).join(', ')}`,
  );
}

function assertWorkerRingAndCadence(): void {
  const capture = new ScopeCaptureBuffer(3, 2);
  capture.configureTiming(2, 4);
  for (let timestamp_s = 0; timestamp_s <= 8; timestamp_s += 1) {
    capture.capture(timestamp_s, [timestamp_s * 10, timestamp_s * 10 + 1]);
  }

  assert(capture.size === 3, 'worker ring must retain exactly its configured capacity');
  const batch = capture.drain();
  assert(batch, 'worker ring must drain a non-empty batch');
  assertNumbers(batch.timestamps, [4, 6, 8], 'worker timestamps must remain chronological after multiple wraps');
  assertNumbers(batch.values, [40, 41, 60, 61, 80, 81], 'worker values must retain row-major channel order');
  assert(batch.samplePeriodMs === 2_000, 'downsampled batch must report its observed cadence');
  assert(batch.captureRevision === 4, 'worker batch must retain its configured revision');

  const transferables = scopeBatchTransferables(batch);
  assert(transferables.length === 2, 'one scope batch must transfer exactly two numeric buffers');
  assert(transferables[0] === batch.timestamps.buffer, 'timestamp storage must be transferred without copying');
  assert(transferables[1] === batch.values.buffer, 'row-major value storage must be transferred without copying');

  capture.capture(9, [90, 91], true);
  capture.configureTiming(0.25, 5);
  assert(Number(capture.size) === 0, 'timebase reconfiguration must discard pending old-period samples');
  assert(capture.capture(9.01, [901, 902]), 'new timing revision must reset the capture cadence immediately');
  assert(!capture.capture(9.1, [910, 911]), 'capture interval must downsample intermediate solver steps');
  assert(capture.capture(9.26, [926, 927]), 'capture interval must accept the next due solver step');
  const revised = capture.drain();
  assert(revised?.captureRevision === 5, 'drained samples must carry only the current timing revision');
  assertNumbers(revised?.timestamps || [], [9.01, 9.26], 'new timing batch must not contain old-period timestamps');
  assert(!isCurrentScopeCaptureRevision(4, 5), 'main thread must reject a queued batch from the previous timebase');
  assert(isCurrentScopeCaptureRevision(5, 5), 'main thread must accept the active timebase revision');
  assert(nextScopeCaptureRevision(5) === 6, 'capture revisions must advance monotonically');

  const fastInterval = scopeSampleIntervalSeconds(
    1,
    SIMULATION_MODELS.scope.horizontalDivisions,
    SIMULATION_MODELS.scope.targetSamplesPerScreen,
  );
  const slowInterval = scopeSampleIntervalSeconds(
    10,
    SIMULATION_MODELS.scope.horizontalDivisions,
    SIMULATION_MODELS.scope.targetSamplesPerScreen,
  );
  assert(slowInterval === fastInterval * 10, 'time-per-division must scale worker capture cadence proportionally');
}

function assertStoreRingAndPublication(): void {
  const accumulator = new OscilloscopeCaptureAccumulator(3, 4);
  const timestamps = Float64Array.from({ length: 9 }, (_, index) => index);
  const values = new Float64Array(timestamps.length * 2);
  timestamps.forEach((timestamp, sampleIndex) => {
    values[sampleIndex * 2] = timestamp * 10;
    values[sampleIndex * 2 + 1] = timestamp * 10 + 1;
  });
  const snapshot = accumulator.append({
    channelIds: ['CH1', 'CH2'],
    timestamps_s: timestamps,
    values,
    samplePeriodMs: 1,
  });
  assert(snapshot, 'store accumulator must accept a valid row-major batch');
  assertNumbers(snapshot.oscilloscopeData.CH1, [60, 70, 80], 'CH1 store ring must retain its exact capacity chronologically');
  assertNumbers(snapshot.oscilloscopeData.CH2, [61, 71, 81], 'CH2 store ring must retain its exact capacity chronologically');
  assertNumbers(snapshot.logicCapture.map((frame) => frame.timestamp_s), [5, 6, 7, 8], 'logic ring must retain its exact capacity chronologically');

  const store = useSimulationStore;
  const originalTimePerDivMs = store.getState().oscilloscopeTimePerDivMs;
  store.getState().clearOscilloscopeData();
  let scopePublications = 0;
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.oscilloscopeData !== previous.oscilloscopeData ||
      state.logicCapture !== previous.logicCapture ||
      state.oscilloscopeSamplePeriodMs !== previous.oscilloscopeSamplePeriodMs
    ) {
      scopePublications += 1;
    }
  });
  try {
    store.getState().publishOscilloscopeBatch({
      channelIds: ['CH1', 'CH2', 'CH3'],
      timestamps_s: Float64Array.from({ length: 128 }, (_, index) => index / 1_000),
      values: Float64Array.from({ length: 128 * 3 }, (_, index) => index),
      samplePeriodMs: 1,
    });
    assert(scopePublications === 1, 'one worker batch must cause exactly one store publication');

    store.getState().setOscilloscopeTimePerDiv(originalTimePerDivMs === 2 ? 3 : 2);
    assert(Object.keys(store.getState().oscilloscopeData).length === 0, 'timebase change must clear displayed channel history');
    assert(store.getState().logicCapture.length === 0, 'timebase change must clear protocol history');

    const previousRevision = 10;
    const currentRevision = nextScopeCaptureRevision(previousRevision);
    if (isCurrentScopeCaptureRevision(previousRevision, currentRevision)) {
      store.getState().publishOscilloscopeBatch({
        channelIds: ['CH1'],
        timestamps_s: Float64Array.of(1),
        values: Float64Array.of(99),
        samplePeriodMs: 10,
      });
    }
    assert(Object.keys(store.getState().oscilloscopeData).length === 0, 'stale worker revision must not repopulate a cleared timebase');

    if (isCurrentScopeCaptureRevision(currentRevision, currentRevision)) {
      store.getState().publishOscilloscopeBatch({
        channelIds: ['CH1'],
        timestamps_s: Float64Array.of(2),
        values: Float64Array.of(22),
        samplePeriodMs: 20,
      });
    }
    assertNumbers(store.getState().oscilloscopeData.CH1, [22], 'current timing revision must populate the new waveform');
  } finally {
    unsubscribe();
    store.getState().setOscilloscopeTimePerDiv(originalTimePerDivMs);
    store.getState().clearOscilloscopeData();
  }
}

function assertPauseAndManualStep(): void {
  const gate = new WorkerBackpressureGate();
  const capture = new ScopeCaptureBuffer(8, 1);
  capture.configureTiming(10, 7);
  let simulationTime_s = 5;

  assert(gate.start(), 'worker fixture must enter running state');
  assert(capture.capture(simulationTime_s, [5]), 'running worker must retain its due sample');
  assert(gate.requestResult(), 'pause path must have one presentation credit');
  assert(gate.pause(), 'running worker must pause');
  const pausedAt_s = simulationTime_s;
  assert(gate.claimResultPublication(), 'pause must publish the retained result credit');
  const pausedBatch = capture.drain(0.1);
  assertNumbers(pausedBatch?.timestamps || [], [pausedAt_s], 'pause must flush retained samples');
  assert(simulationTime_s === pausedAt_s, 'pause publication must not advance simulation time');

  for (let stepIndex = 1; stepIndex <= 2; stepIndex += 1) {
    assert(gate.requestStep(), `manual step ${stepIndex} must own one result credit`);
    simulationTime_s += 0.1;
    assert(capture.capture(simulationTime_s, [simulationTime_s], true), `manual step ${stepIndex} must force one capture`);
    assert(gate.claimResultPublication(), `manual step ${stepIndex} must publish once`);
    const stepBatch = capture.drain(0.1);
    assert(stepBatch?.timestamps.length === 1, `manual step ${stepIndex} must publish exactly one sample`);
    assert(stepBatch?.timestamps[0] === simulationTime_s, `manual step ${stepIndex} must publish its advanced timestamp`);
  }
}

function pushFrame(
  frames: LogicCaptureFrame[],
  timestamp_s: number,
  channels: Record<string, number>,
): void {
  frames.push({ timestamp_s, channels });
}

function i2cFixture(edgePeriod_s: number): LogicCaptureFrame[] {
  const frames: LogicCaptureFrame[] = [];
  let timestamp_s = 0;
  const push = (sda: boolean, scl: boolean) => {
    pushFrame(frames, timestamp_s, { SDA: sda ? 5 : 0, SCL: scl ? 5 : 0 });
    timestamp_s += edgePeriod_s;
  };
  push(true, true);
  push(false, true);
  const addressWriteByte = 0xa0;
  const bits = [
    ...Array.from({ length: 8 }, (_, bitIndex) => Boolean(addressWriteByte & (1 << (7 - bitIndex)))),
    false,
  ];
  bits.forEach((bit) => {
    push(bit, false);
    push(bit, true);
  });
  push(false, false);
  push(false, true);
  push(true, true);
  return frames;
}

function spiFixture(edgePeriod_s: number): LogicCaptureFrame[] {
  const frames: LogicCaptureFrame[] = [];
  let timestamp_s = 0;
  const push = (mosi: boolean, miso: boolean, clock: boolean, selected: boolean) => {
    pushFrame(frames, timestamp_s, {
      MOSI: mosi ? 5 : 0,
      MISO: miso ? 5 : 0,
      SCK: clock ? 5 : 0,
      CS: selected ? 0 : 5,
    });
    timestamp_s += edgePeriod_s;
  };
  push(false, false, false, false);
  push(false, false, false, true);
  for (let bitIndex = 7; bitIndex >= 0; bitIndex -= 1) {
    const mosi = Boolean(0xa5 & (1 << bitIndex));
    const miso = Boolean(0x3c & (1 << bitIndex));
    push(mosi, miso, false, true);
    push(mosi, miso, true, true);
  }
  push(false, false, false, false);
  return frames;
}

function uartFixture(samplePeriod_s: number, baudRate: number, value: number): LogicCaptureFrame[] {
  const frames: LogicCaptureFrame[] = [];
  const bitTime_s = 1 / baudRate;
  const levelAt = (timestamp_s: number): boolean => {
    if (timestamp_s < bitTime_s) return true;
    if (timestamp_s < bitTime_s * 2) return false;
    if (timestamp_s < bitTime_s * 10) {
      const bitIndex = Math.min(7, Math.floor(timestamp_s / bitTime_s) - 2);
      return Boolean(value & (1 << bitIndex));
    }
    return true;
  };
  for (let timestamp_s = 0; timestamp_s <= bitTime_s * 12; timestamp_s += samplePeriod_s) {
    pushFrame(frames, timestamp_s, { UART_TX: levelAt(timestamp_s) ? 5 : 0 });
  }
  return frames;
}

function assertProtocolFixtures(): void {
  const selectedSamplePeriod_s = scopeSampleIntervalSeconds(
    0.1,
    SIMULATION_MODELS.scope.horizontalDivisions,
    SIMULATION_MODELS.scope.targetSamplesPerScreen,
  );
  const edgePeriod_s = 10e-6;
  const baudRate = 9_600;
  assert(selectedSamplePeriod_s <= edgePeriod_s, 'selected timebase must sample representative serial edges densely enough');
  assert(selectedSamplePeriod_s <= 1 / baudRate / 8, 'selected timebase must provide at least eight samples per UART bit');

  const i2c = decodeI2c(i2cFixture(edgePeriod_s), 'SDA', 'SCL');
  const i2cByte = i2c.find((event) => event.kind === 'BYTE');
  assert(i2c[0]?.kind === 'START' && i2c.at(-1)?.kind === 'STOP', 'I2C fixture must preserve START/STOP edges');
  assert(i2cByte?.value === 0xa0 && i2cByte.address === 0x50 && i2cByte.ack === true, 'I2C fixture must decode address 0x50 write with ACK');

  const spi = decodeSpi(spiFixture(edgePeriod_s), 'MOSI', 'MISO', 'SCK', 'CS', 0);
  assert(spi.length === 1 && spi[0].mosi === 0xa5 && spi[0].miso === 0x3c, 'SPI mode-0 fixture must decode both row-major channels');

  const uart = decodeUart(uartFixture(selectedSamplePeriod_s, baudRate, 0x55), 'UART_TX', baudRate);
  assert(
    uart.some((frame) => frame.value === 0x55 && frame.framingValid),
    `UART 8N1 fixture must decode 0x55 with a valid stop bit (received ${uart.map((frame) => `${frame.value}:${frame.framingValid}`).join(', ') || 'none'})`,
  );
}

/** Deterministic worker/store/protocol coverage using production scope seams. */
export function assertScopeCaptureContract(): void {
  assertWorkerRingAndCadence();
  assertStoreRingAndPublication();
  assertPauseAndManualStep();
  assertProtocolFixtures();
}
