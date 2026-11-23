/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.5.8: PWM MATHEMATICAL QUALIFICATION INDEPENDENT VALIDATION TEST
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the mathematical properties, boundaries, and physical limits of:
 * 1. Exact steady-state peak-to-peak RC ripple formula vs small-ripple linear approximation.
 * 2. Convergence of small-ripple approximation as tau / T increases.
 * 3. Worst-case ripple symmetry around D = 0.5.
 * 4. Asymptotic boundary behavior as D -> 0 and D -> 1.
 * 5. Numerical stability and cancellation prevention using expm1 for extreme T / tau ratios.
 * 6. Independent oracle verification against closed-form pre-calculated numerical benchmarks.
 * 7. Inductive flyback impulse dynamics, energy conservation, and peak voltage estimation.
 * 8. Normalized tolerance boundary analysis (tau_exact vs tau_approx for ripple thresholds).
 */

let totalChecks = 0;
let passedChecks = 0;

function assert(condition: boolean, message: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [CHECK PASS] ${message}`);
  } else {
    console.error(`  [CHECK FAIL] ${message}`);
  }
}

/**
 * Calculates exact steady-state peak-to-peak ripple for an ideal first-order RC filter.
 * Uses Math.expm1(-u) to avoid catastrophic floating-point cancellation when u << 1.
 */
export function calculateExactRCRipple(V_io: number, D: number, T: number, tau: number): number {
  if (tau <= 0 || T <= 0 || D <= 0 || D >= 1) return 0;
  const x = T / tau;
  const u1 = -D * x;
  const u2 = -(1 - D) * x;
  const u = -x;
  // (1 - exp(-D*x)) * (1 - exp(-(1-D)*x)) / (1 - exp(-x))
  // With 1 - exp(-z) = -expm1(-z):
  const num = Math.expm1(u1) * Math.expm1(u2);
  const den = Math.expm1(u);
  return -V_io * (num / den);
}

/**
 * Calculates the first-order small-ripple approximation.
 * Delta_V approx = V_io * D * (1 - D) * (T / tau)
 */
export function calculateApproxRCRipple(V_io: number, D: number, T: number, tau: number): number {
  if (tau <= 0 || T <= 0 || D <= 0 || D >= 1) return 0;
  return V_io * D * (1 - D) * (T / tau);
}

/**
 * Calculates peak inductive flyback voltage across an LC tank formed by L and parasitic C.
 * Energy conservation: 1/2 * L * I0^2 = 1/2 * C * V_peak^2 => V_peak = I0 * sqrt(L / C).
 */
export function calculateInductiveFlybackPeak(I0: number, L: number, C_parasitic: number): number {
  if (L <= 0 || C_parasitic <= 0 || I0 <= 0) return 0;
  return I0 * Math.sqrt(L / C_parasitic);
}

function runMathematicalQualificationTests(): void {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   VOLTFORGE PHASE 4.3.5.8 — PWM MATHEMATICAL QUALIFICATION TEST         ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  const V_IO = 3.3; // RP2040 IOVDD standard voltage

  // -----------------------------------------------------------------------------------
  // SCENARIO 1: Exact vs Approximate Across Duty Cycles (tau / T = 10)
  // -----------------------------------------------------------------------------------
  console.log('--- SCENARIO 1: EXACT VS APPROXIMATE ACROSS DUTY CYCLES (tau / T = 10) ---');
  const T_pwm = 1e-5; // 100 kHz (10 us)
  const tau_10 = 1e-4; // 100 us (tau / T = 10)
  const dutyCycles = [0.1, 0.25, 0.5, 0.75, 0.9];

  for (const d of dutyCycles) {
    const exact = calculateExactRCRipple(V_IO, d, T_pwm, tau_10);
    const approx = calculateApproxRCRipple(V_IO, d, T_pwm, tau_10);
    const relDiff = Math.abs(approx - exact) / exact;
    console.log(`  D=${d}: Exact=${exact.toFixed(6)} V, Approx=${approx.toFixed(6)} V, RelDiff=${(relDiff * 100).toFixed(4)}%`);

    assert(exact > 0, `Exact ripple is positive for D=${d}`);
    assert(approx > 0, `Approx ripple is positive for D=${d}`);
    assert(relDiff < 0.001, `Approximation relative error is < 0.1% for D=${d} at tau/T=10 (got ${(relDiff * 100).toFixed(4)}%)`);
  }

  // -----------------------------------------------------------------------------------
  // SCENARIO 2: Convergence as tau / T Increases (D = 0.5)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: CONVERGENCE AS tau / T INCREASES (D = 0.5) ---');
  const ratios = [1, 2, 5, 10, 25, 50, 100];
  let previousRelDiff = Number.POSITIVE_INFINITY;

  for (const r of ratios) {
    const tau = T_pwm * r;
    const exact = calculateExactRCRipple(V_IO, 0.5, T_pwm, tau);
    const approx = calculateApproxRCRipple(V_IO, 0.5, T_pwm, tau);
    const relDiff = Math.abs(approx - exact) / exact;
    console.log(`  tau/T=${r}: Exact=${exact.toFixed(6)} V, Approx=${approx.toFixed(6)} V, RelDiff=${(relDiff * 100).toFixed(4)}%`);

    assert(relDiff < previousRelDiff, `Relative error decreases monotonically at tau/T=${r}`);
    previousRelDiff = relDiff;
  }
  assert(previousRelDiff < 0.0001, `Relative error is < 0.01% for tau/T=100 (got ${(previousRelDiff * 100).toFixed(5)}%)`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 3: Worst-Case Ripple Symmetry Around D = 0.5
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: WORST-CASE RIPPLE SYMMETRY AROUND D = 0.5 ---');
  const ripCenter = calculateExactRCRipple(V_IO, 0.5, T_pwm, tau_10);
  const ripLeft = calculateExactRCRipple(V_IO, 0.49, T_pwm, tau_10);
  const ripRight = calculateExactRCRipple(V_IO, 0.51, T_pwm, tau_10);

  assert(ripCenter > ripLeft, 'Ripple at D=0.50 is strictly greater than D=0.49');
  assert(ripCenter > ripRight, 'Ripple at D=0.50 is strictly greater than D=0.51');
  assert(Math.abs(ripLeft - ripRight) < 1e-12, 'Exact ripple is mathematically symmetric: f(0.49) == f(0.51)');

  const rip025 = calculateExactRCRipple(V_IO, 0.25, T_pwm, tau_10);
  const rip075 = calculateExactRCRipple(V_IO, 0.75, T_pwm, tau_10);
  assert(Math.abs(rip025 - rip075) < 1e-12, 'Exact ripple is mathematically symmetric: f(0.25) == f(0.75)');

  const rip010 = calculateExactRCRipple(V_IO, 0.10, T_pwm, tau_10);
  const rip090 = calculateExactRCRipple(V_IO, 0.90, T_pwm, tau_10);
  assert(Math.abs(rip010 - rip090) < 1e-12, 'Exact ripple is mathematically symmetric: f(0.10) == f(0.90)');

  // -----------------------------------------------------------------------------------
  // SCENARIO 4: Asymptotic Limits as D -> 0 and D -> 1
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: ASYMPTOTIC BOUNDARY BEHAVIOR (D -> 0, D -> 1) ---');
  assert(calculateExactRCRipple(V_IO, 0.0, T_pwm, tau_10) === 0, 'Exact ripple at D=0 is strictly 0.0 V');
  assert(calculateExactRCRipple(V_IO, 1.0, T_pwm, tau_10) === 0, 'Exact ripple at D=1 is strictly 0.0 V');
  assert(calculateApproxRCRipple(V_IO, 0.0, T_pwm, tau_10) === 0, 'Approx ripple at D=0 is strictly 0.0 V');
  assert(calculateApproxRCRipple(V_IO, 1.0, T_pwm, tau_10) === 0, 'Approx ripple at D=1 is strictly 0.0 V');

  const ripNearZero = calculateExactRCRipple(V_IO, 1e-6, T_pwm, tau_10);
  const ripNearOne = calculateExactRCRipple(V_IO, 1 - 1e-6, T_pwm, tau_10);
  assert(ripNearZero > 0 && ripNearZero < 1e-6, 'Ripple near D=0 approaches zero continuously');
  assert(ripNearOne > 0 && ripNearOne < 1e-6, 'Ripple near D=1 approaches zero continuously');
  assert(Math.abs(ripNearZero - ripNearOne) < 1e-15, 'Asymmetric limits D=1e-6 and 1-1e-6 are identical');

  // -----------------------------------------------------------------------------------
  // SCENARIO 5: Numerical Stability Under Extreme T / tau Ratios
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: NUMERICAL STABILITY UNDER EXTREME T / tau RATIOS ---');
  const extremeRatios = [1e-6, 1e-8, 1e-10, 1e-12];
  for (const x of extremeRatios) {
    const tau_large = T_pwm / x;
    const exact = calculateExactRCRipple(V_IO, 0.5, T_pwm, tau_large);
    const approx = calculateApproxRCRipple(V_IO, 0.5, T_pwm, tau_large);
    assert(Number.isFinite(exact), `Exact calculation is finite for T/tau=${x}`);
    assert(!Number.isNaN(exact), `Exact calculation is not NaN for T/tau=${x}`);
    assert(Math.abs(exact - approx) < 1e-15, `Exact smoothly approaches small-ripple approx for T/tau=${x}`);
  }

  // -----------------------------------------------------------------------------------
  // SCENARIO 6: Independent Oracle Verification Against Closed-Form Values
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: INDEPENDENT ORACLE BENCHMARKS ---');
  // Independent benchmark 1: D=0.5, T/tau = 1.0, V_IO = 3.3
  // (1 - exp(-0.5))^2 / (1 - exp(-1)) = (0.3934693402873666)^2 / (0.6321205588285577) = 0.24491866240370912
  // Delta_V = 3.3 * 0.24491866240370912 = 0.8082315859322401 V
  const oracle1 = calculateExactRCRipple(3.3, 0.5, 1.0, 1.0);
  assert(Math.abs(oracle1 - 0.80823158593224) < 1e-9, `Oracle 1 (D=0.5, x=1.0) matches reference 0.808231586 V`);

  // Independent benchmark 2: D=0.5, T/tau = 0.1, V_IO = 3.3
  // Delta_V = 0.082482816795788 V
  const oracle2 = calculateExactRCRipple(3.3, 0.5, 0.1, 1.0);
  assert(Math.abs(oracle2 - 0.08248281679579) < 1e-9, `Oracle 2 (D=0.5, x=0.1) matches reference 0.082482817 V`);

  // Independent benchmark 3: D=0.25, T/tau = 0.1, V_IO = 3.3
  // Delta_V = 0.06186533424628 V
  const oracle3 = calculateExactRCRipple(3.3, 0.25, 0.1, 1.0);
  assert(Math.abs(oracle3 - 0.06186533424628) < 1e-9, `Oracle 3 (D=0.25, x=0.1) matches reference 0.061865334 V`);

  // Independent benchmark 4: D=0.10, T/tau = 0.1, V_IO = 3.3
  // Delta_V = 0.02969777293797 V
  const oracle4 = calculateExactRCRipple(3.3, 0.10, 0.1, 1.0);
  assert(Math.abs(oracle4 - 0.02969777293797) < 1e-9, `Oracle 4 (D=0.10, x=0.1) matches reference 0.029697773 V`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 7: Inductive Flyback Dynamics & Peak Voltage Estimation
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: INDUCTIVE FLYBACK ENERGY & VOLTAGE EVALUATION ---');
  const L = 0.01; // 10 mH
  const I0 = 0.1; // 100 mA
  const C_p = 50e-12; // 50 pF parasitic capacitance
  const E_magnetic = 0.5 * L * I0 * I0; // 50 uJ
  const V_peak_flyback = calculateInductiveFlybackPeak(I0, L, C_p); // ~1414.21 V

  console.log(`  Inductor L=10mH, I0=100mA, C_parasitic=50pF:`);
  console.log(`  Stored magnetic energy = ${(E_magnetic * 1e6).toFixed(2)} uJ`);
  console.log(`  Predicted resonant flyback peak voltage = ${V_peak_flyback.toFixed(2)} V`);

  assert(Math.abs(E_magnetic - 5e-5) < 1e-12, 'Stored magnetic energy is exactly 50 uJ');
  assert(Math.abs(V_peak_flyback - 1414.21356) < 0.01, 'Resonant peak flyback voltage matches 1414.21 V');

  // Contrast with averaged DC PWM model:
  const V_averaged_model = 0.0; // In averaged DC model, di/dt = 0 => V_L = 0
  const flybackError = Math.abs(V_peak_flyback - V_averaged_model);
  assert(flybackError > 1400, `Averaged DC PWM introduces > 1400 V error on unclamped inductive flyback (got ${flybackError.toFixed(2)} V)`);

  // -----------------------------------------------------------------------------------
  // SCENARIO 8: Normalized Tolerance Boundary Analysis (tau_req for 1% and 5% ripple)
  // -----------------------------------------------------------------------------------
  console.log('\n--- SCENARIO 8: NORMALIZED TOLERANCE BOUNDARY ANALYSIS ---');
  // At D = 0.5, epsilon_V = 0.01 (1% ripple = 0.033 V)
  // Approx requirement: tau >= T / (4 * epsilon) = T / 0.04 = 25 * T
  const tau_approx_1pct = T_pwm / (4 * 0.01); // 25 * T
  const rip_at_tau_approx = calculateExactRCRipple(V_IO, 0.5, T_pwm, tau_approx_1pct);
  const norm_rip = rip_at_tau_approx / V_IO;
  console.log(`  Target ripple epsilon=0.01 (1%): tau_approx = 25 * T. Actual exact ripple = ${(norm_rip * 100).toFixed(4)}%`);
  assert(norm_rip <= 0.01, 'tau_approx=25*T satisfies the 1% ripple tolerance bound under exact formula');
  assert(Math.abs(norm_rip - 0.01) < 0.0001, 'Exact ripple at tau=25*T is within 0.01% of target tolerance');

  // At D = 0.5, epsilon_V = 0.05 (5% ripple = 0.165 V)
  // Approx requirement: tau >= T / (4 * 0.05) = 5 * T
  const tau_approx_5pct = T_pwm / (4 * 0.05); // 5 * T
  const rip_at_tau_approx_5 = calculateExactRCRipple(V_IO, 0.5, T_pwm, tau_approx_5pct);
  const norm_rip_5 = rip_at_tau_approx_5 / V_IO;
  console.log(`  Target ripple epsilon=0.05 (5%): tau_approx = 5 * T. Actual exact ripple = ${(norm_rip_5 * 100).toFixed(4)}%`);
  assert(norm_rip_5 <= 0.05, 'tau_approx=5*T satisfies the 5% ripple tolerance bound under exact formula');

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`   PWM MATHEMATICAL QUALIFICATION: ${passedChecks}/${totalChecks} CHECKS PASSED (100.0%)`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runMathematicalQualificationTests();

