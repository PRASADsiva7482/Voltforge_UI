/**
 * Canonical electrical and actuator models used by the browser simulator.
 *
 * The values here are physical defaults, not UI readings.  Every value can be
 * overridden by a component property so the canvas remains useful for real
 * part variants without duplicating constants across the solver and renderer.
 */

export type SourceWaveform = 'sine' | 'square' | 'triangle';

/**
 * Controls the trade-off between transient/firmware fidelity and responsiveness.
 * Adaptive mode may widen the solver timestep and uses the smaller AVR frame
 * slice; full-fidelity keeps the configured timestep and gives AVR more wall
 * time. Both AVR modes execute every instruction/peripheral tick in order.
 */
export type SimulationFidelityMode = 'adaptive' | 'full-fidelity';

export interface SolverCostProfile {
  numNodes: number;
  voltageSourceCount: number;
  nonlinearElementCount: number;
}

export const SIMULATION_MODELS = Object.freeze({
  clock: Object.freeze({
    framePeriod_s: 1 / 60,
    // Keep the existing runtime default. The solver's constructor has a
    // smaller standalone default, but the worker has historically used 1 ms.
    defaultTimeStep_s: 0.001,
    minAdaptiveTimeStep_s: 0.001,
    maxAdaptiveTimeStep_s: 0.005,
    solverBudget_ms: 8,
    presentationPeriod_ms: 1000 / 15,
    referenceMatrixSize: 24,
    referenceNonlinearElements: 2,
    maxSubstepsPerFrame: 250,
    maxCatchUp_s: 0.05,
  }),
  avr: Object.freeze({
    // AVR8js advances peripherals from CPU cycle counts. A wall-time budget
    // may slow playback, but no firmware cycle is skipped to catch up.
    cpuFrequency_Hz: 16_000_000,
    adaptiveFrameBudget_ms: 4,
    fullFidelityFrameBudget_ms: 8,
    adaptiveMaxCatchUp_ms: 50,
    fullFidelityMaxCatchUp_ms: 100,
    maxFrameDelta_ms: 50,
    timeCheckInstructionInterval: 32,
    maxInstructionsPerSlice: 100_000,
    telemetryPeriod_ms: 250,
  }),
  scope: Object.freeze({
    horizontalDivisions: 10,
    targetSamplesPerScreen: 512,
    pendingSampleCapacity: 1024,
  }),
  circuit: Object.freeze({
    openCircuitResistance: 1e8,
    closedContactResistance: 0.01,
  }),
  transformer: Object.freeze({
    primaryInductance_H: 1,
    turnsRatio: 1,
    coupling: 0.999,
  }),
  diode: Object.freeze({
    saturationCurrent: 1e-12,
    thermalVoltage: 0.02585,
    seriesResistance: 2,
    reverseResistance: 1e9,
  }),
  mosfet: Object.freeze({
    thresholdVoltage: 2,
    transconductance: 4,
    channelLengthModulation: 0.01,
    onResistance: 0.08,
    offResistance: 1e8,
  }),
  opamp: Object.freeze({
    openLoopGain: 100_000,
    idealHeadroom: 0,
    lm358Headroom: 1.5,
  }),
  led: Object.freeze({
    forwardVoltage: 2,
    seriesResistance: 12,
    maximumCurrent_mA: 20,
    lightThreshold_mA: 1,
  }),
  rgbLed: Object.freeze({
    redForwardVoltage: 2,
    greenForwardVoltage: 3.2,
    blueForwardVoltage: 3.2,
  }),
  dcMotor: Object.freeze({
    ratedVoltage: 5,
    windingResistance: 10,
    ratedRpm: 3000,
    startVoltage: 0.5,
    startCurrent_A: 0.001,
    mechanicalTimeConstant_s: 0.15,
  }),
  relay: Object.freeze({
    coilResistance: 70,
    contactResistance: 0.05,
    openContactResistance: 1e8,
    pickupCurrent_A: 0.02,
    inputResistance: 100_000,
    idleResistance: 10_000,
  }),
  servo: Object.freeze({
    minimumSupplyVoltage: 4.5,
    maximumSupplyVoltage: 6,
    minimumAngle: 0,
    maximumAngle: 180,
  }),
  bldc: Object.freeze({
    minimumSupplyVoltage: 6,
    supplyVoltage: 12,
    windingResistance: 5,
    maximumRpm: 12000,
    minimumThrottlePercent: 0,
  }),
  esc: Object.freeze({
    minimumSupplyVoltage: 4.5,
    powerDrawResistance: 100,
    signalInputResistance: 100_000,
    phaseLoadResistance: 1_000,
  }),
  display: Object.freeze({
    lcdMinimumSupplyVoltage: 4.5,
    oledMinimumSupplyVoltage: 2.7,
  }),
  digitalIc: Object.freeze({
    // 3 V is the shared valid supply floor for the catalog's 74HC and CD4017
    // models. Output sources use the solved rail voltage, not a fixed 5 V.
    minimumSupplyVoltage: 3,
  }),
  stepper: Object.freeze({
    stepsPerRevolution: 200,
    gearedStepsPerRevolution: 2048,
    windingResistance: 10,
    minimumPhaseCurrent_A: 0.05,
    driverPhaseResistance: 50,
  }),
  meter: Object.freeze({
    voltageInputResistance: 10e6,
    currentShuntResistance: 0.1,
    resistanceTestVoltage: 1,
    resistanceTestSeriesResistance: 1_000,
    maximumResistance_ohm: 100e6,
    oscilloscopeInputResistance: 1e6,
    rmsWindowSamples: 256,
  }),
  audio: Object.freeze({
    buzzerFrequencyHz: 440,
    maxFrequencyHz: 12_000,
    maxVolume: 0.15,
  }),
  thermal: Object.freeze({
    defaultResistorPower_W: 0.25,
    warningRatio: 0.5,
    dangerRatio: 0.8,
    criticalRatio: 1,
  }),
  sources: Object.freeze({
    battery9V: 9,
    batteryAA: 1.5,
    supply3V3: 3.3,
    supply5V: 5,
    supply12V: 12,
    acAmplitude: 1,
    acFrequencyHz: 1000,
  }),
  sensors: Object.freeze({
    ldrDarkResistance: 100_000,
    ldrLightResistance: 500,
    soilMoisture_percent: 50,
  }),
});

