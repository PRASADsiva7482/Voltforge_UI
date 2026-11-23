/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — STAGE 4.3.7.2.3: WORKER TRANSPORT & TELEMETRY TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Verifies Worker Transport for RP2040 Dual-Core Observability:
 * - WT-01 .. WT-06: Worker Lifecycle & Authoritative Telemetry Generation Adoption
 * - WT-07 .. WT-12: Non-Destructive Snapshot Transport, Schema Preservation & Timing
 * - WT-13 .. WT-17: Generation Validation, Stale Data Identification & Error Transport
 * - WT-18 .. WT-20: Backwards Compatibility, Element Solving & Message Integrity
 * - WRK-01 .. WRK-05: Subscription Gating, 10 Hz Cadence & Credit Token Preservation
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { postedMessages, type PostedMessageRecord } from './setup_worker_env';
import type {
  WorkerInMessage,
  WorkerResultMessage,
  WorkerRp2040SnapshotMessage,
  WorkerRp2040LoadResultMessage,
} from '../src/features/simulator/SimulationWorker';
import { isValidTelemetryGenerationId } from '../src/features/simulator/SimulationWorker';
import type { MNAElement } from '../src/features/simulator/MNASolver';

const workerSelf = (globalThis as any).self;

function sendToWorker(msg: WorkerInMessage): void {
  workerSelf.onmessage({ data: msg });
}

function clearPostedMessages(): void {
  postedMessages.length = 0;
}

function getPostedMessages(): PostedMessageRecord[] {
  return [...postedMessages];
}

function getLastPostedMessage<T = any>(): T | undefined {
  return postedMessages.length > 0 ? (postedMessages[postedMessages.length - 1].message as T) : undefined;
}

function findPostedMessagesByType<T = any>(type: string): T[] {
  return postedMessages.filter((p) => p.message && p.message.type === type).map((p) => p.message as T);
}

