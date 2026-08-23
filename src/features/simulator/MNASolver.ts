// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Modified Nodal Analysis (MNA) Solver
// Pure TypeScript linear algebra solver for DC & transient circuit analysis.
// ═══════════════════════════════════════════════════════════════════════════

// ── MNA Element Types ────────────────────────────────────────────────────

export type MNAElementType =
  | 'RESISTOR'
  | 'VOLTAGE_SOURCE'
  | 'CURRENT_SOURCE'
  | 'CAPACITOR'
  | 'INDUCTOR'
  | 'TRANSFORMER'
  | 'DIODE'
  | 'BJT'
  | 'MOSFET'
  | 'MOTOR_DC'
  | 'OPAMP'
  | 'AMMETER'
  | 'BEHAVIORAL_555';

export interface MNAElement {
  id: string;
  type: MNAElementType;
  nodeA: number;   // Positive node index (0 = ground)
  nodeB: number;   // Negative node index (0 = ground)
  value: number;   // Resistance (Ω), Voltage (V), Current (A), Capacitance (F)

  // Diode parameters (Shockley model)
  saturationCurrent?: number;  // Is (A), default 1e-12
  thermalVoltage?: number;     // Vt (V), default 0.02585 (≈26mV at 25°C)
  /** Optional piecewise-linear model used for LEDs and indicator diodes. */
  forwardVoltage?: number;
  seriesResistance?: number;
  reverseResistance?: number;
  zenerVoltage?: number;
  zenerResistance?: number;

  /** Metadata for worker-local behavioral devices. */
  controlNode2?: number;
  resetNode?: number;
  outputElementId?: string;
  dischargeElementId?: string;
  behaviorState?: boolean;
  waveform?: {
    isAc: boolean;
    amplitude: number;
    frequencyHz: number;
    offset: number;
    waveform: 'sine' | 'square' | 'triangle';
  };

  // BJT parameters: nodeA=collector, nodeB=emitter, controlNode=base
  controlNode?: number;
  gain?: number;
  pnp?: boolean;
  maxCurrent?: number;

  // MOSFET parameters: nodeA=drain, nodeB=source, controlNode=gate
  thresholdVoltage?: number;
  onResistance?: number;
  offResistance?: number;
  transconductance?: number;
  channelLengthModulation?: number;
  pChannel?: boolean;

  // Dynamic motor parameters: nodeA/nodeB are the external terminals and
  // internalNode is the winding side of the back-EMF source.
  internalNode?: number;
  backEmf?: number;

  // Coupled-inductor transformer parameters. The primary is nodeA/nodeB and
  // the secondary is controlNode/controlNode2.
  secondaryInductance?: number;
  turnsRatio?: number;
  coupling?: number;
  prevSecondaryCurrent?: number;

  // Op-amp parameters: nodeA/nodeB are output terminals, controlNode is the
  // non-inverting input, and controlNode2 is the inverting input.
  minOutputVoltage?: number;
  maxOutputVoltage?: number;
  openLoopGain?: number;
  positiveRailNode?: number;
  negativeRailNode?: number;
  outputHeadroom?: number;

  // Capacitor companion model state
  prevVoltage?: number;  // Voltage across capacitor at previous time step
  prevCurrent?: number;  // Current through capacitor at previous time step
}

export interface MNASolution {
  nodeVoltages: number[];           // Index 0 unused (ground = 0V)
  branchCurrents: Map<string, number>;  // element-id → current (A)
  converged: boolean;
  iterations: number;
}

// ── Gaussian Elimination with Partial Pivoting ──────────────────────────

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-15) return null; // Singular matrix

    // Swap rows
    if (maxRow !== col) {
      [A[col], A[maxRow]] = [A[maxRow], A[col]];
      [b[col], b[maxRow]] = [b[maxRow], b[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let j = col; j < n; j++) {
        A[row][j] -= factor * A[col][j];
      }
      b[row] -= factor * b[col];
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(A[row][row]) < 1e-15) return null;
    let sum = b[row];
    for (let j = row + 1; j < n; j++) {
      sum -= A[row][j] * x[j];
    }
    x[row] = sum / A[row][row];
  }

  return x;
}

// ── MNA Solver Class ────────────────────────────────────────────────────

export class MNASolver {
  private numNodes: number;                 // Excluding ground (node 0)
  private elements: MNAElement[] = [];
  private voltageSources: MNAElement[] = []; // Subset that need branch current vars
  private dt: number;                       // Time step for transient (seconds)

  constructor(numNodes: number, dt = 0.0001) {
    this.numNodes = numNodes;
    this.dt = dt;
  }

  public setTimeStep(dt: number) {
    this.dt = Math.max(1e-7, Math.min(0.1, dt));
  }

  public getTimeStep(): number {
    return this.dt;
  }

