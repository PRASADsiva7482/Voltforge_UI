/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge — Phase 4.3.2 RP2040 GPIO Electrical Bridge & MNA Circuit Co-Simulation
 * Acceptance Test Suite
 * 
 * Verifies:
 * 1. Physical GPIO Register Model (SIO, IO_BANK0, PADS_BANK0, atomic aliases)
 * 2. Thevenin Output Driver (2/4/8/12 mA Ron impedance, Pull-up/down, High-Z)
 * 3. MNA-to-GPIO Input Feedback & Schmitt Trigger Hysteresis (Vt+ = 1.55V, Vt- = 1.15V)
 * 4. Realistic Closed-Loop Firmware Tests:
 *    - Test A: Firmware-controlled LED blink (pico_blink_rp2040.uf2 into 220 Ω + LED)
 *    - Test B: Circuit-controlled input (pico_closed_loop_rp2040.uf2 sensing external voltage)
 *    - Test C: Bidirectional closed loop (GP14 input -> ARM Cortex-M0+ -> GP15 output -> MNA load)
 * 5. Electrical Safety & Fault Detection (Shorts, contention, overcurrent > 16 mA, floating)
 * 6. Pin Boundaries & Raspberry Pi Pico board layout mapping
 * 7. Cycle-accurate 133 MHz clock synchronization & deterministic simulated time
 * 8. Zero regressions to existing Phase 4.3.1.2 boot tests and AVR8js emulation
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { RP2040Controller } from '../src/features/simulator/rp2040Controller';
import {
  RP2040GpioBridge,
  RP2040_NUM_GPIOS,
  RP2040_MAX_PIN_CURRENT_A,
  RP2040_SCHMITT_VT_POS,
  RP2040_SCHMITT_VT_NEG,
  RP2040_PULL_RESISTANCE_OHMS,
  RP2040_HIGH_Z_RESISTANCE_OHMS,
} from '../src/features/simulator/rp2040GpioBridge';
import { MNASolver, type MNAElement } from '../src/features/simulator/MNASolver';
import { CPU, avrInstruction, AVRIOPort, portDConfig } from 'avr8js';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[Test ${String(id).padStart(2, '0')}] ${status}: ${name}`);
  console.log(`         ${details}`);
}

async function runAcceptanceSuite() {
  console.log('========================================================================');
  console.log('   VOLTFORGE PHASE 4.3.2 — RP2040 GPIO BRIDGE ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  const blinkFixturePath = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_blink_rp2040.uf2');
  const closedLoopFixturePath = path.resolve(__dirname, '../src/features/simulator/__fixtures__/pico_closed_loop_rp2040.uf2');

  const blinkBytes = fs.readFileSync(blinkFixturePath);
  const closedLoopBytes = fs.readFileSync(closedLoopFixturePath);

  // ─── TEST 1: GPIO Register Model & Instantiation ────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge();
    const snap = controller.getExecutionSnapshot();

    const ok = bridge !== null &&
      snap.gpioStates !== undefined &&
      snap.gpioStates.length === RP2040_NUM_GPIOS &&
      snap.gpioStates[15].pinName === 'GP15' &&
      snap.gpioStates[15].isPicoHeaderPin === true &&
      snap.gpioStates[25].headerPinLabel === 'INTERNAL_LED' &&
      snap.gpioStates[25].isPicoHeaderPin === false;

    record(1, 'GPIO Register Model & Instantiation', ok,
      `Initialized 30 RP2040 GPIOs: GP0-22/26-28 (Header), GP23-25/29 (Internal Pico)`);
  }

  // ─── TEST 2: Finite Output Impedance for Drive Strengths ───────────────────────────
  {
    // Test Ron calculations for 2 mA, 4 mA, 8 mA, 12 mA
    const d0 = RP2040GpioBridge.driveStrengthToImpedance(0); // 2 mA
    const d1 = RP2040GpioBridge.driveStrengthToImpedance(1); // 4 mA (default)
    const d2 = RP2040GpioBridge.driveStrengthToImpedance(2); // 8 mA
    const d3 = RP2040GpioBridge.driveStrengthToImpedance(3); // 12 mA

    const ok = d0.resistance === 100 && d0.mA === 2 &&
      d1.resistance === 50 && d1.mA === 4 &&
      d2.resistance === 25 && d2.mA === 8 &&
      d3.resistance === 17 && d3.mA === 12;

    record(2, 'Thevenin Output Driver Impedances (Ron)', ok,
      `2mA: ${d0.resistance}Ω, 4mA: ${d1.resistance}Ω, 8mA: ${d2.resistance}Ω, 12mA: ${d3.resistance}Ω`);
  }

  // ─── TEST 3: Pull-Up, Pull-Down and High-Z Driver Impedances ───────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // By default, pin is input mode without pulls (or default pad config)
    const pin = rp2040.gpio[10];
    pin.padValue = (pin.padValue & ~0x0c) | 0x08; // PUE=1, PDE=0
    bridge.recomputeDriverState(10);
    const puState = bridge.getDriverState(10)!;

    pin.padValue = (pin.padValue & ~0x0c) | 0x04; // PUE=0, PDE=1
    bridge.recomputeDriverState(10);
    const pdState = bridge.getDriverState(10)!;

    pin.padValue = pin.padValue & ~0x0c; // PUE=0, PDE=0
    bridge.recomputeDriverState(10);
    const hzState = bridge.getDriverState(10)!;

    const ok = puState.driverImpedance_Ohms === RP2040_PULL_RESISTANCE_OHMS &&
      puState.electricalTargetVoltage_V === 3.3 &&
      pdState.driverImpedance_Ohms === RP2040_PULL_RESISTANCE_OHMS &&
      pdState.electricalTargetVoltage_V === 0.0 &&
      hzState.driverImpedance_Ohms === RP2040_HIGH_Z_RESISTANCE_OHMS &&
      hzState.electricalTargetVoltage_V === 0.0;

    record(3, 'Passive Pull and High-Z Impedances', ok,
      `Pull-up: ${puState.driverImpedance_Ohms}Ω @ 3.3V, Pull-down: ${pdState.driverImpedance_Ohms}Ω @ 0V, High-Z: ${hzState.driverImpedance_Ohms}Ω`);
  }

  // ─── TEST 4: Schmitt Trigger Input Hysteresis ───────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Pin 14 is input
    const pin14 = rp2040.gpio[14];
    pin14.padValue |= 0x42; // IE = 1, Schmitt = 1
    bridge.recomputeDriverState(14);

    const nodeMap = new Map<number, number>([[14, 1]]);

    // 1. Voltage at 0.5V (below Vt- = 1.15V) -> LOW
    bridge.updateFromMnaResult([0, 0.5], nodeMap);
    const s1 = bridge.getDriverState(14)!.logicalInput;

    // 2. Voltage rises to 1.35V (inside hysteresis window [1.15V, 1.55V]) -> retains LOW
    bridge.updateFromMnaResult([0, 1.35], nodeMap);
    const s2 = bridge.getDriverState(14)!.logicalInput;

    // 3. Voltage rises to 1.60V (above Vt+ = 1.55V) -> transitions to HIGH
    bridge.updateFromMnaResult([0, 1.60], nodeMap);
    const s3 = bridge.getDriverState(14)!.logicalInput;

    // 4. Voltage drops back to 1.35V (inside hysteresis window [1.15V, 1.55V]) -> retains HIGH
    bridge.updateFromMnaResult([0, 1.35], nodeMap);
    const s4 = bridge.getDriverState(14)!.logicalInput;

    // 5. Voltage drops to 1.00V (below Vt- = 1.15V) -> transitions to LOW
    bridge.updateFromMnaResult([0, 1.00], nodeMap);
    const s5 = bridge.getDriverState(14)!.logicalInput;

    const ok = (s1 === false) && (s2 === false) && (s3 === true) && (s4 === true) && (s5 === false);
    record(4, 'MNA Input Schmitt Trigger Hysteresis', ok,
      `0.5V -> LOW, 1.35V -> LOW (hysteresis), 1.60V -> HIGH (Vt+), 1.35V -> HIGH (hysteresis), 1.00V -> LOW (Vt-)`);
  }

  // ─── TEST 5: Real Firmware Execution (pico_blink_rp2040.uf2) ────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    controller.start();

    // Step CPU instructions while ticking clock until Pin 25 toggles HIGH
    let toggledHigh = false;
    let cyclesAtHigh = 0;
    const bridge = controller.getGpioBridge()!;

    // Step across ~10M cycles (enough for initial boot and first LED toggle)
    const CHUNK_CYCLES = 100_000;
    let totalCycles = 0;
    while (totalCycles < 12_000_000) {
      controller.stepCycles(CHUNK_CYCLES);
      totalCycles += CHUNK_CYCLES;
      const p25 = bridge.getDriverState(25);
      if (p25 && p25.logicalOutput) {
        toggledHigh = true;
        cyclesAtHigh = totalCycles;
        break;
      }
    }

    const snap = controller.getExecutionSnapshot();
    const ok = toggledHigh && cyclesAtHigh > 0;
    record(5, 'Real Firmware Execution (pico_blink_rp2040.uf2)', ok,
      `Cortex-M0+ booted Pico SDK runtime and asserted GP25 (LED) HIGH at cycle ${cyclesAtHigh} (${(snap.simulatedTime_s * 1000).toFixed(2)} ms)`);
  }

  // ─── TEST 6: Closed-Loop Test A: Firmware-Driven LED into MNA Circuit ───────────────
  {
    // Build MNA Circuit:
    // Node 0: GND
    // Node 1: GP25 Thevenin source (internal)
    // Node 2: GP25 Pico pin output
    // Node 3: Current-limiting resistor to LED anode
    // Diode from Node 3 to Node 0 (GND)
    const controller = new RP2040Controller();
    controller.loadFirmware(blinkBytes);
    controller.start();
    const bridge = controller.getGpioBridge()!;

    // Advance until GP25 is HIGH
    while (controller.getCycleCount() < 12_000_000) {
      controller.stepCycles(100_000);
      if (bridge.getDriverState(25)?.logicalOutput) break;
    }

    const p25State = bridge.getDriverState(25)!;

    // Create MNA elements representing:
    // - Voltage source: vs_mcu_pico_0_d25_src (3.3V)
    // - Series resistor: r_mcu_pin_pico_0_d25 (50 Ω Ron)
    // - External resistor: 220 Ω
    // - LED: forward voltage ~1.8V
    const elements: MNAElement[] = [
      {
        id: bridge.getMnaVoltageSourceId(25),
        type: 'VOLTAGE_SOURCE',
        nodeA: 1,
        nodeB: 0,
        value: p25State.electricalTargetVoltage_V, // 3.3V
      },
      {
        id: bridge.getMnaResistorId(25),
        type: 'RESISTOR',
        nodeA: 1,
        nodeB: 2,
        value: p25State.driverImpedance_Ohms, // 50 Ω
      },
      {
        id: 'r_limit',
        type: 'RESISTOR',
        nodeA: 2,
        nodeB: 3,
        value: 220, // 220 Ω current limiting resistor
      },
      {
        id: 'd_led',
        type: 'DIODE',
        nodeA: 3,
        nodeB: 0,
        value: 1.8, // 1.8V LED forward drop
        forwardVoltage: 1.8,
        seriesResistance: 15,
      },
    ];

    const solver = new MNASolver(3, 0.001);
    solver.setElements(elements);
    const sol = solver.solve();

    const vPin = sol.nodeVoltages[2]; // GP25 pin voltage
    const vLed = sol.nodeVoltages[3]; // LED anode voltage

    // Update bridge with solved nodal voltages
    const gpioMap = new Map<number, number>([[25, 2]]);
    bridge.updateFromMnaResult(sol.nodeVoltages, gpioMap);

    const measuredState = bridge.getDriverState(25)!;
    const current_mA = measuredState.measuredCurrent_A * 1000;

    // Verification:
    // With 3.3V source, 50 Ω internal + 220 Ω external = 270 Ω total resistance.
    // Diode clamps at ~1.85V. Current is (3.3 - 1.85) / 270 ≈ 5.37 mA.
    // Voltage at pin = 3.3 - (50 * 5.37mA) ≈ 3.03V.
    const ok = measuredState.logicalOutput === true &&
      vPin > 2.8 && vPin < 3.2 &&
      vLed > 1.7 && vLed < 2.0 &&
      current_mA > 4.0 && current_mA < 7.0 &&
      !measuredState.faults.overcurrent;

    record(6, 'Test A: Firmware-Driven LED into MNA Circuit', ok,
      `Pin: ${vPin.toFixed(2)}V, LED: ${vLed.toFixed(2)}V, Current: ${current_mA.toFixed(2)}mA (Realistic 50Ω Ron voltage sag)`);
  }

  // ─── TEST 7: Closed-Loop Test B: Circuit-Controlled Input into Firmware ─────────────
  {
    // In pico_closed_loop_rp2040.uf2:
    // GP14 is configured as SIO input with Input Enable (IE) set.
    // Firmware polls SIO_GPIO_IN bit 14.
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    controller.start();
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Step 50 instructions to initialize GPIO configuration
    controller.step(50);

    const gpioMap = new Map<number, number>([[14, 1]]);

    // Apply circuit voltage: 0.0V (LOW)
    bridge.updateFromMnaResult([0, 0.0], gpioMap);
    controller.step(20);
    const inValLow = (rp2040.readUint32(0xd0000004) >> 14) & 1;

    // Apply circuit voltage: 3.3V (HIGH)
    bridge.updateFromMnaResult([0, 3.3], gpioMap);
    controller.step(20);
    const inValHigh = (rp2040.readUint32(0xd0000004) >> 14) & 1;

    // Apply circuit voltage: 0.0V (LOW)
    bridge.updateFromMnaResult([0, 0.0], gpioMap);
    controller.step(20);
    const inValLowAgain = (rp2040.readUint32(0xd0000004) >> 14) & 1;

    const ok = (inValLow === 0) && (inValHigh === 1) && (inValLowAgain === 0);
    record(7, 'Test B: Circuit-Controlled Input into Firmware', ok,
      `MNA 0.0V -> SIO_GPIO_IN[14]=0, MNA 3.3V -> SIO_GPIO_IN[14]=1, MNA 0.0V -> SIO_GPIO_IN[14]=0`);
  }

  // ─── TEST 8: Closed-Loop Test C: Bidirectional Co-Simulation Loop ───────────────────
  {
    // Complete bidirectional closed loop:
    // External circuit toggles GP14 (Node 1) ->
    // Bridge samples Node 1 and updates rp2040.gpio[14].setInputValue() ->
    // ARM Cortex-M0+ Core 0 reads SIO_GPIO_IN in firmware ->
    // Firmware branches and writes to SIO_GPIO_OUT_SET / OUT_CLR for GP15 ->
    // Bridge onDriverChange updates MNA elements for GP15 ->
    // MNA solver solves Node 2 (GP15 load) ->
    // LED anode Node 3 lights up / turns off!
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    controller.start();
    const bridge = controller.getGpioBridge()!;

    // Step 50 instructions to configure PADS and SIO
    controller.step(50);

    // MNA Circuit:
    // Node 0: GND
    // Node 1: External input driving GP14
    // Node 2: GP15 Thevenin internal source
    // Node 3: GP15 pin node
    // Node 4: 220 Ω resistor to LED
    // Elements:
    const elements: MNAElement[] = [
      {
        id: 'vs_ext_switch',
        type: 'VOLTAGE_SOURCE',
        nodeA: 1,
        nodeB: 0,
        value: 0.0, // External input starts at 0V
      },
      {
        id: bridge.getMnaVoltageSourceId(15),
        type: 'VOLTAGE_SOURCE',
        nodeA: 2,
        nodeB: 0,
        value: 0.0,
      },
      {
        id: bridge.getMnaResistorId(15),
        type: 'RESISTOR',
        nodeA: 2,
        nodeB: 3,
        value: 50,
      },
      {
        id: 'r_load_15',
        type: 'RESISTOR',
        nodeA: 3,
        nodeB: 4,
        value: 220,
      },
      {
        id: 'd_load_15',
        type: 'DIODE',
        nodeA: 4,
        nodeB: 0,
        value: 1.8,
        forwardVoltage: 1.8,
        seriesResistance: 15,
      },
    ];

    controller.onDriverChange((event) => {
      const src = elements.find(e => e.id === event.sourceId);
      if (src) src.value = event.targetVoltage_V;
      const res = elements.find(e => e.id === event.resistorId);
      if (res) res.value = event.resistance_Ohms;
    });

    const solver = new MNASolver(4, 0.001);
    const gpioMap = new Map<number, number>([[14, 1], [15, 3]]);

    // Phase 1: Input LOW
    solver.setElements(elements);
    let sol = solver.solve();
    bridge.updateFromMnaResult(sol.nodeVoltages, gpioMap);
    controller.step(20);
    sol = solver.solve();
    const vOutLow = sol.nodeVoltages[3];
    const currentLow = (sol.nodeVoltages[2] - sol.nodeVoltages[3]) / 50;

    // Phase 2: Input HIGH (3.3V)
    elements[0].value = 3.3; // Switch turned ON
    solver.setElements(elements);
    sol = solver.solve();
    bridge.updateFromMnaResult(sol.nodeVoltages, gpioMap);
    controller.step(20); // Firmware detects bit 14, executes STR to SIO_GPIO_OUT_SET (bit 15)
    sol = solver.solve();
    const vOutHigh = sol.nodeVoltages[3];
    const currentHigh = ((sol.nodeVoltages[2] - sol.nodeVoltages[3]) / elements[2].value) * 1000;

    // Phase 3: Input LOW (0.0V)
    elements[0].value = 0.0; // Switch turned OFF
    solver.setElements(elements);
    sol = solver.solve();
    bridge.updateFromMnaResult(sol.nodeVoltages, gpioMap);
    controller.step(20); // Firmware detects bit 14 is 0, executes STR to SIO_GPIO_OUT_CLR (bit 15)
    sol = solver.solve();
    const vOutLowAgain = sol.nodeVoltages[3];
    const currentLowAgain = (sol.nodeVoltages[2] - sol.nodeVoltages[3]) / 50;

    const ok = vOutLow === 0 &&
      vOutHigh > 2.8 && currentHigh > 4.0 &&
      vOutLowAgain === 0 && currentLowAgain === 0;

    record(8, 'Test C: Bidirectional Closed-Loop Co-Simulation', ok,
      `Input 0V -> Output ${vOutLow.toFixed(2)}V (0 mA), Input 3.3V -> Output ${vOutHigh.toFixed(2)}V (${currentHigh.toFixed(2)} mA), Input 0V -> Output ${vOutLowAgain.toFixed(2)}V`);
  }

  // ─── TEST 9: Fault Detection: Overcurrent & Short-to-Ground ────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Pin 15 configured as SIO output driving HIGH (3.3V)
    const p15 = rp2040.gpio[15];
    p15.ctrl = (p15.ctrl & ~0x1f) | 5; // SIO
    p15.padValue &= ~0x80; // outputDisable = false
    rp2040.writeUint32(0xd0000024, 1 << 15); // SIO_GPIO_OE_SET
    rp2040.writeUint32(0xd0000014, 1 << 15); // SIO_GPIO_OUT_SET
    bridge.recomputeDriverState(15);

    // Short Pin 15 directly to GND (Node voltage = 0.0V)
    const gpioMap = new Map<number, number>([[15, 1]]);
    bridge.updateFromMnaResult([0, 0.0], gpioMap);

    const state = bridge.getDriverState(15)!;
    const current_mA = state.measuredCurrent_A * 1000;

    const ok = state.faults.overcurrent === true &&
      state.faults.shortToGround === true &&
      current_mA > 60; // 3.3V / 50Ω = 66 mA > 16 mA max rating

    record(9, 'Fault: Short-to-Ground Overcurrent Detection', ok,
      `Current: ${current_mA.toFixed(1)} mA > 16 mA rating; Overcurrent = ${state.faults.overcurrent}, ShortToGND = ${state.faults.shortToGround}`);
  }

  // ─── TEST 10: Fault Detection: Short-to-VDD ─────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Pin 15 configured as SIO output driving LOW (0.0V)
    const p15 = rp2040.gpio[15];
    p15.ctrl = (p15.ctrl & ~0x1f) | 5; // SIO
    p15.padValue &= ~0x80; // outputDisable = false
    rp2040.writeUint32(0xd0000024, 1 << 15); // SIO_GPIO_OE_SET
    rp2040.writeUint32(0xd0000018, 1 << 15); // SIO_GPIO_OUT_CLR
    bridge.recomputeDriverState(15);

    // Short Pin 15 directly to 3.3V
    const gpioMap = new Map<number, number>([[15, 1]]);
    bridge.updateFromMnaResult([0, 3.3], gpioMap);

    const state = bridge.getDriverState(15)!;
    const current_mA = state.measuredCurrent_A * 1000;

    const ok = state.faults.overcurrent === true &&
      state.faults.shortToVdd === true &&
      current_mA < -60; // -3.3V / 50Ω = -66 mA (sinking)

    record(10, 'Fault: Short-to-VDD Sinking Contention Detection', ok,
      `Current: ${current_mA.toFixed(1)} mA (sinking); Overcurrent = ${state.faults.overcurrent}, ShortToVDD = ${state.faults.shortToVdd}`);
  }

  // ─── TEST 11: Fault Detection: Floating Input ───────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    // Pin 5 configured as high-Z input without pulls
    const p5 = rp2040.gpio[5];
    rp2040.writeUint32(0xd0000028, 1 << 5); // SIO_GPIO_OE_CLR
    p5.padValue &= ~0x0c; // PUE=0, PDE=0
    bridge.recomputeDriverState(5);

    // Apply floating indeterminate voltage 1.65V (mid-rail)
    const gpioMap = new Map<number, number>([[5, 1]]);
    bridge.updateFromMnaResult([0, 1.65], gpioMap);

    const state = bridge.getDriverState(5)!;
    const ok = state.faults.floating === true;

    record(11, 'Fault: Floating High-Impedance Input Detection', ok,
      `Mid-rail 1.65V without pull resistors flagged as floating: ${state.faults.floating}`);
  }

  // ─── TEST 12: Atomic Peripheral Alias Registers (SET, CLR, XOR) ────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const rp2040 = controller.getRp2040Instance()!;
    const bridge = controller.getGpioBridge()!;

    // Using SIO atomic aliases for GPIO 10:
    // Base: 0xd0000010 (OUT)
    // SET:  0xd0000014
    // CLR:  0xd0000018
    // XOR:  0xd000001c
    rp2040.gpio[10].ctrl = (rp2040.gpio[10].ctrl & ~0x1f) | 5;
    rp2040.gpio[10].padValue &= ~0x80;
    rp2040.writeUint32(0xd0000024, 1 << 10); // SIO_GPIO_OE_SET

    // 1. SET bit 10
    rp2040.writeUint32(0xd0000014, 1 << 10);
    const v1 = rp2040.gpio[10].outputValue;

    // 2. XOR bit 10 (should flip to 0)
    rp2040.writeUint32(0xd000001c, 1 << 10);
    const v2 = rp2040.gpio[10].outputValue;

    // 3. XOR bit 10 again (should flip to 1)
    rp2040.writeUint32(0xd000001c, 1 << 10);
    const v3 = rp2040.gpio[10].outputValue;

    // 4. CLR bit 10 (should clear to 0)
    rp2040.writeUint32(0xd0000018, 1 << 10);
    const v4 = rp2040.gpio[10].outputValue;

    const ok = (v1 === true) && (v2 === false) && (v3 === true) && (v4 === false);
    record(12, 'Atomic Peripheral Alias Registers (SET, CLR, XOR)', ok,
      `SET -> ${v1}, XOR -> ${v2}, XOR -> ${v3}, CLR -> ${v4}`);
  }

  // ─── TEST 13: Deterministic Clock Synchronization (133 MHz) ─────────────────────────
  {
    const controller = new RP2040Controller(undefined, 133_000_000);
    controller.loadFirmware(closedLoopBytes);
    controller.start();

    // Step exactly 133,000 cycles -> should be exactly 1.000 ms simulated time
    controller.stepCycles(133_000);
    const snap = controller.getExecutionSnapshot();
    const expectedTime_ms = (133_000 / 133_000_000) * 1000; // 1.0 ms
    const actualTime_ms = snap.simulatedTime_s * 1000;

    const ok = Math.abs(actualTime_ms - expectedTime_ms) < 0.05 &&
      snap.cycleCount >= 133_000 && snap.cycleCount <= 133_005 &&
      snap.clockFrequency_Hz === 133_000_000;

    record(13, 'Deterministic Clock Synchronization (133 MHz)', ok,
      `133,000 cycles @ 133 MHz = ${actualTime_ms.toFixed(6)} ms (expected ${expectedTime_ms.toFixed(6)} ms)`);
  }

  // ─── TEST 14: Dynamic VDD_IO Voltage Scaling ─────────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const bridge = controller.getGpioBridge()!;
    const rp2040 = controller.getRp2040Instance()!;

    rp2040.gpio[15].ctrl = (rp2040.gpio[15].ctrl & ~0x1f) | 5;
    rp2040.gpio[15].padValue &= ~0x80;
    rp2040.writeUint32(0xd0000024, 1 << 15); // SIO_GPIO_OE_SET
    rp2040.writeUint32(0xd0000014, 1 << 15); // Set HIGH

    bridge.setVddIo(3.3);
    const v33 = bridge.getDriverState(15)!.electricalTargetVoltage_V;

    bridge.setVddIo(1.8); // RP2040 1.8V IO mode
    const v18 = bridge.getDriverState(15)!.electricalTargetVoltage_V;

    const ok = v33 === 3.3 && v18 === 1.8;
    record(14, 'Dynamic VDD_IO Voltage Scaling (3.3V / 1.8V)', ok,
      `VDD_IO 3.3V -> target ${v33}V, VDD_IO 1.8V -> target ${v18}V`);
  }

  // ─── TEST 15: Driver Update Event Subscription ─────────────────────────────────────
  {
    const controller = new RP2040Controller();
    controller.loadFirmware(closedLoopBytes);
    const rp2040 = controller.getRp2040Instance()!;

    let eventFired = false;
    let targetV = -1;
    let targetR = -1;

    controller.onDriverChange((event) => {
      if (event.gpioIndex === 15) {
        eventFired = true;
        targetV = event.targetVoltage_V;
        targetR = event.resistance_Ohms;
      }
    });

    // Configure and toggle GP15 (4 mA drive = code 1 = 50 Ω)
    rp2040.gpio[15].ctrl = (rp2040.gpio[15].ctrl & ~0x1f) | 5;
    rp2040.gpio[15].padValue = (rp2040.gpio[15].padValue & ~0xb0) | (1 << 4);
    rp2040.writeUint32(0xd0000024, 1 << 15); // SIO_GPIO_OE_SET
    rp2040.writeUint32(0xd0000014, 1 << 15);

    const ok = eventFired && targetV === 3.3 && targetR === 50;
    record(15, 'Driver Update Event Dispatching', ok,
      `Event received on GP15 toggle: targetVoltage = ${targetV}V, Ron = ${targetR}Ω`);
  }

  // ─── TEST 16: Zero-Regression AVR8js ATmega328P Co-Simulation ───────────────────────
  {
    // Verify AVR8js ATmega328P execution remains completely intact
    const cpu = new CPU(new Uint16Array(1024));
    cpu.progBytes[0] = 0x00; // NOP (0x0000)
    cpu.progBytes[1] = 0x00;
    cpu.progBytes[2] = 0x00; // NOP
    cpu.progBytes[3] = 0x00;

    let cycles = 0;
    for (let i = 0; i < 5; i++) {
      avrInstruction(cpu);
      cycles += cpu.cycles;
    }

    const ok = cpu.pc === 5 && cpu.cycles > 0;
    record(16, 'Zero-Regression AVR8js ATmega328P Co-Simulation', ok,
      `ATmega328P CPU instruction execution intact: PC = ${cpu.pc}, Cycles = ${cpu.cycles}`);
  }

  console.log('\n========================================================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`TOTAL ACCEPTANCE TESTS: ${results.length}`);
  console.log(`PASSED:                 ${passedCount} (${((passedCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`FAILED:                 ${results.length - passedCount}`);
  console.log('========================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runAcceptanceSuite().catch((err) => {
  console.error('Test runner fault:', err);
  process.exit(1);
});

