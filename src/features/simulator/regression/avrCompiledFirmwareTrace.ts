import type { AvrWorkloadSnapshot } from '../../../store/simulationStore';
import type { CanvasNode, Wire } from '../../../types/domain';
import { hydrateCanvasNode } from '../../canvas/componentFactory';
import {
  evaluateAvrPeripheralCoverage,
  type AvrPeripheralCoverageCheck,
  type AvrRuntimeTraceSnapshot,
} from '../avrRuntimeTrace';
import type { SimulationFidelityMode } from '../simulationModels';

export const AVR_COMPILED_TRACE_ID = 'compiled-atmega328p-responsiveness-v1';
export const AVR_COMPILED_TRACE_DURATION_MS = 3_000;
export const AVR_INPUT_LATENCY_TARGET_MS = 50;
export const AVR_FRAME_TIME_TARGET_MS = 50;

export const AVR_COMPILED_TRACE_FIRMWARE = `
#include <Wire.h>

bool gpioState = false;
uint8_t pwmDuty = 16;

void setup() {
  pinMode(13, OUTPUT);
  pinMode(3, OUTPUT);
  Serial.begin(115200);
  Wire.begin();
}

void loop() {
  gpioState = !gpioState;
  digitalWrite(13, gpioState ? HIGH : LOW);
  analogWrite(3, pwmDuty);
  pwmDuty += 17;

  int adcValue = analogRead(A0);
  Wire.beginTransmission(0x27);
  Wire.write((uint8_t)0x08);
  Wire.write((uint8_t)(adcValue & 0xff));
  Wire.endTransmission();

  Serial.print("VF,");
  Serial.println(adcValue);
  delay(5);
}
`;

export interface DistributionSummary {
  count: number;
  averageMs: number;
  p95Ms: number;
  maximumMs: number;
}

export interface AvrWorkloadTraceSummary {
  sampleCount: number;
  averageInstructionsPerSecond: number;
  averageEmulatedClockHz: number;
  maximumMainThreadUtilizationPercent: number;
  maximumPendingCycleLagMs: number;
  maximumSliceMs: number;
  maximumDeadlineOvershootMs: number;
  budgetLimitedObserved: boolean;
  hardLimitReached: boolean;
  backgroundStallCount: number;
}

export interface AvrCompiledFirmwareModeTrace {
  fidelityMode: SimulationFidelityMode;
  completed: boolean;
  measuredDurationMs: number;
  frameTime: DistributionSummary;
  inputLatency: DistributionSummary;
  workload: AvrWorkloadTraceSummary;
  peripherals: AvrRuntimeTraceSnapshot;
  peripheralChecks: AvrPeripheralCoverageCheck[];
  responsive: boolean;
}

export interface AvrCompiledFirmwareTrace {
  fixtureId: typeof AVR_COMPILED_TRACE_ID;
  capturedAt: string;
  compiler: string;
  targetBoard: 'ARDUINO_UNO';
  source: string;
  durationPerModeMs: number;
  inputLatencyTargetMs: number;
  frameTimeTargetMs: number;
  completed: boolean;
  modes: AvrCompiledFirmwareModeTrace[];
}

export interface AvrBrowserTraceRuntime {
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  scheduleInputProbe: (callback: () => void) => void;
  getWorkload: () => AvrWorkloadSnapshot;
  getPeripheralSnapshot: () => AvrRuntimeTraceSnapshot;
  shouldStop: () => boolean;
}