  public setElements(elements: MNAElement[]) {
    this.elements = elements;
    this.voltageSources = elements.filter(
    (e) => e.type === 'VOLTAGE_SOURCE'
      || e.type === 'AMMETER'
      || e.type === 'MOTOR_DC'
      || e.type === 'OPAMP'
    );
  }

  /**
   * Solve the circuit using Modified Nodal Analysis.
   *
   * Matrix structure:
   *   [G  B] [v]   [i]
   *   [C  D] [j] = [e]
   *
   * Where:
   *   G = conductance matrix (n × n)
   *   B = voltage source incidence (n × m)
   *   C = transpose of B (m × n)
   *   D = zero (m × m)
   *   v = node voltages
   *   j = branch currents through voltage sources
   *   i = current source contributions
   *   e = voltage source values
   */
  public solve(): MNASolution {
    const n = this.numNodes;
    const m = this.voltageSources.length;
    const size = n + m;

    if (size === 0) {
      return { nodeVoltages: [0], branchCurrents: new Map(), converged: true, iterations: 0 };
    }

    // Build the matrix with Newton-Raphson iterations for nonlinear elements (diodes)
    const maxIter = 50;
    const tolerance = 1e-6;
    let prevSolution: number[] | null = null;
    let iterations = 0;

    for (let iter = 0; iter < maxIter; iter++) {
      iterations = iter + 1;

      // Initialize matrix and RHS
      const A: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
      const b: number[] = new Array(size).fill(0);

      // Real schematics commonly contain intentionally floating pins (AREF,
      // RESET, unused IC pins). A tiny conductance to ground prevents those
      // isolated nets from making the complete MNA matrix singular. This is
      // the standard SPICE gmin technique and is electrically negligible.
      const gmin = 1e-12;
      for (let node = 0; node < n; node++) {
        A[node][node] += gmin;
      }

      // Voltage source index map
      const vsIndex = new Map<string, number>();
      this.voltageSources.forEach((vs, i) => vsIndex.set(vs.id, i));

      // Stamp each element
      for (const elem of this.elements) {
        switch (elem.type) {
          case 'RESISTOR':
            this.stampResistor(A, elem);
            break;
          case 'VOLTAGE_SOURCE':
            this.stampVoltageSource(A, b, elem, vsIndex);
            break;
          case 'CURRENT_SOURCE':
            this.stampCurrentSource(b, elem);
            break;
          case 'AMMETER':
            // Ammeter = 0V voltage source (measures branch current)
            this.stampVoltageSource(A, b, { ...elem, value: 0 }, vsIndex);
            break;
          case 'CAPACITOR':
            this.stampCapacitor(A, b, elem);
            break;
          case 'INDUCTOR':
            this.stampInductor(A, b, elem);
            break;
          case 'TRANSFORMER':
            this.stampTransformer(A, b, elem);
            break;
          case 'DIODE':
            this.stampDiode(A, b, elem, prevSolution);
            break;
          case 'BJT':
            this.stampBjt(A, b, elem, prevSolution);
            break;
          case 'MOSFET':
            this.stampMosfet(A, b, elem, prevSolution);
            break;
          case 'MOTOR_DC':
            this.stampMotor(A, b, elem, vsIndex);
            break;
          case 'OPAMP':
            this.stampOpAmp(A, b, elem, vsIndex, prevSolution);
            break;
          case 'BEHAVIORAL_555':
            // The worker updates the paired output source and discharge
            // resistor before the next solve step. It has no direct stamp.
            break;
        }
      }

      // Deep copy for solving (solver modifies in place)
      const Acopy = A.map((row) => [...row]);
      const bcopy = [...b];

      const solution = solveLinearSystem(Acopy, bcopy);
      if (!solution) {
        return {
          nodeVoltages: new Array(n + 1).fill(0),
          branchCurrents: new Map(),
          converged: false,
          iterations,
        };
      }

      // Check convergence (only matters if we have nonlinear elements)
      const hasNonlinear = this.elements.some((e) =>
        e.type === 'DIODE' || e.type === 'BJT' || e.type === 'MOSFET' || e.type === 'OPAMP'
      );
      if (hasNonlinear && prevSolution) {
        let maxDiff = 0;
        for (let i = 0; i < size; i++) {
          maxDiff = Math.max(maxDiff, Math.abs(solution[i] - prevSolution[i]));
        }
        if (maxDiff < tolerance) {
          return this.buildResult(solution, n, vsIndex, true, iterations);
        }
      } else if (!hasNonlinear) {
        // Linear circuit — one iteration is enough
        return this.buildResult(solution, n, vsIndex, true, 1);
      }

      prevSolution = solution;
    }

    // Did not converge — return last result anyway
    return this.buildResult(prevSolution!, n, new Map(
      this.voltageSources.map((vs, i) => [vs.id, i])
    ), false, iterations);
  }