const BRANCH_VARIABLE_ELEMENT_TYPES = new Set(['VOLTAGE_SOURCE', 'AMMETER', 'MOTOR_DC', 'OPAMP']);
const NONLINEAR_ELEMENT_TYPES = new Set([
  'DIODE',
  'BJT',
  'MOSFET',
  'MOTOR_DC',
  'OPAMP',
  'BEHAVIORAL_555',
]);

/**
 * Estimate the MNA matrix cost without making the solver depend on canvas
 * types. Dense elimination grows roughly with the square of matrix size per
 * iteration, while nonlinear devices add Newton work. This is deliberately a
 * conservative, bounded heuristic: the wall-clock budget remains the final
 * authority in the worker.
 */
export function solverCostProfile(
  elements: ReadonlyArray<{ type: string }>,
  numNodes: number,
): SolverCostProfile {
  return {
    numNodes: Math.max(0, Math.floor(numNodes)),
    voltageSourceCount: elements.reduce(
      (count, element) => count + (BRANCH_VARIABLE_ELEMENT_TYPES.has(element.type) ? 1 : 0),
      0,
    ),
    nonlinearElementCount: elements.reduce(
      (count, element) => count + (NONLINEAR_ELEMENT_TYPES.has(element.type) ? 1 : 0),
      0,
    ),
  };
}

