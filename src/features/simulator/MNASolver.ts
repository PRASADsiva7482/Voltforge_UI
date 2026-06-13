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
  | 'DIODE'
  | 'AMMETER';

export interface MNAElement {
  id: string;
  type: MNAElementType;
  nodeA: number;   // Positive node index (0 = ground)
  nodeB: number;   // Negative node index (0 = ground)
  value: number;   // Resistance (Ω), Voltage (V), Current (A), Capacitance (F)

  // Diode parameters (Shockley model)
  saturationCurrent?: number;  // Is (A), default 1e-12
  thermalVoltage?: number;     // Vt (V), default 0.02585 (≈26mV at 25°C)

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

  constructor(numNodes: number, dt = 0.001) {
    this.numNodes = numNodes;
    this.dt = dt;
  }

  public setTimeStep(dt: number) {
    this.dt = dt;
  }

  public setElements(elements: MNAElement[]) {
    this.elements = elements;
    this.voltageSources = elements.filter(
      (e) => e.type === 'VOLTAGE_SOURCE' || e.type === 'AMMETER'
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
          case 'DIODE':
            this.stampDiode(A, b, elem, prevSolution);
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
      const hasNonlinear = this.elements.some((e) => e.type === 'DIODE');
      if (hasNonlinear && prevSolution) {
        let maxDiff = 0;
        for (let i = 0; i < size; i++) {
          maxDiff = Math.max(maxDiff, Math.abs(solution[i] - prevSolution[i]));
        }
        if (maxDiff < tolerance) {
          return this.buildResult(solution, n, m, vsIndex, true, iterations);
        }
      } else if (!hasNonlinear) {
        // Linear circuit — one iteration is enough
        return this.buildResult(solution, n, m, vsIndex, true, 1);
      }

      prevSolution = solution;
    }

    // Did not converge — return last result anyway
    return this.buildResult(prevSolution!, n, m, new Map(
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

    const n = this.numNodes;
    const row = n + idx;
    const { nodeA, nodeB } = elem;

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
    b[row] = elem.value;
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

  private stampDiode(
    A: number[][],
    b: number[],
    elem: MNAElement,
    prevSolution: number[] | null
  ) {
    // Newton-Raphson linearization of the Shockley diode equation:
    //   I = Is * (e^(V/Vt) - 1)
    //
    // Linearized around operating point V0:
    //   I ≈ Geq * V + Ieq
    //   Geq = (Is / Vt) * e^(V0/Vt)
    //   Ieq = I(V0) - Geq * V0

    const Is = elem.saturationCurrent ?? 1e-12;
    const Vt = elem.thermalVoltage ?? 0.02585;
    const { nodeA, nodeB } = elem;

    // Get previous voltage across diode
    let vd = 0.6; // Initial guess
    if (prevSolution) {
      const va = nodeA > 0 ? prevSolution[nodeA - 1] : 0;
      const vb = nodeB > 0 ? prevSolution[nodeB - 1] : 0;
      vd = va - vb;
    }

    // Clamp to prevent overflow
    vd = Math.max(-5, Math.min(vd, 0.8));

    const expVd = Math.exp(vd / Vt);
    const Id = Is * (expVd - 1);
    const geq = (Is / Vt) * expVd;
    const ieq = Id - geq * vd;

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

  // ── Result builder ────────────────────────────────────────────────────

  private buildResult(
    solution: number[],
    n: number,
    m: number,
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
        const Is = elem.saturationCurrent ?? 1e-12;
        const Vt = elem.thermalVoltage ?? 0.02585;
        const va = elem.nodeA > 0 ? nodeVoltages[elem.nodeA] : 0;
        const vb = elem.nodeB > 0 ? nodeVoltages[elem.nodeB] : 0;
        const vd = Math.max(-5, Math.min(va - vb, 0.8));
        const current = Is * (Math.exp(vd / Vt) - 1);
        branchCurrents.set(elem.id, current);
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
    }
  }
}