  // ── Stamp functions ───────────────────────────────────────────────────

  private stampResistor(A: number[][], elem: MNAElement) {
    const g = 1 / Math.max(elem.value, 1e-9); // Conductance (avoid div by zero)
    const { nodeA, nodeB } = elem;

    if (nodeA > 0) A[nodeA - 1][nodeA - 1] += g;
    if (nodeB > 0) A[nodeB - 1][nodeB - 1] += g;
    if (nodeA > 0 && nodeB > 0) {
      A[nodeA - 1][nodeB - 1] -= g;
      A[nodeB - 1][nodeA - 1] -= g;
    }
  }

  private stampVoltageSource(
    A: number[][],
    b: number[],
    elem: MNAElement,
    vsIndex: Map<string, number>
  ) {
    const idx = vsIndex.get(elem.id);
    if (idx === undefined) return;

    this.stampVoltageSourceBetween(A, b, elem.nodeA, elem.nodeB, elem.value, idx);
  }

  private stampVoltageSourceBetween(
    A: number[][],
    b: number[],
    nodeA: number,
    nodeB: number,
    value: number,
    sourceIndex: number,
  ) {
    const n = this.numNodes;
    const row = n + sourceIndex;

    // B matrix entries
    if (nodeA > 0) {
      A[nodeA - 1][row] += 1;
      A[row][nodeA - 1] += 1;
    }
    if (nodeB > 0) {
      A[nodeB - 1][row] -= 1;
      A[row][nodeB - 1] -= 1;
    }

    // Voltage value
    b[row] = value;
  }

  private stampCurrentSource(b: number[], elem: MNAElement) {
    const { nodeA, nodeB, value } = elem;
    // Current flows from nodeA to nodeB
    if (nodeA > 0) b[nodeA - 1] -= value;
    if (nodeB > 0) b[nodeB - 1] += value;
  }

  private stampCapacitor(A: number[][], b: number[], elem: MNAElement) {
    // Trapezoidal companion model:
    // The capacitor is replaced by a conductance Geq = 2C/dt in parallel with
    // a current source Ieq = Geq * V_prev + I_prev
    const C = Math.max(elem.value, 1e-15);
    const geq = (2 * C) / this.dt;
    const vPrev = elem.prevVoltage ?? 0;
    const iPrev = elem.prevCurrent ?? 0;
    const ieq = geq * vPrev + iPrev;

    const { nodeA, nodeB } = elem;

    // Stamp conductance (same as resistor with g = geq)
    if (nodeA > 0) A[nodeA - 1][nodeA - 1] += geq;
    if (nodeB > 0) A[nodeB - 1][nodeB - 1] += geq;
    if (nodeA > 0 && nodeB > 0) {
      A[nodeA - 1][nodeB - 1] -= geq;
      A[nodeB - 1][nodeA - 1] -= geq;
    }

    // Stamp companion current source
    if (nodeA > 0) b[nodeA - 1] += ieq;
    if (nodeB > 0) b[nodeB - 1] -= ieq;
  }

  private stampInductor(A: number[][], b: number[], elem: MNAElement) {
    // Backward-Euler companion model:
    //   i = i(previous) + (dt/L) * v
    // This is deliberately dissipative and therefore stable when a user
    // pauses, steps, or reconnects a circuit while the transient is running.
    const inductance = Math.max(elem.value, 1e-15);
    const conductance = this.dt / inductance;
    const previousCurrent = elem.prevCurrent ?? 0;
    const { nodeA, nodeB } = elem;

    if (nodeA > 0) A[nodeA - 1][nodeA - 1] += conductance;
    if (nodeB > 0) A[nodeB - 1][nodeB - 1] += conductance;
    if (nodeA > 0 && nodeB > 0) {
      A[nodeA - 1][nodeB - 1] -= conductance;
      A[nodeB - 1][nodeA - 1] -= conductance;
    }
    if (nodeA > 0) b[nodeA - 1] += previousCurrent;
    if (nodeB > 0) b[nodeB - 1] -= previousCurrent;
  }

  private stampControlledConductance(
    A: number[][],
    outputA: number,
    outputB: number,
    inputA: number,
    inputB: number,
    conductance: number,
  ) {
    const add = (rowNode: number, columnNode: number, value: number) => {
      if (rowNode > 0 && columnNode > 0) A[rowNode - 1][columnNode - 1] += value;
    };
    add(outputA, inputA, conductance);
    add(outputA, inputB, -conductance);
    add(outputB, inputA, -conductance);
    add(outputB, inputB, conductance);
  }