function distribution(values: number[]): DistributionSummary {
  if (values.length === 0) return { count: 0, averageMs: 0, p95Ms: 0, maximumMs: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return {
    count: values.length,
    averageMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95Ms: sorted[p95Index],
    maximumMs: sorted[sorted.length - 1],
  };
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function createAvrCompiledFirmwareFixture(): { nodes: CanvasNode[]; wires: Wire[] } {
  return {
    nodes: [
      hydrateCanvasNode({
        id: 'avr_trace_board',
        name: 'Compiled trace Uno',
        type: 'ARDUINO_UNO',
        x: 180,
        y: 120,
      }),
      hydrateCanvasNode({
        id: 'avr_trace_lcd',
        name: 'Compiled trace I2C target',
        type: 'DISPLAY_LCD_I2C',
        x: 520,
        y: 160,
        properties: { i2cAddress: '0x27' },
      }),
    ],
    wires: [],
  };
}

export async function captureAvrCompiledFirmwareMode(
  fidelityMode: SimulationFidelityMode,
  runtime: AvrBrowserTraceRuntime,
  durationMs = AVR_COMPILED_TRACE_DURATION_MS,
): Promise<AvrCompiledFirmwareModeTrace> {
  const startedAtMs = runtime.now();
  let previousFrameAtMs: number | null = null;
  let lastInputProbeAtMs = Number.NEGATIVE_INFINITY;
  const frameTimes: number[] = [];
  const inputLatencies: number[] = [];
  const workloadSamples: AvrWorkloadSnapshot[] = [];

  const completed = await new Promise<boolean>((resolve) => {
    const frame = (timestampMs: number) => {
      const nowMs = runtime.now();
      if (previousFrameAtMs !== null) frameTimes.push(Math.max(0, timestampMs - previousFrameAtMs));
      previousFrameAtMs = timestampMs;
      workloadSamples.push(runtime.getWorkload());

      if (nowMs - lastInputProbeAtMs >= 100) {
        lastInputProbeAtMs = nowMs;
        const inputScheduledAtMs = runtime.now();
        runtime.scheduleInputProbe(() => inputLatencies.push(Math.max(0, runtime.now() - inputScheduledAtMs)));
      }

      if (runtime.shouldStop()) {
        resolve(false);
      } else if (nowMs - startedAtMs >= durationMs) {
        resolve(true);
      } else {
        runtime.requestFrame(frame);
      }
    };
    runtime.requestFrame(frame);
  });

  const peripherals = runtime.getPeripheralSnapshot();
  const peripheralChecks = evaluateAvrPeripheralCoverage(peripherals);
  const frameTime = distribution(frameTimes);
  const inputLatency = distribution(inputLatencies);
  const workload: AvrWorkloadTraceSummary = {
    sampleCount: workloadSamples.length,
    averageInstructionsPerSecond: average(workloadSamples.map((sample) => sample.instructionsPerSecond).filter((value) => value > 0)),
    averageEmulatedClockHz: average(workloadSamples.map((sample) => sample.emulatedClockHz).filter((value) => value > 0)),
    maximumMainThreadUtilizationPercent: Math.max(0, ...workloadSamples.map((sample) => sample.mainThreadUtilizationPercent)),
    maximumPendingCycleLagMs: Math.max(0, ...workloadSamples.map((sample) => sample.pendingCycleLagMs)),
    maximumSliceMs: Math.max(0, ...workloadSamples.map((sample) => sample.maximumSliceMs)),
    maximumDeadlineOvershootMs: Math.max(0, ...workloadSamples.map((sample) => sample.maximumDeadlineOvershootMs)),
    budgetLimitedObserved: workloadSamples.some((sample) => sample.budgetLimited),
    hardLimitReached: workloadSamples.some((sample) => sample.hardLimitReached),
    backgroundStallCount: Math.max(0, ...workloadSamples.map((sample) => sample.backgroundStallCount)),
  };
  const responsive = completed
    && frameTime.count > 0
    && inputLatency.count > 0
    && frameTime.p95Ms <= AVR_FRAME_TIME_TARGET_MS
    && inputLatency.p95Ms <= AVR_INPUT_LATENCY_TARGET_MS
    && !workload.hardLimitReached
    && peripheralChecks.every((check) => check.passed);

  return {
    fidelityMode,
    completed,
    measuredDurationMs: Math.max(0, runtime.now() - startedAtMs),
    frameTime,
    inputLatency,
    workload,
    peripherals,
    peripheralChecks,
    responsive,
  };
}
