export type AvrPeripheralKind = 'gpio' | 'timer-pwm' | 'uart' | 'adc' | 'i2c';

export interface AvrRuntimeTraceSnapshot {
  cpuCycles: number;
  pinTransitions: Record<string, number>;
  uartTransmittedBytes: number;
  adcConversions: number;
  i2cStarts: number;
  i2cStops: number;
  i2cConnections: number;
  i2cWrites: number;
  i2cReads: number;
}

export interface AvrPeripheralCoverageCheck {
  kind: AvrPeripheralKind;
  observed: number;
  minimum: number;
  passed: boolean;
}

const idleSnapshot = (): AvrRuntimeTraceSnapshot => ({
  cpuCycles: 0,
  pinTransitions: {},
  uartTransmittedBytes: 0,
  adcConversions: 0,
  i2cStarts: 0,
  i2cStops: 0,
  i2cConnections: 0,
  i2cWrites: 0,
  i2cReads: 0,
});

/** Low-overhead counters used only by explicit AVR diagnostics traces. */
export class AvrRuntimeTraceCollector {
  private enabled = false;
  private snapshot = idleSnapshot();

  start(): void {
    this.enabled = true;
    this.snapshot = idleSnapshot();
  }

  stop(): void {
    this.enabled = false;
  }

  recordPinTransition(pin: string): void {
    if (!this.enabled) return;
    this.snapshot.pinTransitions[pin] = (this.snapshot.pinTransitions[pin] ?? 0) + 1;
  }

  recordUartByte(): void {
    if (this.enabled) this.snapshot.uartTransmittedBytes += 1;
  }

  recordAdcConversion(): void {
    if (this.enabled) this.snapshot.adcConversions += 1;
  }

  recordI2cEvent(kind: 'start' | 'stop' | 'connect' | 'write' | 'read'): void {
    if (!this.enabled) return;
    if (kind === 'start') this.snapshot.i2cStarts += 1;
    else if (kind === 'stop') this.snapshot.i2cStops += 1;
    else if (kind === 'connect') this.snapshot.i2cConnections += 1;
    else if (kind === 'write') this.snapshot.i2cWrites += 1;
    else this.snapshot.i2cReads += 1;
  }

  read(cpuCycles: number): AvrRuntimeTraceSnapshot {
    return {
      ...this.snapshot,
      cpuCycles: Math.max(0, Number.isFinite(cpuCycles) ? cpuCycles : 0),
      pinTransitions: { ...this.snapshot.pinTransitions },
    };
  }
}

export function evaluateAvrPeripheralCoverage(snapshot: AvrRuntimeTraceSnapshot): AvrPeripheralCoverageCheck[] {
  const observations: Array<[AvrPeripheralKind, number, number]> = [
    ['gpio', snapshot.pinTransitions['13'] ?? 0, 2],
    ['timer-pwm', snapshot.pinTransitions['3'] ?? 0, 4],
    ['uart', snapshot.uartTransmittedBytes, 3],
    ['adc', snapshot.adcConversions, 1],
    ['i2c', Math.min(snapshot.i2cStarts, snapshot.i2cConnections, snapshot.i2cWrites, snapshot.i2cStops), 1],
  ];
  return observations.map(([kind, observed, minimum]) => ({
    kind,
    observed,
    minimum,
    passed: observed >= minimum,
  }));
}