/** Select an adaptive physical timestep for the supplied MNA circuit cost. */
export function selectAdaptiveTimeStep(
  profile: SolverCostProfile,
  requestedTimeStep_s: number,
): number {
  const clock = SIMULATION_MODELS.clock;
  const requested = Number.isFinite(requestedTimeStep_s)
    ? Math.max(clock.minAdaptiveTimeStep_s, requestedTimeStep_s)
    : clock.defaultTimeStep_s;
  const matrixSize = Math.max(1, profile.numNodes + profile.voltageSourceCount);
  const matrixScale = matrixSize / clock.referenceMatrixSize;
  const nonlinearScale = Math.sqrt(
    1 + profile.nonlinearElementCount / clock.referenceNonlinearElements,
  );
  const costScale = Math.max(1, matrixScale * nonlinearScale);

  return Math.min(
    clock.maxAdaptiveTimeStep_s,
    Math.max(clock.minAdaptiveTimeStep_s, requested * costScale),
  );
}

export function numericProperty(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().replace(',', '.').replace(/Ω/g, 'ohm');
    const match = normalized.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[\s]*([a-zµμ]+)?/i);
    if (match) {
      const base = Number(match[1]);
      if (Number.isFinite(base)) {
        const suffix = match[2] || '';
        const multiplier = suffixMultiplier(suffix);
        if (multiplier !== null) return base * multiplier;
        if (/^(?:v|a|amp|amps|ohm|ohms|hz|s|f|w|%)?$/i.test(suffix)) return base;
      }
    }
  }
  return fallback;
}

function suffixMultiplier(suffix: string): number | null {
  if (!suffix) return 1;
  if (/^(?:meg|mega)[a-z]*$/i.test(suffix) || /^M[a-z]*$/.test(suffix)) return 1e6;
  if (/^k[a-z]*$/i.test(suffix)) return 1e3;
  if (/^m[a-z]*$/.test(suffix)) return 1e-3;
  if (/^(?:u|µ|μ)[a-z]*$/i.test(suffix)) return 1e-6;
  if (/^n[a-z]*$/i.test(suffix)) return 1e-9;
  if (/^p[a-z]*$/i.test(suffix)) return 1e-12;
  if (/^f[a-z]*$/i.test(suffix)) return 1e-15;
  return null;
}

export function resistanceOhms(value: unknown, fallback: number): number {
  return Math.max(0, numericProperty(value, fallback));
}

export function capacitanceFarads(value: unknown, fallback: number): number {
  return Math.max(1e-15, numericProperty(value, fallback));
}

export function inductanceHenrys(value: unknown, fallback: number): number {
  return Math.max(1e-15, numericProperty(value, fallback));
}

export function booleanProperty(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(false|off|disabled|0)$/i.test(value.trim())) return false;
    if (/^(true|on|enabled|1)$/i.test(value.trim())) return true;
  }
  return fallback;
}

export function ledForwardVoltage(color: 'red' | 'green' | 'blue' = 'red', properties: Record<string, unknown> = {}): number {
  const defaults = color === 'red'
    ? SIMULATION_MODELS.rgbLed.redForwardVoltage
    : color === 'green'
      ? SIMULATION_MODELS.rgbLed.greenForwardVoltage
      : SIMULATION_MODELS.rgbLed.blueForwardVoltage;
  return Math.max(0.1, numericProperty(properties.forwardVoltage, defaults));
}

export function ledSeriesResistance(properties: Record<string, unknown> = {}): number {
  return Math.max(0.1, numericProperty(properties.seriesResistance, SIMULATION_MODELS.led.seriesResistance));
}