// ─── Assertions & Accounting ─────────────────────────────────────────────────────────

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(condition: boolean, testId: string, description: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${testId} — ${description}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${testId} — ${description}`);
  }
}

// ─── Synthetic Firmware Generator ───────────────────────────────────────────────────

function buildUf2(flashPayload: Uint8Array, startAddress = 0x10000000): ArrayBuffer {
  const blockSize = 256;
  const numBlocks = Math.ceil(flashPayload.length / blockSize);
  const uf2 = new Uint8Array(numBlocks * 512);
  const view = new DataView(uf2.buffer);

  for (let i = 0; i < numBlocks; i++) {
    const offset = i * 512;
    view.setUint32(offset + 0, 0x0a324655, true);
    view.setUint32(offset + 4, 0x9e5d5157, true);
    view.setUint32(offset + 8, 0x00002000, true);
    view.setUint32(offset + 12, startAddress + i * blockSize, true);
    view.setUint32(offset + 16, blockSize, true);
    view.setUint32(offset + 20, i, true);
    view.setUint32(offset + 24, numBlocks, true);
    view.setUint32(offset + 28, 0xe48bff56, true);

    const chunk = flashPayload.subarray(i * blockSize, Math.min((i + 1) * blockSize, flashPayload.length));
    uf2.set(chunk, offset + 32);

    view.setUint32(offset + 508, 0x0ab16f30, true);
  }
  return uf2.buffer;
}

function createSyntheticFirmware(): ArrayBuffer {
  const syntheticFlash = new Uint8Array(4096).fill(0xff);
  const flashView = new DataView(syntheticFlash.buffer);
  const core0Entry = 0x10000101; // Thumb
  const sp0 = 0x20041000;

  // Flash: Initial SP and Reset Handler
  flashView.setUint32(0x0000, sp0, true);
  flashView.setUint32(0x0004, core0Entry, true);

  // Core 0 Code at 0x100:
  // MOVS R0, #42 (0x202a)
  // ADDS R0, #1  (0x3001)
  // B .          (0xe7fe)
  flashView.setUint16(0x0100, 0x202a, true);
  flashView.setUint16(0x0102, 0x3001, true);
  flashView.setUint16(0x0104, 0xe7fe, true);

  return buildUf2(syntheticFlash);
}

function createSampleElements(): MNAElement[] {
  return [
    { id: 'vsrc_1', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 5.0 },
    { id: 'r_1', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 1000.0 },
    { id: 'r_2', type: 'RESISTOR', nodeA: 2, nodeB: 0, value: 2000.0 },
  ];
}

// ─── Test Suite Execution ─────────────────────────────────────────────────────────────

console.log('════════════════════════════════════════════════════════════════════════');
console.log('   VOLTFORGE STAGE 4.3.7.2.3: WORKER TELEMETRY TRANSPORT TESTS         ');
console.log('════════════════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: WT-01 .. WT-06 — Worker Lifecycle & Telemetry Generation Adoption
// ─────────────────────────────────────────────────────────────────────────────
console.log('[SECTION 1] Verifying Worker Lifecycle & Authoritative Generation Adoption...');

// WT-01: INIT adopts supplied generation
{
  clearPostedMessages();
  sendToWorker({
    type: 'INIT',
    numNodes: 2,
    elements: createSampleElements(),
    dt: 0.001,
    telemetryGenerationId: 10,
  });

  // Load firmware into worker
  const fw = createSyntheticFirmware();
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: fw,
    clockFrequency_Hz: 133_000_000,
  });

  const loadResults = findPostedMessagesByType<WorkerRp2040LoadResultMessage>('RP2040_LOAD_RESULT');
  check(loadResults.length === 1 && loadResults[0].success === true, 'WT-01a', 'Firmware loads cleanly under initial worker state');

  // Request snapshot to verify generation adoption
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>();
  check(snapMsg?.type === 'RP2040_SNAPSHOT' && snapMsg.snapshot.generationId === 10, 'WT-01b', 'INIT adopts authoritative generationId = 10');
  check(snapMsg?.snapshot.sequenceId === 1, 'WT-01c', 'INIT starts sequence watermarking at sequenceId = 1');
}

// WT-02: Firmware reload adopts new supplied generation before loading
{
  clearPostedMessages();
  const fw = createSyntheticFirmware();
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: fw,
    clockFrequency_Hz: 133_000_000,
    telemetryGenerationId: 11,
  });

  const loadResults = findPostedMessagesByType<WorkerRp2040LoadResultMessage>('RP2040_LOAD_RESULT');
  check(loadResults.length === 1 && loadResults[0].success === true, 'WT-02a', 'Firmware reload succeeds with new telemetryGenerationId');

  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>();
  check(snapMsg?.type === 'RP2040_SNAPSHOT' && snapMsg.snapshot.generationId === 11, 'WT-02b', 'LOAD_RP2040_FIRMWARE adopts new generationId = 11');
  check(snapMsg?.snapshot.sequenceId === 1, 'WT-02c', 'Firmware reload resets sequence counter to 1 for new generation');
}

// WT-03: Hardware reset adopts new supplied generation before resetting
{
  clearPostedMessages();
  sendToWorker({
    type: 'RP2040_RESET',
    telemetryGenerationId: 12,
  });

  const resetComplete = getLastPostedMessage<{ type: string; telemetryGenerationId?: number }>();
  check(resetComplete?.type === 'RP2040_RESET_COMPLETE' && resetComplete.telemetryGenerationId === 12, 'WT-03a', 'RP2040_RESET acknowledges with adopted generationId = 12');

  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>();
  check(snapMsg?.type === 'RP2040_SNAPSHOT' && snapMsg.snapshot.generationId === 12, 'WT-03b', 'RP2040_RESET adopts generationId = 12');
  check(snapMsg?.snapshot.sequenceId === 1, 'WT-03c', 'Hardware reset resets sequence counter to 1 for new generation');
}

// WT-04: Restart after STOP adopts authoritative generation
{
  sendToWorker({ type: 'STOP' });
  clearPostedMessages();

  // Re-initialize and load firmware
  sendToWorker({
    type: 'INIT',
    numNodes: 2,
    elements: createSampleElements(),
    dt: 0.001,
    telemetryGenerationId: 20,
  });
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
    clockFrequency_Hz: 133_000_000,
  });

  // START with authoritative generation
  sendToWorker({
    type: 'START',
    telemetryGenerationId: 21,
  });

  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>();
  check(snapMsg?.type === 'RP2040_SNAPSHOT' && snapMsg.snapshot.generationId === 21, 'WT-04a', 'START after STOP adopts authoritative generationId = 21');
  check(snapMsg?.snapshot.sequenceId === 1, 'WT-04b', 'Sequence counter begins at 1 under restart generation');
}

// WT-05: PAUSE preserves the current generation
{
  sendToWorker({ type: 'PAUSE' });
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg1 = getLastPostedMessage<WorkerRp2040SnapshotMessage>();

  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg2 = getLastPostedMessage<WorkerRp2040SnapshotMessage>();

  check(snapMsg1?.snapshot.generationId === 21 && snapMsg2?.snapshot.generationId === 21, 'WT-05a', 'PAUSE preserves the current generationId = 21');
  check(snapMsg2!.snapshot.sequenceId === snapMsg1!.snapshot.sequenceId + 1, 'WT-05b', 'Sequence IDs advance monotonically across PAUSE queries');
}

// WT-06: RESUME preserves the current generation
{
  sendToWorker({ type: 'RESUME' });
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>();

  check(snapMsg?.snapshot.generationId === 21, 'WT-06a', 'RESUME preserves current generationId = 21');
  check(snapMsg!.snapshot.sequenceId > 2, 'WT-06b', 'Sequence counter continues monotonically across RESUME');
  sendToWorker({ type: 'PAUSE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: WT-07 .. WT-12 — Snapshot Transport & Non-Destructive Observability
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 2] Verifying Snapshot Transport & Non-Destructive Observability...');

// WT-07: Explicit snapshot request returns the correct response
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>();
  check(snapMsg !== undefined && snapMsg.type === 'RP2040_SNAPSHOT', 'WT-07a', 'Explicit snapshot request responds with RP2040_SNAPSHOT');
  check(snapMsg?.snapshot !== null && typeof snapMsg?.snapshot === 'object', 'WT-07b', 'Snapshot payload is non-null object');
}

// WT-08: Both core snapshots are transported
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!;
  check(snapMsg.snapshot.core0 !== undefined && snapMsg.snapshot.core0 !== null, 'WT-08a', 'Core 0 telemetry snapshot is present in transport payload');
  check(snapMsg.snapshot.core1 !== undefined && snapMsg.snapshot.core1 !== null, 'WT-08b', 'Core 1 telemetry snapshot is present in transport payload');
  check(snapMsg.snapshot.core0.coreId === 0 && snapMsg.snapshot.core1.coreId === 1, 'WT-08c', 'Core 0 and Core 1 have distinct, correct core IDs');
  check(snapMsg.snapshot.core0.r0_r12.length === 13, 'WT-08d', 'Core 0 general purpose registers (R0-R12) transported intact');
  check(typeof snapMsg.snapshot.core0.flags.zero === 'boolean', 'WT-08e', 'Core 0 condition flags transported intact');
}

// WT-09: FIFO, spinlock and Boot ROM telemetry survive transport
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!;
  check(snapMsg.snapshot.fifo !== undefined && Array.isArray(snapMsg.snapshot.fifo.fifo0to1.entries), 'WT-09a', 'SIO FIFO telemetry survives worker transport');
  check(typeof snapMsg.snapshot.fifo.fifo0to1.depth === 'number', 'WT-09b', 'FIFO depths are numeric in transport payload');
  check(snapMsg.snapshot.spinlocks !== undefined && typeof snapMsg.snapshot.spinlocks.claimedMask === 'number', 'WT-09c', 'Spinlock bitmask survives worker transport');
  check(snapMsg.snapshot.bootRom !== undefined && typeof snapMsg.snapshot.bootRom.handshakeStep === 'number', 'WT-09d', 'Boot ROM launch telemetry survives worker transport');
}

// WT-10: Generation and sequence IDs survive transport unchanged
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!;
  check(snapMsg.snapshot.generationId === 21, 'WT-10a', 'Generation ID survives transport exactly as authorized');
  check(Number.isInteger(snapMsg.snapshot.sequenceId) && snapMsg.snapshot.sequenceId > 0, 'WT-10b', 'Sequence ID is positive safe integer');
}

// WT-11: Repeated requests produce strictly increasing sequence IDs
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const s1 = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot.sequenceId;
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const s2 = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot.sequenceId;
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const s3 = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot.sequenceId;

  check(s2 === s1 + 1 && s3 === s2 + 1, 'WT-11', `Repeated requests strictly monotonic: ${s1} -> ${s2} -> ${s3}`);
}

// WT-12: Snapshot requests do not advance CPU execution or simulation time
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const before = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;

  // Dispatch 5 consecutive snapshot requests
  for (let i = 0; i < 5; i++) {
    sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  }
  const after = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;

  check(before.core0.pc === after.core0.pc, 'WT-12a', 'PC is unchanged across snapshot requests (zero instruction execution)');
  check(before.core0.cycles === after.core0.cycles, 'WT-12b', 'Cycle count is unchanged across snapshot requests');
  check(before.simulatedTime_s === after.simulatedTime_s, 'WT-12c', 'Simulated time is unchanged across snapshot requests');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: WT-13 .. WT-17 — Failure Modes, Validation & Stale Data Gating
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 3] Verifying Failure Modes, Validation & Stale Data Gating...');

// WT-13: Missing generation is handled according to contract
{
  // INIT without generation defaults to 1
  sendToWorker({ type: 'STOP' });
  sendToWorker({
    type: 'INIT',
    numNodes: 2,
    elements: createSampleElements(),
    dt: 0.001,
  });
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
  });
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapDefault = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snapDefault.generationId === 1, 'WT-13a', 'Missing generationId on INIT safely defaults to 1');

  // Firmware reload without generation retains current generation, never inventing autonomous worker generation
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
  });
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapRetainReload = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snapRetainReload.generationId === 1, 'WT-13b', 'Firmware reload without generation retains generation 1 without autonomous incrementing');

  // Reset without generation retains current generation
  sendToWorker({ type: 'RP2040_RESET' });
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapRetainReset = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snapRetainReset.generationId === 1, 'WT-13c', 'Hardware reset without generation retains generation 1 without autonomous incrementing');
}

// WT-14: Invalid generation is rejected
{
  check(!isValidTelemetryGenerationId(0), 'WT-14a', 'Generation 0 is recognized as invalid');
  check(!isValidTelemetryGenerationId(-5), 'WT-14b', 'Negative generation is recognized as invalid');
  check(!isValidTelemetryGenerationId(1.5), 'WT-14c', 'Floating point generation is recognized as invalid');
  check(!isValidTelemetryGenerationId('two' as any), 'WT-14d', 'String generation is recognized as invalid');

  // Invalid generation in LOAD_RP2040_FIRMWARE produces load error
  clearPostedMessages();
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
    telemetryGenerationId: -1,
  });
  const badLoadReply = getLastPostedMessage<WorkerRp2040LoadResultMessage>()!;
  check(badLoadReply.type === 'RP2040_LOAD_RESULT' && badLoadReply.success === false, 'WT-14e', 'LOAD_RP2040_FIRMWARE rejects negative telemetryGenerationId');
  check(badLoadReply.errors.some((e) => e.includes('Invalid telemetryGenerationId')), 'WT-14f', 'Load failure contains specific generation validation error');

  // Invalid generation in RP2040_RESET produces reset error
  clearPostedMessages();
  sendToWorker({
    type: 'RP2040_RESET',
    telemetryGenerationId: 0,
  });
  const badResetReply = getLastPostedMessage<{ type: string; error?: string }>()!;
  check(badResetReply.type === 'RP2040_RESET_ERROR', 'WT-14g', 'RP2040_RESET rejects zero telemetryGenerationId with error message');
}

// WT-15: Old-generation snapshot remains identifiable
{
  // Worker under generation 1
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const oldGenSnapshot = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;

  // Engine advances expected generation to 2
  const mainThreadExpectedGen = 2;
  const isIdentifiedAsOld = oldGenSnapshot.generationId < mainThreadExpectedGen;
  check(isIdentifiedAsOld === true, 'WT-15', 'Old generation snapshot (gen 1) carries originating generation and is strictly identifiable by main thread');
}

// WT-16: Duplicate or out-of-order snapshots are not silently rewritten
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const s1 = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const s2 = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;

  // The worker transmits true sequence numbers: s1.sequenceId < s2.sequenceId
  check(s1.sequenceId !== s2.sequenceId && s2.sequenceId > s1.sequenceId, 'WT-16', 'Sequence watermarking preserves monotonic IDs without silent rewriting');
}

// WT-17: Controller errors are transported without fabricated core fault states
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snap = getLastPostedMessage<WorkerRp2040SnapshotMessage>()!.snapshot;

  // When controller is loaded and executing normally, core is in normal state and errors is empty
  check(snap.core0.lifecycle !== 'FAULT' as any, 'WT-17a', 'Core lifecycle state is not corrupted with FAULT');
  check(Array.isArray(snap.errors) && snap.errors.length === 0, 'WT-17b', 'Host emulator errors array is transported cleanly');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: WT-18 .. WT-20 — Compatibility with Existing Worker Commands
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 4] Verifying Compatibility with Existing Worker Commands...');

// WT-18: Existing worker commands remain functional
{
  // Prime worker into running & paused state for interactive manual stepping
  sendToWorker({ type: 'START' });
  sendToWorker({ type: 'PAUSE' });

  // UPDATE_PIN
  sendToWorker({ type: 'UPDATE_PIN', elementId: 'vsrc_1', voltage: 3.3 });
  // SET_SPEED
  sendToWorker({ type: 'SET_SPEED', speed: 2.0 });
  // SET_TIMESTEP
  sendToWorker({ type: 'SET_TIMESTEP', dt: 0.0005 });
  // STEP
  clearPostedMessages();
  sendToWorker({ type: 'STEP' });
  const stepMsg = getLastPostedMessage<WorkerResultMessage>();
  check(stepMsg !== undefined && stepMsg.type === 'RESULT', 'WT-18a', 'STEP command produces RESULT frame');
  check(stepMsg?.converged === true, 'WT-18b', 'Solver converged on manual step');
}

// WT-19: Existing worker response contracts remain compatible
{
  const resultMsg = getLastPostedMessage<WorkerResultMessage>()!;
  check(resultMsg.nodeVoltages instanceof Float64Array, 'WT-19a', 'RESULT message provides Float64Array nodeVoltages');
  check(typeof resultMsg.timestamp === 'number', 'WT-19b', 'RESULT message provides numeric timestamp');
  check(typeof resultMsg.timeStep === 'number', 'WT-19c', 'RESULT message provides numeric timeStep');
}

// WT-20: No duplicate telemetry messages are generated
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const messages = getPostedMessages();
  check(messages.length === 1 && messages[0].message.type === 'RP2040_SNAPSHOT', 'WT-20', 'Single snapshot request produces exactly one snapshot response');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: WRK-01 .. WRK-05 — Subscription Gating & 10 Hz Cadence
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SECTION 5] Verifying Subscription Gating & 10 Hz Cadence (WRK-01 .. WRK-05)...');

// WRK-01: Subscription Off (Default) -> RESULT does not contain rp2040Snapshot
{
  sendToWorker({
    type: 'SET_RESULT_SUBSCRIPTION',
    subscription: {
      nodeIndices: [0, 1, 2],
      branchCurrentElementIds: [],
      powerElementIds: [],
      rp2040TelemetryEnabled: false,
    },
  });

  clearPostedMessages();
  sendToWorker({ type: 'STEP' });
  const result = getLastPostedMessage<WorkerResultMessage>();
  check(result?.type === 'RESULT', 'WRK-01a', 'Manual step publishes RESULT under subscription');
  check(result?.rp2040Snapshot === undefined, 'WRK-01b', 'rp2040Snapshot is omitted when rp2040TelemetryEnabled is false (zero allocation)');
}

// WRK-02: Subscription On (Active) -> RESULT includes rp2040Snapshot
{
  sendToWorker({
    type: 'SET_RESULT_SUBSCRIPTION',
    subscription: {
      nodeIndices: [0, 1, 2],
      branchCurrentElementIds: [],
      powerElementIds: [],
      rp2040TelemetryEnabled: true,
    },
  });

  clearPostedMessages();
  sendToWorker({ type: 'STEP' });
  const result = getLastPostedMessage<WorkerResultMessage>();
  check(result?.type === 'RESULT', 'WRK-02a', 'RESULT published with telemetry subscription enabled');
  check(result?.rp2040Snapshot !== undefined, 'WRK-02b', 'rp2040Snapshot attached to RESULT when subscribed and interval elapsed');
  check(result?.rp2040Snapshot?.core0 !== undefined, 'WRK-02c', 'Attached snapshot contains complete dual-core observability');
}

// WRK-03: 10 Hz Rate Limiting -> Snapshots throttled across rapid consecutive results
{
  // Immediately request another step without 100 ms elapsing
  clearPostedMessages();
  sendToWorker({ type: 'STEP' });
  const immediateResult = getLastPostedMessage<WorkerResultMessage>();
  check(immediateResult?.type === 'RESULT', 'WRK-03a', 'Second immediate step publishes RESULT');
  check(immediateResult?.rp2040Snapshot === undefined, 'WRK-03b', 'Second immediate RESULT omits rp2040Snapshot because 100 ms has not elapsed');

  // Wait for 110 ms (> 100 ms cadence threshold)
  await new Promise((resolve) => setTimeout(resolve, 110));

  // Third step after 110 ms must attach rp2040Snapshot again
  clearPostedMessages();
  sendToWorker({ type: 'STEP' });
  const cadenceResult = getLastPostedMessage<WorkerResultMessage>();
  check(cadenceResult?.type === 'RESULT' && cadenceResult.rp2040Snapshot !== undefined, 'WRK-03c', 'RESULT attaches rp2040Snapshot after 100 ms interval elapses (10 Hz cadence)');
}

// WRK-04: On-Demand Snapshot Request while paused returns snapshot immediately
{
  clearPostedMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const onDemandMsg = getLastPostedMessage<WorkerRp2040SnapshotMessage>();
  check(onDemandMsg?.type === 'RP2040_SNAPSHOT', 'WRK-04a', 'On-demand request returns snapshot immediately while paused');
  check(onDemandMsg?.snapshot.sequenceId !== undefined, 'WRK-04b', 'On-demand snapshot advances sequence watermarking');
}

// WRK-05: Credit Token Preservation
{
  sendToWorker({ type: 'STOP' });
  sendToWorker({
    type: 'INIT',
    numNodes: 2,
    elements: createSampleElements(),
    dt: 0.001,
  });
  clearPostedMessages();
  sendToWorker({ type: 'REQUEST_RESULT' });
  sendToWorker({ type: 'REQUEST_RESULT' });
  const msgs = getPostedMessages().filter((m) => m.message?.type === 'RESULT');
  check(msgs.length === 0, 'WRK-05', 'WorkerBackpressureGate prevents result publication without completed solve');
}

// ─────────────────────────────────────────────────────────────────────────────
// Final Summary & Exit
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(`   STAGE 4.3.7.2.3 TEST RESULTS: ${passedChecks} / ${totalChecks} CHECKS PASSED`);
if (failedChecks === 0) {
  console.log('   STATUS: ALL VERIFICATION SPECIFICATIONS SATISFIED (100% PASS)');
} else {
  console.error(`   STATUS: ${failedChecks} CHECKS FAILED`);
}
console.log('════════════════════════════════════════════════════════════════════════\n');

if (failedChecks > 0) {
  process.exit(1);
}
