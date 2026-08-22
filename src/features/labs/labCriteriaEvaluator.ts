import type { CanvasNode, Wire } from '../../types/domain';
import type { CanvasNodeSeed } from '../canvas/componentFactory';

export interface LabObjective {
  currentTolerance_mA?: number;
  description: string;
  frequencyTolerance_hz?: number;
  id: string;
  maxCurrent_mA?: number;
  maxDuty?: number;
  minDuty?: number;
  minLedsLit?: number;
  requireLedLit?: boolean;
  requireShiftData?: boolean;
  targetCurrent_mA?: number;
  targetFrequency_hz?: number;
  targetVoltage?: number;
  voltageTolerance?: number;
}

export interface LabChallenge {
  category: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedMinutes: number;
  hints: string[];
  id: string;
  initialCircuit: {
    nodes: CanvasNodeSeed[];
    wires: Wire[];
  };
  objectives: LabObjective[];
  theoryExplanation: string;
  title: string;
}

export interface EvaluationResult {
  allPassed: boolean;
  objectiveResults: Array<{
    currentValueText: string;
    objectiveId: string;
    passed: boolean;
  }>;
}

type AstableEstimate = {
  dutyCycle: number;
  frequencyHz: number;
};

type NetIndex = {
  netOf: (nodeId: string, pinId: string) => string;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildNetIndex(nodes: CanvasNode[], wires: Wire[]): NetIndex {
  const parent = new Map<string, string>();
  const keyFor = (nodeId: string, pinId: string) => `${nodeId}:${pinId}`;

  const ensure = (key: string) => {
    if (!parent.has(key)) parent.set(key, key);
  };

  const find = (key: string): string => {
    ensure(key);
    const parentKey = parent.get(key);
    if (!parentKey || parentKey === key) return key;
    const root = find(parentKey);
    parent.set(key, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  nodes.forEach((node) => node.pins.forEach((pin) => ensure(keyFor(node.id, pin.id))));
  wires.forEach((wire) => {
    union(keyFor(wire.fromNodeId, wire.fromPinId), keyFor(wire.toNodeId, wire.toPinId));
  });

  return {
    netOf: (nodeId, pinId) => find(keyFor(nodeId, pinId)),
  };
}

function firstTwoPinIds(node: CanvasNode): [string, string] | null {
  const first = node.pins[0]?.id;
  const second = node.pins[1]?.id;
  return first && second ? [first, second] : null;
}

function nodeConnectsBetween(node: CanvasNode, netIndex: NetIndex, netA: string, netB: string): boolean {
  const pinIds = firstTwoPinIds(node);
  if (!pinIds) return false;

  const pinNetA = netIndex.netOf(node.id, pinIds[0]);
  const pinNetB = netIndex.netOf(node.id, pinIds[1]);

  return (pinNetA === netA && pinNetB === netB) || (pinNetA === netB && pinNetB === netA);
}

function findResistorBetween(nodes: CanvasNode[], netIndex: NetIndex, netA: string, netB: string): number | null {
  const resistor = nodes.find(
    (node) => node.type === 'RESISTOR' && nodeConnectsBetween(node, netIndex, netA, netB)
  );
  return resistor ? finiteNumber(resistor.properties.resistance) : null;
}

function findCapacitorBetween(nodes: CanvasNode[], netIndex: NetIndex, netA: string, netB: string): number | null {
  const capacitor = nodes.find(
    (node) => node.type.includes('CAPACITOR') && nodeConnectsBetween(node, netIndex, netA, netB)
  );
  return capacitor ? finiteNumber(capacitor.properties.capacitance) : null;
}

function estimate555Astable(nodes: CanvasNode[], wires: Wire[]): AstableEstimate | null {
  const timer = nodes.find((node) => node.type === 'IC_555_TIMER');
  if (!timer) return null;

  const netIndex = buildNetIndex(nodes, wires);
  const vccNet = netIndex.netOf(timer.id, 'vcc');
  const gndNet = netIndex.netOf(timer.id, 'gnd');
  const dischNet = netIndex.netOf(timer.id, 'disch');
  const trigNet = netIndex.netOf(timer.id, 'trig');
  const threshNet = netIndex.netOf(timer.id, 'thresh');

  if (trigNet !== threshNet) return null;

  const r1 = findResistorBetween(nodes, netIndex, vccNet, dischNet);
  const r2 = findResistorBetween(nodes, netIndex, dischNet, threshNet);
  const capacitance = findCapacitorBetween(nodes, netIndex, threshNet, gndNet);

  if (!r1 || !r2 || !capacitance || r1 <= 0 || r2 <= 0 || capacitance <= 0) return null;

  return {
    dutyCycle: (r1 + r2) / (r1 + 2 * r2),
    frequencyHz: 1.44 / ((r1 + 2 * r2) * capacitance),
  };
}

export class LabCriteriaEvaluator {
  public static evaluate(
    challenge: LabChallenge,
    nodes: CanvasNode[],
    wires: Wire[],
    nodeVoltages: Record<string, number>,
    branchCurrents: Record<string, number>,
    isSimulating: boolean
  ): EvaluationResult {
    if (!isSimulating) {
      return {
        allPassed: false,
        objectiveResults: challenge.objectives.map((objective) => ({
          currentValueText: 'Simulation stopped',
          objectiveId: objective.id,
          passed: false,
        })),
      };
    }

    const astableEstimate = estimate555Astable(nodes, wires);

    const results = challenge.objectives.map((objective) => {
      let passed = false;
      let currentValueText = 'Evaluating...';

      if (objective.targetVoltage !== undefined) {
        const tolerance = objective.voltageTolerance ?? 0.2;
        const multimeter = nodes.find((node) => node.type === 'MULTIMETER');
        let measuredVoltage = finiteNumber(multimeter?.properties.measuredVoltage);

        if (measuredVoltage === null) {
          const voltages = Object.values(nodeVoltages).filter((voltage) => voltage > 0.1);
          measuredVoltage = voltages.find((voltage) => Math.abs(voltage - objective.targetVoltage!) <= tolerance)
            ?? voltages[0]
            ?? null;
        }

        if (measuredVoltage !== null) {
          passed = Math.abs(measuredVoltage - objective.targetVoltage) <= tolerance;
          currentValueText = `${measuredVoltage.toFixed(2)}V (target ${objective.targetVoltage}V +/- ${tolerance}V)`;
        } else {
          currentValueText = '0.00V detected';
        }
      }

      if (objective.maxCurrent_mA !== undefined) {
        const currents = Object.values(branchCurrents).map((current) => Math.abs(current) * 1000);
        const maxCurrent = currents.length > 0 ? Math.max(...currents) : 0;
        passed = maxCurrent <= objective.maxCurrent_mA && maxCurrent > 0.01;
        currentValueText = `${maxCurrent.toFixed(1)} mA (max ${objective.maxCurrent_mA} mA)`;
      }

      if (objective.targetCurrent_mA !== undefined) {
        const tolerance = objective.currentTolerance_mA ?? 5;
        const currents = Object.values(branchCurrents).map((current) => Math.abs(current) * 1000);
        const matchedCurrent = currents.find((current) => Math.abs(current - objective.targetCurrent_mA!) <= tolerance);

        if (matchedCurrent !== undefined) {
          passed = true;
          currentValueText = `${matchedCurrent.toFixed(1)} mA (target ${objective.targetCurrent_mA} mA +/- ${tolerance} mA)`;
        } else {
          const highestCurrent = currents.length > 0 ? Math.max(...currents) : 0;
          currentValueText = `${highestCurrent.toFixed(1)} mA`;
        }
      }

      if (objective.requireLedLit) {
        const leds = nodes.filter((node) => node.type.includes('LED'));
        const litCount = leds.filter((led) => led.properties.isLit).length;
        passed = litCount > 0;
        currentValueText = passed ? 'LED is illuminated' : 'LED is off';
      }

      if (objective.requireShiftData) {
        const shiftRegister = nodes.find((node) => node.type.includes('595'));
        const latchValue = finiteNumber(shiftRegister?.properties.latchRegValue)
          ?? finiteNumber(shiftRegister?.properties.shiftValue)
          ?? 0;
        passed = latchValue > 0;
        currentValueText = passed ? `Shift latch = 0x${latchValue.toString(16).toUpperCase()}` : 'Latch empty (0x00)';
      }

      if (objective.minLedsLit !== undefined) {
        const leds = nodes.filter((node) => node.type.includes('LED'));
        const litCount = leds.filter((led) => led.properties.isLit).length;
        passed = litCount >= objective.minLedsLit;
        currentValueText = `${litCount} of ${objective.minLedsLit} required LEDs lit`;
      }

      if (objective.targetFrequency_hz !== undefined) {
        const tolerance = objective.frequencyTolerance_hz ?? 100;
        const measuredFrequency = astableEstimate?.frequencyHz
          ?? finiteNumber(nodes.find((node) => node.type === 'OSCILLOSCOPE')?.properties.frequencyHz);

        if (measuredFrequency !== null && measuredFrequency !== undefined) {
          passed = Math.abs(measuredFrequency - objective.targetFrequency_hz) <= tolerance;
          currentValueText = `${measuredFrequency.toFixed(0)} Hz (target ${objective.targetFrequency_hz} Hz +/- ${tolerance} Hz)`;
        } else {
          currentValueText = 'Timing network incomplete';
        }
      }

      if (objective.minDuty !== undefined || objective.maxDuty !== undefined) {
        const minDuty = objective.minDuty ?? 0;
        const maxDuty = objective.maxDuty ?? 1;
        const measuredDuty = astableEstimate?.dutyCycle
          ?? finiteNumber(nodes.find((node) => node.type === 'OSCILLOSCOPE')?.properties.dutyCycle);

        if (measuredDuty !== null && measuredDuty !== undefined) {
          passed = measuredDuty >= minDuty && measuredDuty <= maxDuty;
          currentValueText = `${(measuredDuty * 100).toFixed(1)}% duty (range ${(minDuty * 100).toFixed(0)}-${(maxDuty * 100).toFixed(0)}%)`;
        } else {
          currentValueText = 'Duty cycle unavailable';
        }
      }

      return {
        currentValueText,
        objectiveId: objective.id,
        passed,
      };
    });

    return {
      allPassed: results.every((result) => result.passed),
      objectiveResults: results,
    };
  }
}