  private stampTransformer(A: number[][], b: number[], elem: MNAElement) {
    const secondaryA = elem.controlNode;
    const secondaryB = elem.controlNode2;
    if (secondaryA === undefined || secondaryB === undefined) return;

    const primaryInductance = Math.max(elem.value, 1e-12);
    const turnsRatio = Math.max(elem.turnsRatio ?? 1, 1e-6);
    const secondaryInductance = Math.max(
      elem.secondaryInductance ?? primaryInductance * turnsRatio * turnsRatio,
      1e-12,
    );
    const coupling = Math.max(0.5, Math.min(0.9999, elem.coupling ?? 0.999));
    const mutualInductance = coupling * Math.sqrt(primaryInductance * secondaryInductance);
    const determinant = Math.max(
      primaryInductance * secondaryInductance - mutualInductance * mutualInductance,
      primaryInductance * secondaryInductance * 1e-6,
    );
    const scale = this.dt / determinant;
    const g11 = scale * secondaryInductance;
    const g12 = -scale * mutualInductance;
    const g21 = g12;
    const g22 = scale * primaryInductance;

    this.stampControlledConductance(A, elem.nodeA, elem.nodeB, elem.nodeA, elem.nodeB, g11);
    this.stampControlledConductance(A, elem.nodeA, elem.nodeB, secondaryA, secondaryB, g12);
    this.stampControlledConductance(A, secondaryA, secondaryB, elem.nodeA, elem.nodeB, g21);
    this.stampControlledConductance(A, secondaryA, secondaryB, secondaryA, secondaryB, g22);

    // The stored currents are the Norton history sources of the coupled
    // backward-Euler companion model.
    const primaryHistory = elem.prevCurrent ?? 0;
    const secondaryHistory = elem.prevSecondaryCurrent ?? 0;
    if (elem.nodeA > 0) b[elem.nodeA - 1] += primaryHistory;
    if (elem.nodeB > 0) b[elem.nodeB - 1] -= primaryHistory;
    if (secondaryA > 0) b[secondaryA - 1] += secondaryHistory;
    if (secondaryB > 0) b[secondaryB - 1] -= secondaryHistory;
  }

  private stampMotor(
    A: number[][],
    b: number[],
    elem: MNAElement,
    vsIndex: Map<string, number>,
  ) {
    const internalNode = elem.internalNode;
    const sourceIndex = vsIndex.get(elem.id);
    if (internalNode === undefined || sourceIndex === undefined) return;

    this.stampVoltageSourceBetween(
      A,
      b,
      elem.nodeA,
      internalNode,
      elem.backEmf ?? 0,
      sourceIndex,
    );
    this.stampResistor(A, {
      ...elem,
      type: 'RESISTOR',
      nodeA: internalNode,
      nodeB: elem.nodeB,
      value: Math.max(elem.value, 1e-3),
    });
  }

  private stampOpAmp(
    A: number[][],
    b: number[],
    elem: MNAElement,
    vsIndex: Map<string, number>,
    prevSolution: number[] | null,
  ) {
    const sourceIndex = vsIndex.get(elem.id);
    if (sourceIndex === undefined) return;
    const voltageAt = (node: number) => node > 0 && prevSolution ? prevSolution[node - 1] : 0;
    const differential = voltageAt(elem.controlNode ?? 0) - voltageAt(elem.controlNode2 ?? 0);
    const gain = Math.max(1, elem.openLoopGain ?? 100_000);
    const railHigh = elem.positiveRailNode !== undefined ? voltageAt(elem.positiveRailNode) : (elem.maxOutputVoltage ?? 15);
    const railLow = elem.negativeRailNode !== undefined ? voltageAt(elem.negativeRailNode) : (elem.minOutputVoltage ?? -15);
    const highLimit = Math.min(elem.maxOutputVoltage ?? railHigh, railHigh - Math.max(0, elem.outputHeadroom ?? 0));
    const lowLimit = Math.max(elem.minOutputVoltage ?? railLow, railLow);
    const output = Math.max(
      lowLimit,
      Math.min(highLimit, differential * gain + voltageAt(elem.negativeRailNode ?? 0)),
    );
    this.stampVoltageSourceBetween(A, b, elem.nodeA, elem.nodeB, output, sourceIndex);
  }

