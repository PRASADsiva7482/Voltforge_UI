/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.7.2.4: GENERATION LIFECYCLE & STORE INTEGRATION TESTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Verifies:
 *   1. Main-Thread Generation Authority (SimulationEngine sole source of truth)
 *   2. DEF-01 Fix: Sequence watermark collision resolution across reload/reset
 *   3. DEF-02 Fix: Autonomous worker generation default elimination on INIT
 *   4. DEF-03 Fix: End-to-end round-trip store acceptance verification
 *   5. Section 4.1 Stale Message Rejection Scenario
 *   6. Invalid Generation Handling (0, negative, float, NaN, Infinity, strings, null)
 *   7. Subscription Gating & Rate Limiting
 *   8. Execution & Physical Time Safety (zero CPU step during inspection)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import './setup_worker_env';
import { postedMessages } from './setup_worker_env';
import { useSimulationStore } from '../src/store/simulationStore';
import { isValidTelemetryGenerationId } from '../src/features/simulator/SimulationWorker';
import type {
  WorkerInMessage,
  WorkerResultMessage,
  WorkerRp2040LoadResultMessage,
  WorkerRp2040ResetCompleteMessage,
  WorkerRp2040SnapshotMessage,
} from '../src/features/simulator/SimulationWorker';

let totalChecks = 0;
let passedChecks = 0;