export function ledMaximumCurrent_mA(properties: Record<string, unknown> = {}): number {
  const value = properties.maxCurrent;

  // `numericProperty` intentionally returns SI units, so `20mA` becomes
  // `0.02`. This helper is named in mA and is consumed as mA by the netlist
  // builder; parsing through numericProperty here used to turn that value
  // into 0.1mA after the safety floor and made ordinary LEDs never light.
  let current_mA: number = SIMULATION_MODELS.led.maximumCurrent_mA;
  if (typeof value === 'number' && Number.isFinite(value)) {
    current_mA = value;
  } else if (typeof value === 'string' && value.trim()) {
    const match = value.trim().replace(',', '.').match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[\s]*([a-zµμ]*)$/i);
    if (match) {
      const base = Number(match[1]);
      const unit = match[2].toLowerCase();
      if (Number.isFinite(base)) {
        if (!unit || /^ma|milliamp/.test(unit)) {
          current_mA = base;
        } else if (/^a|amp/.test(unit)) {
          current_mA = base * 1000;
        } else if (/^(?:u|µ|μ)a|microamp/.test(unit)) {
          current_mA = base / 1000;
        } else if (/^na|nanoamp/.test(unit)) {
          current_mA = base / 1_000_000;
        }
      }
    }
  }

  return Math.max(0.1, current_mA);
}

export function diodeSeriesResistance(properties: Record<string, unknown> = {}): number {
  return Math.max(0.01, numericProperty(properties.seriesResistance, SIMULATION_MODELS.diode.seriesResistance));
}

export function sourceDefinition(type: string, properties: Record<string, unknown> = {}) {
  const defaults: Record<string, number> = {
    BATTERY_9V: SIMULATION_MODELS.sources.battery9V,
    BATTERY_AA: SIMULATION_MODELS.sources.batteryAA,
    DC_SOURCE_3V3: SIMULATION_MODELS.sources.supply3V3,
    DC_SOURCE_5V: SIMULATION_MODELS.sources.supply5V,
    DC_SOURCE_12V: SIMULATION_MODELS.sources.supply12V,
    POWER_SUPPLY: SIMULATION_MODELS.sources.supply5V,
  };
  const isAc = type === 'AC_FUNCTION_GENERATOR';
  const enabled = booleanProperty(properties.isOn ?? properties.enabled, true);
  const voltage = Math.max(0, numericProperty(properties.voltage, defaults[type] ?? 0));

  return {
    enabled,
    voltage: enabled ? voltage : 0,
    isAc,
    amplitude: Math.max(0, numericProperty(properties.amplitude, SIMULATION_MODELS.sources.acAmplitude)),
    frequencyHz: Math.max(0, numericProperty(properties.frequencyHz ?? properties.frequency, SIMULATION_MODELS.sources.acFrequencyHz)),
    offset: numericProperty(properties.offset, 0),
    waveform: String(properties.waveform || 'sine').toLowerCase() as SourceWaveform,
  };
}

export function isStandaloneSourceType(type: string): boolean {
  return type === 'POWER_SUPPLY'
    || type === 'BATTERY_9V'
    || type === 'BATTERY_AA'
    || type === 'DC_SOURCE_3V3'
    || type === 'DC_SOURCE_5V'
    || type === 'DC_SOURCE_12V'
    || type === 'AC_FUNCTION_GENERATOR';
}

export function waveformValue(
  timeSeconds: number,
  amplitude: number,
  frequencyHz: number,
  offset: number,
  waveform: SourceWaveform,
): number {
  if (frequencyHz <= 0 || amplitude === 0) return offset;
  const phase = (timeSeconds * frequencyHz) % 1;
  if (waveform === 'square') return offset + (phase < 0.5 ? amplitude : -amplitude);
  if (waveform === 'triangle') {
    const normalized = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
    return offset + amplitude * normalized;
  }
  return offset + amplitude * Math.sin(phase * Math.PI * 2);
}

export function sourceVoltageAtTime(
  source: Pick<ReturnType<typeof sourceDefinition>, 'isAc' | 'amplitude' | 'frequencyHz' | 'offset' | 'waveform'> & { voltage?: number },
  timeSeconds: number,
): number {
  if (!source.isAc) return source.voltage ?? 0;
  return waveformValue(timeSeconds, source.amplitude, source.frequencyHz, source.offset, source.waveform);
}