  private stampMosfet(A: number[][], b: number[], elem: MNAElement, prevSolution: number[] | null) {
    const voltageAt = (node: number) => node > 0 && prevSolution ? prevSolution[node - 1] : 0;
    const drainNode = elem.pChannel ? elem.nodeB : elem.nodeA;
    const sourceNode = elem.pChannel ? elem.nodeA : elem.nodeB;
    const gate = voltageAt(elem.controlNode ?? 0);
    const source = voltageAt(sourceNode);
    const drain = voltageAt(drainNode);
    const gateSourceVoltage = elem.pChannel ? source - gate : gate - source;
    const drainSourceVoltage = Math.max(0, source === drain ? 0 : drain - source);
    const threshold = Math.max(0, elem.thresholdVoltage ?? 2);
    const offConductance = 1 / Math.max(1e3, elem.offResistance ?? 1e8);
    let gds = offConductance;
    let gm = 0;
    let current = 0;

    if (gateSourceVoltage > threshold) {
      const overdrive = gateSourceVoltage - threshold;
      const kp = Math.max(
        1e-6,
        elem.transconductance ?? (1 / Math.max(elem.onResistance ?? 0.1, 1e-3)),
      );
      const lambda = Math.max(0, elem.channelLengthModulation ?? 0.01);
      if (drainSourceVoltage < overdrive) {
        const baseCurrent = kp * (overdrive * drainSourceVoltage - 0.5 * drainSourceVoltage * drainSourceVoltage);
        current = baseCurrent * (1 + lambda * drainSourceVoltage);
        gds = Math.max(offConductance, kp * ((overdrive - drainSourceVoltage) * (1 + lambda * drainSourceVoltage)
          + lambda * (overdrive * drainSourceVoltage - 0.5 * drainSourceVoltage * drainSourceVoltage)));
        gm = kp * drainSourceVoltage * (1 + lambda * drainSourceVoltage);
      } else {
        current = 0.5 * kp * overdrive * overdrive * (1 + lambda * drainSourceVoltage);
        gds = Math.max(offConductance, 0.5 * kp * overdrive * overdrive * lambda);
        gm = kp * overdrive * (1 + lambda * drainSourceVoltage);
      }
    }

    // Linearized Id(Vds,Vgs) = gds*Vds + gm*Vgs + Ieq.
    const equivalentCurrent = current - gds * drainSourceVoltage - gm * gateSourceVoltage;
    this.stampControlledConductance(A, drainNode, sourceNode, drainNode, sourceNode, gds);
    this.stampControlledConductance(A, drainNode, sourceNode, elem.controlNode ?? 0, sourceNode, gm);
    if (equivalentCurrent !== 0) {
      this.stampCurrentSource(b, {
        ...elem,
        nodeA: drainNode,
        nodeB: sourceNode,
        value: equivalentCurrent,
      });
    }
  }

  private stampDiode(
    A: number[][],
    b: number[],
    elem: MNAElement,
    prevSolution: number[] | null
  ) {
    if (elem.forwardVoltage !== undefined) {
      this.stampPiecewiseDiode(A, b, elem, prevSolution);
      return;
    }

    // Newton-Raphson linearization of the Shockley diode equation:
    //   I = Is * (e^(V/Vt) - 1)
    //
    // Linearized around operating point V0:
    //   I ≈ Geq * V + Ieq
    //   Geq = (Is / Vt) * e^(V0/Vt)
    //   Ieq = I(V0) - Geq * V0

    const Is = elem.saturationCurrent ?? 1e-12;
    const Vt = elem.thermalVoltage ?? 0.02585;
    const seriesResistance = Math.max(elem.seriesResistance ?? 0, 0);
    const { nodeA, nodeB } = elem;

    // Get previous voltage across diode
    let vd = 0.6; // Initial guess
    if (prevSolution) {
      const va = nodeA > 0 ? prevSolution[nodeA - 1] : 0;
      const vb = nodeB > 0 ? prevSolution[nodeB - 1] : 0;
      vd = va - vb;
    }

    // Clamp the junction voltage, rather than the external diode voltage.
    // Series resistance prevents the external branch from becoming an
    // unbounded 27.5 A source when a circuit is first energized.
    vd = Math.max(-5, Math.min(vd, 0.78));

    const expVd = Math.exp(vd / Vt);
    const Id = Is * (expVd - 1);
    const junctionConductance = (Is / Vt) * expVd;
    const geq = seriesResistance > 0
      ? 1 / (1 / Math.max(junctionConductance, 1e-12) + seriesResistance)
      : junctionConductance;
    const ieq = Id - geq * (vd + (seriesResistance > 0 ? Id * seriesResistance : 0));

    // Stamp conductance
    if (nodeA > 0) A[nodeA - 1][nodeA - 1] += geq;
    if (nodeB > 0) A[nodeB - 1][nodeB - 1] += geq;
    if (nodeA > 0 && nodeB > 0) {
      A[nodeA - 1][nodeB - 1] -= geq;
      A[nodeB - 1][nodeA - 1] -= geq;
    }

    // Stamp current source
    if (nodeA > 0) b[nodeA - 1] -= ieq;
    if (nodeB > 0) b[nodeB - 1] += ieq;
  }