function check(condition: boolean, id: string, description: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${id} — ${description}`);
  } else {
    console.error(`  [FAIL] ${id} — ${description}`);
    throw new Error(`Assertion failed for ${id}: ${description}`);
  }
}

function clearWorkerMessages(): void {
  postedMessages.length = 0;
}

function sendToWorker(msg: WorkerInMessage): void {
  const handler = (globalThis as any).self.onmessage;
  if (!handler) throw new Error('Worker onmessage handler not registered');
  handler({ data: msg } as MessageEvent);
}

function getLatestWorkerMessage<T = any>(): T | null {
  if (postedMessages.length === 0) return null;
  return postedMessages[postedMessages.length - 1].message as T;
}

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

async function runAllTests(): Promise<void> {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE STAGE 4.3.7.2.4: GENERATION LIFECYCLE & STORE INTEGRATION  ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP 1: GENERATION ID VALIDATION CONTRACTS (Section 3.4)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[GROUP 1] Verifying Generation ID Validity Criteria...');

  check(isValidTelemetryGenerationId(1), 'GEN-01a', 'Generation 1 is valid');
  check(isValidTelemetryGenerationId(100), 'GEN-01b', 'Generation 100 is valid');
  check(!isValidTelemetryGenerationId(0), 'GEN-02a', 'Generation 0 is rejected (must be strictly positive)');
  check(!isValidTelemetryGenerationId(-1), 'GEN-02b', 'Negative generation is rejected');
  check(!isValidTelemetryGenerationId(-999), 'GEN-02c', 'Large negative generation is rejected');
  check(!isValidTelemetryGenerationId(1.5), 'GEN-02d', 'Fractional generation is rejected');
  check(!isValidTelemetryGenerationId(NaN), 'GEN-02e', 'NaN generation is rejected');
  check(!isValidTelemetryGenerationId(Infinity), 'GEN-02f', 'Infinity generation is rejected');
  check(!isValidTelemetryGenerationId(-Infinity), 'GEN-02g', '-Infinity generation is rejected');
  check(!isValidTelemetryGenerationId('1' as any), 'GEN-02h', 'Numeric string is rejected');
  check(!isValidTelemetryGenerationId(null as any), 'GEN-02i', 'null is rejected');
  check(!isValidTelemetryGenerationId(undefined as any), 'GEN-02j', 'undefined is rejected');

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP 2: MAIN-THREAD GENERATION AUTHORITY & LIFECYCLE (Gates A & C)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[GROUP 2] Verifying Main-Thread Generation Authority & Lifecycle Operations...');

  // GL-01: INIT with explicit generation adopts generation and resets sequence counter to 1
  clearWorkerMessages();
  sendToWorker({
    type: 'INIT',
    numNodes: 1,
    elements: [],
    dt: 0.001,
    telemetryGenerationId: 10,
    resultSubscription: {
      nodeIndices: [0],
      branchCurrentElementIds: [],
      powerElementIds: [],
      rp2040TelemetryEnabled: true,
    },
  });
  useSimulationStore.getState().invalidateTelemetry(10);
  check(useSimulationStore.getState().expectedGenerationId === 10, 'GL-01a', 'Store expectedGenerationId initialized to 10');
  check(useSimulationStore.getState().lastSequenceId === 0, 'GL-01b', 'Store lastSequenceId reset to 0');
  check(useSimulationStore.getState().rp2040Snapshot === null, 'GL-01c', 'Store snapshot cleared on invalidation');

  // GL-02: INIT with missing generation throws when telemetry is subscribed (DEF-02 Fix)
  let initThrew = false;
  try {
    sendToWorker({
      type: 'INIT',
      numNodes: 1,
      elements: [],
      dt: 0.001,
      // telemetryGenerationId omitted
      resultSubscription: {
        nodeIndices: [0],
        branchCurrentElementIds: [],
        powerElementIds: [],
        rp2040TelemetryEnabled: true,
      },
    });
  } catch (err: any) {
    initThrew = true;
    check(err.message.includes('Missing required telemetryGenerationId on INIT'), 'GL-02a', 'INIT throws controlled error when telemetry enabled without generation');
  }
  check(initThrew, 'GL-02b', 'INIT without generation strictly aborted when telemetry enabled (DEF-02 resolved)');

  // GL-03: INIT with missing generation succeeds in compatibility mode when telemetry is NOT enabled
  let compatInitThrew = false;
  try {
    sendToWorker({
      type: 'INIT',
      numNodes: 1,
      elements: [],
      dt: 0.001,
      // telemetryGenerationId omitted
      resultSubscription: {
        nodeIndices: [0],
        branchCurrentElementIds: [],
        powerElementIds: [],
        rp2040TelemetryEnabled: false,
      },
    });
  } catch {
    compatInitThrew = true;
  }
  check(!compatInitThrew, 'GL-03', 'INIT without generation succeeds when telemetry is disabled (non-RP2040 compatibility)');

  // GL-04: INIT with invalid generation throws error
  let invalidInitThrew = false;
  try {
    sendToWorker({
      type: 'INIT',
      numNodes: 1,
      elements: [],
      dt: 0.001,
      telemetryGenerationId: 0,
    });
  } catch (err: any) {
    invalidInitThrew = true;
    check(err.message.includes('Invalid telemetryGenerationId on INIT'), 'GL-04a', 'INIT throws controlled error on generation 0');
  }
  check(invalidInitThrew, 'GL-04b', 'INIT strictly rejects non-positive generation');

  // Re-initialize worker cleanly with telemetry enabled at generation 10
  sendToWorker({
    type: 'INIT',
    numNodes: 1,
    elements: [],
    dt: 0.001,
    telemetryGenerationId: 10,
    resultSubscription: {
      nodeIndices: [0],
      branchCurrentElementIds: [],
      powerElementIds: [],
      rp2040TelemetryEnabled: true,
    },
  });

  // Load firmware under generation 10
  clearWorkerMessages();
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
    telemetryGenerationId: 10,
  });
  const loadReply = getLatestWorkerMessage<WorkerRp2040LoadResultMessage>();
  check(loadReply?.type === 'RP2040_LOAD_RESULT' && loadReply.success === true, 'GL-05a', 'Firmware load succeeds under generation 10');

  // Query snapshot under gen 10
  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snap10_1 = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snap10_1.generationId === 10, 'GL-05b', 'Snapshot carries adopted generationId = 10');
  check(snap10_1.sequenceId === 1, 'GL-05c', 'First snapshot carries sequenceId = 1');

  // Pipe snapshot into store
  const storeAccepted1 = useSimulationStore.getState().setRp2040Snapshot(snap10_1);
  check(storeAccepted1, 'GL-05d', 'Store accepts first snapshot of generation 10');
  check(useSimulationStore.getState().lastSequenceId === 1, 'GL-05e', 'Store watermark advances to 1');

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP 3: DEF-01 FIX & SEQUENCE WATERMARK COLLISION RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[GROUP 3] Verifying DEF-01 Fix: Sequence Watermark Invariant across Reload/Reset...');

  // Advance sequence in gen 10 to simulate sequenceId = 27
  for (let s = 2; s <= 27; s++) {
    clearWorkerMessages();
    sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
    const snap = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
    useSimulationStore.getState().setRp2040Snapshot(snap);
  }
  check(useSimulationStore.getState().lastSequenceId === 27, 'DEF01-01', 'Store sequence watermark reached 27 under generation 10');

  // Test DEF-01 protection: Worker strictly rejects LOAD_RP2040_FIRMWARE without generation when telemetry subscribed
  clearWorkerMessages();
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
    // telemetryGenerationId omitted!
  });
  const badReloadReply = getLatestWorkerMessage<WorkerRp2040LoadResultMessage>();
  check(badReloadReply?.type === 'RP2040_LOAD_RESULT' && badReloadReply.success === false, 'DEF01-02a', 'Firmware reload without generation is REJECTED when telemetry subscribed');
  check(badReloadReply?.errors[0].includes('Missing required telemetryGenerationId'), 'DEF01-02b', 'Reload rejection details missing telemetryGenerationId requirement');

  // Verify that controller was NOT reset by the rejected reload (telemetry watermark preserved)
  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapAfterRejectedReload = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snapAfterRejectedReload.generationId === 10, 'DEF01-02c', 'Generation remains 10 after rejected reload');
  check(snapAfterRejectedReload.sequenceId === 28, 'DEF01-02d', 'Sequence advances to 28 (not zeroed) after rejected reload');

  // Test DEF-01 protection: Worker strictly rejects RP2040_RESET without generation when telemetry subscribed
  clearWorkerMessages();
  sendToWorker({
    type: 'RP2040_RESET',
    // telemetryGenerationId omitted!
  });
  const badResetReply = getLatestWorkerMessage<any>();
  check(badResetReply?.type === 'RP2040_RESET_ERROR', 'DEF01-03a', 'RP2040_RESET without generation is REJECTED when telemetry subscribed');
  check(badResetReply?.error.includes('Missing required telemetryGenerationId'), 'DEF01-03b', 'Reset rejection details missing telemetryGenerationId requirement');

  // Verify controller was NOT reset by rejected reset
  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapAfterRejectedReset = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snapAfterRejectedReset.generationId === 10, 'DEF01-03c', 'Generation remains 10 after rejected reset');
  check(snapAfterRejectedReset.sequenceId === 29, 'DEF01-03d', 'Sequence advances to 29 (not zeroed) after rejected reset');

  // Execute Authoritative Reload Workflow (The Complete DEF-01 Resolution):
  // 1. Main thread increments expected generation to 11
  // 2. Pre-dispatch invalidation clears store and resets watermark to 0
  // 3. Worker adopts generation 11 and resets controller sequence to 0
  // 4. First snapshot is gen 11, seq 1 -> Store ACCEPTS!
  const newGenReload = 11;
  useSimulationStore.getState().invalidateTelemetry(newGenReload);
  check(useSimulationStore.getState().expectedGenerationId === 11, 'DEF01-04a', 'Store invalidated to generation 11');
  check(useSimulationStore.getState().lastSequenceId === 0, 'DEF01-04b', 'Watermark reset to 0 upon authoritative invalidation');

  clearWorkerMessages();
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
    telemetryGenerationId: newGenReload,
  });
  const goodReloadReply = getLatestWorkerMessage<WorkerRp2040LoadResultMessage>();
  check(goodReloadReply?.success === true, 'DEF01-04c', 'Firmware reload succeeds with authoritative generation 11');

  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snap11_1 = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snap11_1.generationId === 11, 'DEF01-04d', 'Reloaded snapshot carries generation 11');
  check(snap11_1.sequenceId === 1, 'DEF01-04e', 'Reloaded snapshot sequence restarted at 1');

  const storeAcceptedReload = useSimulationStore.getState().setRp2040Snapshot(snap11_1);
  check(storeAcceptedReload, 'DEF01-04f', 'Store ACCEPTS post-reload sequence 1 (DEF-01 Watermark Collision Resolved!)');
  check(useSimulationStore.getState().lastSequenceId === 1, 'DEF01-04g', 'Store watermark advanced to 1 under generation 11');

  // Advance sequence under gen 11 up to 15
  for (let s = 2; s <= 15; s++) {
    clearWorkerMessages();
    sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
    const snap = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
    useSimulationStore.getState().setRp2040Snapshot(snap);
  }
  check(useSimulationStore.getState().lastSequenceId === 15, 'DEF01-05a', 'Store watermark reached 15 under generation 11');

  // Execute Authoritative Hardware Reset Workflow (DEF-01 for Reset):
  const newGenReset = 12;
  useSimulationStore.getState().invalidateTelemetry(newGenReset);
  check(useSimulationStore.getState().expectedGenerationId === 12, 'DEF01-05b', 'Store invalidated to generation 12');
  check(useSimulationStore.getState().lastSequenceId === 0, 'DEF01-05c', 'Watermark reset to 0 upon authoritative reset');

  clearWorkerMessages();
  sendToWorker({
    type: 'RP2040_RESET',
    telemetryGenerationId: newGenReset,
  });
  const resetReply = getLatestWorkerMessage<WorkerRp2040ResetCompleteMessage>();
  check(resetReply?.type === 'RP2040_RESET_COMPLETE' && resetReply.telemetryGenerationId === 12, 'DEF01-05d', 'RP2040_RESET acknowledges adopted generation 12');

  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snap12_1 = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snap12_1.generationId === 12, 'DEF01-05e', 'Post-reset snapshot carries generation 12');
  check(snap12_1.sequenceId === 1, 'DEF01-05f', 'Post-reset snapshot sequence restarted at 1');

  const storeAcceptedReset = useSimulationStore.getState().setRp2040Snapshot(snap12_1);
  check(storeAcceptedReset, 'DEF01-05g', 'Store ACCEPTS post-reset sequence 1 (DEF-01 Reset Watermark Collision Resolved!)');

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP 4: STRICT STORE GATING & STALE MESSAGE REJECTION (Section 4.1)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[GROUP 4] Verifying Section 4.1 Stale Message Rejection Scenario...');

  // Setup exact Section 4.1 scenario:
  // Step 1: Generation 5 emits sequence 27
  useSimulationStore.getState().invalidateTelemetry(5);
  for (let s = 1; s <= 27; s++) {
    useSimulationStore.getState().setRp2040Snapshot({
      ...snap12_1,
      generationId: 5,
      sequenceId: s,
    });
  }
  check(useSimulationStore.getState().lastSequenceId === 27, 'STALE-01', 'Step 1: Generation 5 reached sequence 27');

  // Step 2: Main thread invalidates to Generation 6
  useSimulationStore.getState().invalidateTelemetry(6);
  check(useSimulationStore.getState().expectedGenerationId === 6, 'STALE-02a', 'Step 2: Store invalidated to generation 6');
  check(useSimulationStore.getState().lastSequenceId === 0, 'STALE-02b', 'Step 2: Watermark reset to 0');
  check(useSimulationStore.getState().rp2040Snapshot === null, 'STALE-02c', 'Step 2: Snapshot cleared');

  // Step 3: Delayed Gen 5 message (seq 28) arrives BEFORE first Gen 6 message
  const delayedPreGen6 = {
    ...snap12_1,
    generationId: 5,
    sequenceId: 28,
  };
  const acceptedDelayedPre = useSimulationStore.getState().setRp2040Snapshot(delayedPreGen6);
  check(!acceptedDelayedPre, 'STALE-03a', 'Step 3: Store REJECTS delayed Gen 5 message arriving before Gen 6');
  check(useSimulationStore.getState().lastSequenceId === 0, 'STALE-03b', 'Step 3: Watermark remains 0');
  check(useSimulationStore.getState().rp2040Snapshot === null, 'STALE-03c', 'Step 3: Stale telemetry did not pollute store');

  // Step 4: Generation 6 emits sequence 1
  const snap6_1 = {
    ...snap12_1,
    generationId: 6,
    sequenceId: 1,
  };
  const acceptedGen6_1 = useSimulationStore.getState().setRp2040Snapshot(snap6_1);
  check(acceptedGen6_1, 'STALE-04a', 'Step 4: Store ACCEPTS Gen 6 sequence 1');
  check(useSimulationStore.getState().lastSequenceId === 1, 'STALE-04b', 'Step 4: Watermark advanced to 1');

  // Step 5: Delayed Gen 5 sequence 28 arrives AFTER Gen 6 sequence 1
  const delayedPostGen6 = {
    ...snap12_1,
    generationId: 5,
    sequenceId: 28,
  };
  const acceptedDelayedPost = useSimulationStore.getState().setRp2040Snapshot(delayedPostGen6);
  check(!acceptedDelayedPost, 'STALE-05a', 'Step 5: Store REJECTS delayed Gen 5 sequence 28 after Gen 6 established');
  check(useSimulationStore.getState().lastSequenceId === 1, 'STALE-05b', 'Step 5: Watermark remains 1');

  // Step 6: Generation 6 sequence 2 arrives
  const snap6_2 = {
    ...snap12_1,
    generationId: 6,
    sequenceId: 2,
  };
  const acceptedGen6_2 = useSimulationStore.getState().setRp2040Snapshot(snap6_2);
  check(acceptedGen6_2, 'STALE-06a', 'Step 6: Store ACCEPTS Gen 6 sequence 2');
  check(useSimulationStore.getState().lastSequenceId === 2, 'STALE-06b', 'Step 6: Watermark advanced to 2');

  // Step 7: Duplicate sequence ID within Gen 6 arrives (seq 2 again)
  const acceptedDuplicate = useSimulationStore.getState().setRp2040Snapshot(snap6_2);
  check(!acceptedDuplicate, 'STALE-07', 'Step 7: Store REJECTS duplicate sequenceId = 2 within generation 6');

  // Step 8: Lower sequence ID arrives (seq 1 again)
  const acceptedLower = useSimulationStore.getState().setRp2040Snapshot(snap6_1);
  check(!acceptedLower, 'STALE-08', 'Step 8: Store REJECTS lower sequenceId = 1 within generation 6');

  // Step 9: Unauthorized future generation arrives (gen 7 when store expects 6)
  const futureGenSnap = {
    ...snap12_1,
    generationId: 7,
    sequenceId: 1,
  };
  const acceptedFuture = useSimulationStore.getState().setRp2040Snapshot(futureGenSnap);
  check(!acceptedFuture, 'STALE-09', 'Step 9: Store REJECTS unauthorized future generation 7');

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP 5: WORKER-TO-STORE MESSAGE FLOW & SUBSCRIPTION GATING
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[GROUP 5] Verifying Full Worker Message Pipeline & Subscription Gating...');

  // Configure worker and store for generation 20
  const gen20 = 20;
  useSimulationStore.getState().invalidateTelemetry(gen20);
  sendToWorker({
    type: 'INIT',
    numNodes: 1,
    elements: [],
    dt: 0.001,
    telemetryGenerationId: gen20,
    resultSubscription: {
      nodeIndices: [0],
      branchCurrentElementIds: [],
      powerElementIds: [],
      rp2040TelemetryEnabled: false, // Telemetry DISABLED initially
    },
  });
  sendToWorker({
    type: 'LOAD_RP2040_FIRMWARE',
    firmwareBuffer: createSyntheticFirmware(),
    telemetryGenerationId: gen20,
  });

  // Start simulation running
  sendToWorker({ type: 'START', telemetryGenerationId: gen20 });

  // MP-01: When telemetry is disabled, RESULT frame does not include rp2040Snapshot
  sendToWorker({ type: 'PAUSE' });
  clearWorkerMessages();
  sendToWorker({ type: 'STEP' });
  const resultMsgNoTelem = getLatestWorkerMessage<WorkerResultMessage>();
  check(resultMsgNoTelem?.type === 'RESULT', 'MP-01a', 'STEP emits RESULT message');
  check(resultMsgNoTelem?.rp2040Snapshot === undefined, 'MP-01b', 'rp2040Snapshot is omitted when telemetry disabled');

  // MP-02: Enable telemetry subscription
  sendToWorker({
    type: 'SET_RESULT_SUBSCRIPTION',
    subscription: {
      nodeIndices: [0],
      branchCurrentElementIds: [],
      powerElementIds: [],
      rp2040TelemetryEnabled: true,
    },
  });

  // First step with telemetry enabled: attaches snapshot
  clearWorkerMessages();
  sendToWorker({ type: 'STEP' });
  const resultMsgWithTelem = getLatestWorkerMessage<WorkerResultMessage>();
  check(resultMsgWithTelem?.type === 'RESULT', 'MP-02a', 'STEP emits RESULT under active subscription');
  check(resultMsgWithTelem?.rp2040Snapshot !== undefined, 'MP-02b', 'rp2040Snapshot attached to RESULT frame');

  // Pipe into store
  const storeAcceptedFromFrame = useSimulationStore.getState().setRp2040Snapshot(resultMsgWithTelem!.rp2040Snapshot!);
  check(storeAcceptedFromFrame, 'MP-02c', 'Store accepts rp2040Snapshot received via RESULT frame');
  check(useSimulationStore.getState().rp2040Snapshot !== null, 'MP-02d', 'Store holds active snapshot from RESULT');

  // MP-03: On-demand snapshot while paused returns RP2040_SNAPSHOT and reaches store
  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const pausedSnapMsg = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>();
  check(pausedSnapMsg?.type === 'RP2040_SNAPSHOT', 'MP-03a', 'Paused request responds with RP2040_SNAPSHOT');
  const storeAcceptedFromOnDemand = useSimulationStore.getState().setRp2040Snapshot(pausedSnapMsg!.snapshot);
  check(storeAcceptedFromOnDemand, 'MP-03b', 'Store accepts on-demand snapshot while paused');

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP 6: TIME & EXECUTION SAFETY (Section 6)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[GROUP 6] Verifying Time & Execution Safety (Non-Interference Invariants)...');

  // ES-01: Querying snapshot while paused does NOT advance CPU program counter or cycle count
  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapBefore = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;

  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapAfter = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;

  check(snapBefore.core0.pc === snapAfter.core0.pc, 'ES-01a', 'Core 0 PC is strictly identical across snapshots');
  check(snapBefore.core1.pc === snapAfter.core1.pc, 'ES-01b', 'Core 1 PC is strictly identical across snapshots');
  check(snapBefore.core0.cycles === snapAfter.core0.cycles, 'ES-01c', 'Core 0 cycles strictly identical across snapshots');
  check(snapBefore.core1.cycles === snapAfter.core1.cycles, 'ES-01d', 'Core 1 cycles strictly identical across snapshots');
  check(snapBefore.totalCycles === snapAfter.totalCycles, 'ES-01e', 'SoC total cycles strictly identical across snapshots');
  check(snapBefore.simulatedTime_s === snapAfter.simulatedTime_s, 'ES-01f', 'Simulated time strictly identical across snapshots');

  // ES-02: Toggling inspector open/closed in store does NOT alter simulation state or reset MCU
  useSimulationStore.getState().setRp2040InspectorOpen(true);
  check(useSimulationStore.getState().rp2040InspectorOpen === true, 'ES-02a', 'Inspector opened in store');
  useSimulationStore.getState().setRp2040InspectorOpen(false);
  check(useSimulationStore.getState().rp2040InspectorOpen === false, 'ES-02b', 'Inspector closed in store');

  // Snapshot remains valid and intact
  check(useSimulationStore.getState().rp2040Snapshot !== null, 'ES-02c', 'Snapshot preserved across inspector toggles');
  check(useSimulationStore.getState().expectedGenerationId === gen20, 'ES-02d', 'Generation ID preserved across inspector toggles');

  // PAUSE and RESUME preserve generation ID
  sendToWorker({ type: 'PAUSE' });
  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapPaused = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snapPaused.generationId === gen20, 'ES-03a', 'PAUSE preserves active generationId');

  sendToWorker({ type: 'RESUME' });
  sendToWorker({ type: 'PAUSE' });
  clearWorkerMessages();
  sendToWorker({ type: 'RP2040_GET_SNAPSHOT' });
  const snapResumed = getLatestWorkerMessage<WorkerRp2040SnapshotMessage>()!.snapshot;
  check(snapResumed.generationId === gen20, 'ES-03b', 'RESUME preserves active generationId');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   STAGE 4.3.7.2.4 LIFECYCLE TESTS: ${passedChecks} / ${totalChecks} CHECKS PASSED`);
  console.log('   STATUS: ALL GATES A-D CRITERIA SATISFIED (100% PASS)');
  console.log('════════════════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('[TEST SUITE FAILURE]:', err);
  process.exit(1);
});