  private stampPiecewiseDiode(
    A: number[][],
    b: number[],
    elem: MNAElement,
    prevSolution: number[] | null,
  ) {
    const nodeA = elem.nodeA;
    const nodeB = elem.nodeB;
    const forwardVoltage = Math.max(0, elem.forwardVoltage ?? 0);
    const seriesResistance = Math.max(elem.seriesResistance ?? 1, 1e-3);
    const reverseResistance = Math.max(elem.reverseResistance ?? 1e9, seriesResistance);
    const va = prevSolution && nodeA > 0 ? prevSolution[nodeA - 1] : 0;
    const vb = prevSolution && nodeB > 0 ? prevSolution[nodeB - 1] : 0;
    const voltage = va - vb;
    const zenerVoltage = Math.max(0, elem.zenerVoltage ?? 0);
    const zenerResistance = Math.max(elem.zenerResistance ?? seriesResistance, 1e-3);
    const isForwardBiased = prevSolution !== null && voltage > forwardVoltage;
    const isZenerBreakdown = prevSolution !== null && zenerVoltage > 0 && voltage < -zenerVoltage;
    const conductance = 1 / (
      isForwardBiased ? seriesResistance : isZenerBreakdown ? zenerResistance : reverseResistance
    );
    // Forward branch: I=(V-Vf)/R. Zener branch: I=(V+Vz)/R.
    // The RHS uses I = G*V + Ieq, so bA receives -Ieq.
    const equivalentCurrent = isForwardBiased
      ? -conductance * forwardVoltage
      : isZenerBreakdown
        ? conductance * zenerVoltage
        : 0;

    if (nodeA > 0) A[nodeA - 1][nodeA - 1] += conductance;
    if (nodeB > 0) A[nodeB - 1][nodeB - 1] += conductance;
    if (nodeA > 0 && nodeB > 0) {
      A[nodeA - 1][nodeB - 1] -= conductance;
      A[nodeB - 1][nodeA - 1] -= conductance;
    }
    if (nodeA > 0) b[nodeA - 1] -= equivalentCurrent;
    if (nodeB > 0) b[nodeB - 1] += equivalentCurrent;
  }

  private stampBjt(
    A: number[][],
    b: number[],
    elem: MNAElement,
    prevSolution: number[] | null
  ) {
    const collector = elem.nodeA;
    const emitter = elem.nodeB;
    const base = elem.controlNode ?? 0;
    const beta = Math.max(1, elem.gain ?? 100);
    const maxCurrent = Math.max(0.001, elem.maxCurrent ?? 0.5);
    const Is = elem.saturationCurrent ?? 1e-15;
    const Vt = elem.thermalVoltage ?? 0.02585;
    const pnp = Boolean(elem.pnp);

    const voltageAt = (node: number) => node > 0 && prevSolution ? prevSolution[node - 1] : 0;
    let junctionVoltage = prevSolution
      ? pnp ? voltageAt(emitter) - voltageAt(base) : voltageAt(base) - voltageAt(emitter)
      : 0.6;
    junctionVoltage = Math.max(-5, Math.min(junctionVoltage, 0.78));

    const expV = Math.exp(junctionVoltage / Vt);
    const baseCurrent = Is * (expV - 1);
    const baseConductance = (Is / Vt) * expV;
    const baseEquivalentCurrent = baseCurrent - baseConductance * junctionVoltage;

    const rawCollectorCurrent = beta * baseCurrent;
    const collectorCurrent = Math.min(maxCurrent, Math.max(-Is, rawCollectorCurrent));
    const collectorConductance = rawCollectorCurrent >= maxCurrent ? 0 : beta * baseConductance;
    const collectorEquivalentCurrent = collectorCurrent - collectorConductance * junctionVoltage;

    const stampBranch = (from: number, to: number, controlPositive: number, controlNegative: number, gm: number, ieq: number) => {
      if (from > 0) {
        if (controlPositive > 0) A[from - 1][controlPositive - 1] += gm;
        if (controlNegative > 0) A[from - 1][controlNegative - 1] -= gm;
        b[from - 1] -= ieq;
      }
      if (to > 0) {
        if (controlPositive > 0) A[to - 1][controlPositive - 1] -= gm;
        if (controlNegative > 0) A[to - 1][controlNegative - 1] += gm;
        b[to - 1] += ieq;
      }
    };

    if (pnp) {
      stampBranch(emitter, base, emitter, base, baseConductance, baseEquivalentCurrent);
      stampBranch(emitter, collector, emitter, base, collectorConductance, collectorEquivalentCurrent);
    } else {
      stampBranch(base, emitter, base, emitter, baseConductance, baseEquivalentCurrent);
      stampBranch(collector, emitter, base, emitter, collectorConductance, collectorEquivalentCurrent);
    }

    // Finite output resistance keeps the collector defined when the device is off.
    this.stampResistor(A, { ...elem, type: 'RESISTOR', value: 100_000_000 });
  }

  // ── Result builder ────────────────────────────────────────────────────

  private buildResult(
    solution: number[],
    n: number,
    vsIndex: Map<string, number>,
    converged: boolean,
    iterations: number
  ): MNASolution {
    // Node voltages: index 0 = ground (0V), index 1..n = solved
    const nodeVoltages = [0, ...solution.slice(0, n)];

    // Branch currents through voltage sources / ammeters
    const branchCurrents = new Map<string, number>();
    for (const [id, idx] of vsIndex) {
      branchCurrents.set(id, solution[n + idx] || 0);
    }

    // Also compute currents through resistors using Ohm's law
    for (const elem of this.elements) {
      if (elem.type === 'RESISTOR') {
        const va = elem.nodeA > 0 ? nodeVoltages[elem.nodeA] : 0;
        const vb = elem.nodeB > 0 ? nodeVoltages[elem.nodeB] : 0;
        const current = (va - vb) / Math.max(elem.value, 1e-9);
        branchCurrents.set(elem.id, current);
      }
      if (elem.type === 'DIODE') {
        const va = elem.nodeA > 0 ? nodeVoltages[elem.nodeA] : 0;
        const vb = elem.nodeB > 0 ? nodeVoltages[elem.nodeB] : 0;
        const vd = va - vb;
        const current = elem.forwardVoltage !== undefined
          ? vd > elem.forwardVoltage
            ? (vd - elem.forwardVoltage) / Math.max(elem.seriesResistance ?? 1, 1e-3)
            : elem.zenerVoltage !== undefined && vd < -elem.zenerVoltage
              ? (vd + elem.zenerVoltage) / Math.max(elem.zenerResistance ?? elem.seriesResistance ?? 1, 1e-3)
              : vd / Math.max(elem.reverseResistance ?? 1e9, 1)
          : (() => {
            const Is = elem.saturationCurrent ?? 1e-12;
            const Vt = elem.thermalVoltage ?? 0.02585;
            const junctionVoltage = Math.max(-5, Math.min(vd, 0.78));
            const junctionCurrent = Is * (Math.exp(junctionVoltage / Vt) - 1);
            const Rs = Math.max(elem.seriesResistance ?? 0, 0);
            return Rs > 0 ? junctionCurrent / (1 + Math.abs(junctionCurrent) * Rs / Math.max(Vt, 1e-6)) : junctionCurrent;
          })();
        branchCurrents.set(elem.id, current);
      }
      if (elem.type === 'BJT') {
        const baseNode = elem.controlNode ?? 0;
        const vb = baseNode > 0 ? nodeVoltages[baseNode] : 0;
        const ve = elem.nodeB > 0 ? nodeVoltages[elem.nodeB] : 0;
        const junctionVoltage = Math.max(-5, Math.min(elem.pnp ? ve - vb : vb - ve, 0.78));
        const Is = elem.saturationCurrent ?? 1e-15;
        const beta = Math.max(1, elem.gain ?? 100);
        const maxCurrent = Math.max(0.001, elem.maxCurrent ?? 0.5);
        const current = Math.min(maxCurrent, Math.max(-Is, beta * Is * (Math.exp(junctionVoltage / (elem.thermalVoltage ?? 0.02585)) - 1)));
        branchCurrents.set(elem.id, elem.pnp ? -current : current);
      }
      if (elem.type === 'INDUCTOR') {
        const va = elem.nodeA > 0 ? nodeVoltages[elem.nodeA] : 0;
        const vb = elem.nodeB > 0 ? nodeVoltages[elem.nodeB] : 0;
        branchCurrents.set(elem.id, (elem.prevCurrent ?? 0) + (this.dt / Math.max(elem.value, 1e-15)) * (va - vb));
      }
      if (elem.type === 'TRANSFORMER') {
        const secondaryA = elem.controlNode ?? 0;
        const secondaryB = elem.controlNode2 ?? 0;
        const primaryVoltage = (elem.nodeA > 0 ? nodeVoltages[elem.nodeA] : 0)
          - (elem.nodeB > 0 ? nodeVoltages[elem.nodeB] : 0);
        const secondaryVoltage = (secondaryA > 0 ? nodeVoltages[secondaryA] : 0)
          - (secondaryB > 0 ? nodeVoltages[secondaryB] : 0);
        const primaryInductance = Math.max(elem.value, 1e-12);
        const ratio = Math.max(elem.turnsRatio ?? 1, 1e-6);
        const secondaryInductance = Math.max(elem.secondaryInductance ?? primaryInductance * ratio * ratio, 1e-12);
        const coupling = Math.max(0.5, Math.min(0.9999, elem.coupling ?? 0.999));
        const mutual = coupling * Math.sqrt(primaryInductance * secondaryInductance);
        const determinant = Math.max(primaryInductance * secondaryInductance - mutual * mutual, primaryInductance * secondaryInductance * 1e-6);
        const scale = this.dt / determinant;
        const primaryCurrent = (elem.prevCurrent ?? 0) + scale * (secondaryInductance * primaryVoltage - mutual * secondaryVoltage);
        branchCurrents.set(elem.id, primaryCurrent);
      }
      if (elem.type === 'MOSFET') {
        const drainNode = elem.pChannel ? elem.nodeB : elem.nodeA;
        const sourceNode = elem.pChannel ? elem.nodeA : elem.nodeB;
        const gate = elem.controlNode && elem.controlNode > 0 ? nodeVoltages[elem.controlNode] : 0;
        const source = sourceNode > 0 ? nodeVoltages[sourceNode] : 0;
        const drain = drainNode > 0 ? nodeVoltages[drainNode] : 0;
        const gateSourceVoltage = elem.pChannel ? source - gate : gate - source;
        const drainSourceVoltage = Math.max(0, drain - source);
        const threshold = Math.max(0, elem.thresholdVoltage ?? 2);
        let current = 0;
        if (gateSourceVoltage > threshold) {
          const overdrive = gateSourceVoltage - threshold;
          const kp = Math.max(1e-6, elem.transconductance ?? (1 / Math.max(elem.onResistance ?? 0.1, 1e-3)));
          const lambda = Math.max(0, elem.channelLengthModulation ?? 0.01);
          current = drainSourceVoltage < overdrive
            ? kp * (overdrive * drainSourceVoltage - 0.5 * drainSourceVoltage * drainSourceVoltage) * (1 + lambda * drainSourceVoltage)
            : 0.5 * kp * overdrive * overdrive * (1 + lambda * drainSourceVoltage);
        }
        branchCurrents.set(elem.id, elem.pChannel ? -current : current);
      }
    }

    return { nodeVoltages, branchCurrents, converged, iterations };
  }

  /**
   * Update capacitor companion model state after a solve step.
   * Call this after solve() to prepare for the next time step.
   */
  public updateTransientState(solution: MNASolution) {
    for (const elem of this.elements) {
      if (elem.type === 'CAPACITOR') {
        const va = elem.nodeA > 0 ? solution.nodeVoltages[elem.nodeA] : 0;
        const vb = elem.nodeB > 0 ? solution.nodeVoltages[elem.nodeB] : 0;
        const vNow = va - vb;
        const C = Math.max(elem.value, 1e-15);
        const geq = (2 * C) / this.dt;
        const iNow = geq * vNow - (geq * (elem.prevVoltage ?? 0) + (elem.prevCurrent ?? 0));
        elem.prevVoltage = vNow;
        elem.prevCurrent = iNow;
      }
      if (elem.type === 'INDUCTOR') {
        const va = elem.nodeA > 0 ? solution.nodeVoltages[elem.nodeA] : 0;
        const vb = elem.nodeB > 0 ? solution.nodeVoltages[elem.nodeB] : 0;
        const current = (elem.prevCurrent ?? 0)
          + (this.dt / Math.max(elem.value, 1e-15)) * (va - vb);
        elem.prevCurrent = current;
        elem.prevVoltage = va - vb;
      }
      if (elem.type === 'TRANSFORMER') {
        const secondaryA = elem.controlNode ?? 0;
        const secondaryB = elem.controlNode2 ?? 0;
        const primaryVoltage = (elem.nodeA > 0 ? solution.nodeVoltages[elem.nodeA] : 0)
          - (elem.nodeB > 0 ? solution.nodeVoltages[elem.nodeB] : 0);
        const secondaryVoltage = (secondaryA > 0 ? solution.nodeVoltages[secondaryA] : 0)
          - (secondaryB > 0 ? solution.nodeVoltages[secondaryB] : 0);
        const primaryInductance = Math.max(elem.value, 1e-12);
        const ratio = Math.max(elem.turnsRatio ?? 1, 1e-6);
        const secondaryInductance = Math.max(elem.secondaryInductance ?? primaryInductance * ratio * ratio, 1e-12);
        const coupling = Math.max(0.5, Math.min(0.9999, elem.coupling ?? 0.999));
        const mutual = coupling * Math.sqrt(primaryInductance * secondaryInductance);
        const determinant = Math.max(primaryInductance * secondaryInductance - mutual * mutual, primaryInductance * secondaryInductance * 1e-6);
        const scale = this.dt / determinant;
        elem.prevCurrent = (elem.prevCurrent ?? 0) + scale * (secondaryInductance * primaryVoltage - mutual * secondaryVoltage);
        elem.prevSecondaryCurrent = (elem.prevSecondaryCurrent ?? 0) + scale * (-mutual * primaryVoltage + primaryInductance * secondaryVoltage);
        elem.prevVoltage = primaryVoltage;
      }
    }
  }
}
