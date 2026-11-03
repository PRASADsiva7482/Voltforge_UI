import assert from 'node:assert/strict';
import { getPinsForComponent, boardPinRegistry, ARDUINO_UNO_PINS } from '../features/canvas/pinRegistry';
import { getBoardProfile, getBoardExecutionCapability, supportsAvr8js } from '../features/canvas/boardCatalog';
import { PcbSchematicSync, generatePcbFootprintGeometry } from '../features/pcb/pcbSchematicSync';
import { MqttBridge } from '../features/simulator/network/MqttBridge';
import type { CanvasNode, Wire } from '../types/domain';

console.log('--- VOLTFORGE PHASE 1 AUTOMATED REGRESSION SUITE ---');

// ═══════════════════════════════════════════════════════════════════════════
// Test 1: DEF-SCH-001 — Arduino Uno Canonical Pin Array
// ═══════════════════════════════════════════════════════════════════════════
{
  console.log('[Test 1] DEF-SCH-001: Arduino Uno Canonical Pin Array');

  // 1. Direct constant export
  assert(Array.isArray(ARDUINO_UNO_PINS), 'ARDUINO_UNO_PINS must be an array');
  assert.equal(ARDUINO_UNO_PINS.length, 32, 'ARDUINO_UNO_PINS must contain exactly 32 verified pins');

  // 2. Catalog registry lookup
  const regPins = boardPinRegistry['ARDUINO_UNO'];
  assert(regPins && regPins.length === 32, 'boardPinRegistry[ARDUINO_UNO] must have 32 pins');

  // 3. getPinsForComponent with default board type
  const resolvedPins = getPinsForComponent('ARDUINO_UNO');
  assert.equal(resolvedPins.length, 32, 'getPinsForComponent must recover all 32 pins for Uno');

  // 4. Verify critical pins exist
  const pinIds = new Set(resolvedPins.map((p) => p.id));
  assert(pinIds.has('d13'), 'Pin D13 must exist');
  assert(pinIds.has('a0'), 'Pin A0 must exist');
  assert(pinIds.has('5v'), 'Pin 5V must exist');
  assert(pinIds.has('gnd1'), 'Pin GND1 must exist');
  assert(pinIds.has('gnd2'), 'Pin GND2 must exist');
  assert(pinIds.has('rst'), 'Pin RST must exist');

  console.log('  -> PASS: Uno pins canonical array verified (32 pins, correct IDs)');
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 2: DEF-PCB-003 — PCB Multi-Wire Electrical Net Grouping
// ═══════════════════════════════════════════════════════════════════════════
{
  console.log('[Test 2] DEF-PCB-003: Multi-wire Electrical Net Grouping (Union-Find)');

  const sync = new PcbSchematicSync();

  // Circuit: A:1 -> B:1 (wire1), B:1 -> C:1 (wire2) [Daisy chain / T-junction: 1 electrical net]
  // Circuit 2: C:2 -> D:1 (wire3) [Completely separate net]
  const nodes: CanvasNode[] = [
    {
      id: 'nodeA',
      name: 'Resistor A',
      type: 'RESISTOR',
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      rotation: 0,
      properties: {},
      pins: [
        { id: '1', name: '1', type: 'passive', x: 0, y: 0 },
        { id: '2', name: '2', type: 'passive', x: 10, y: 0 },
      ],
    },
    {
      id: 'nodeB',
      name: 'Resistor B',
      type: 'RESISTOR',
      x: 50,
      y: 0,
      width: 40,
      height: 40,
      rotation: 0,
      properties: {},
      pins: [
        { id: '1', name: '1', type: 'passive', x: 0, y: 0 },
        { id: '2', name: '2', type: 'passive', x: 10, y: 0 },
      ],
    },
    {
      id: 'nodeC',
      name: 'Resistor C',
      type: 'RESISTOR',
      x: 100,
      y: 0,
      width: 40,
      height: 40,
      rotation: 0,
      properties: {},
      pins: [
        { id: '1', name: '1', type: 'passive', x: 0, y: 0 },
        { id: '2', name: '2', type: 'passive', x: 10, y: 0 },
      ],
    },
    {
      id: 'nodeD',
      name: 'Resistor D',
      type: 'RESISTOR',
      x: 150,
      y: 0,
      width: 40,
      height: 40,
      rotation: 0,
      properties: {},
      pins: [
        { id: '1', name: '1', type: 'passive', x: 0, y: 0 },
        { id: '2', name: '2', type: 'passive', x: 10, y: 0 },
      ],
    },
  ];

  const wires: Wire[] = [
    { id: 'w1_AB', fromNodeId: 'nodeA', fromPinId: '1', toNodeId: 'nodeB', toPinId: '1', routingMode: 'orthogonal', color: '#00ff00' },
    { id: 'w2_BC', fromNodeId: 'nodeB', fromPinId: '1', toNodeId: 'nodeC', toPinId: '1', routingMode: 'orthogonal', color: '#00ff00' },
    { id: 'w3_CD', fromNodeId: 'nodeC', fromPinId: '2', toNodeId: 'nodeD', toPinId: '1', routingMode: 'orthogonal', color: '#00ff00' },
  ];

  const result = sync.reconcile(nodes, wires, [], []);

  const fpA = result.footprints.find((f) => f.componentId === 'nodeA')!;
  const fpB = result.footprints.find((f) => f.componentId === 'nodeB')!;
  const fpC = result.footprints.find((f) => f.componentId === 'nodeC')!;
  const fpD = result.footprints.find((f) => f.componentId === 'nodeD')!;

  const netA1 = fpA.pads.find((p) => p.id === '1')?.netId;
  const netB1 = fpB.pads.find((p) => p.id === '1')?.netId;
  const netC1 = fpC.pads.find((p) => p.id === '1')?.netId;
  const netC2 = fpC.pads.find((p) => p.id === '2')?.netId;
  const netD1 = fpD.pads.find((p) => p.id === '1')?.netId;

  // The multi-wire segment A:1 -> B:1 -> C:1 MUST share the EXACT same net ID!
  assert(netA1 !== undefined, 'Net for A:1 must be defined');
  assert.equal(netA1, netB1, 'Net A:1 and B:1 must have identical net ID');
  assert.equal(netB1, netC1, 'Net B:1 and C:1 must have identical net ID');

  // Separate circuit C:2 -> D:1 must share a DIFFERENT net ID
  assert(netC2 !== undefined, 'Net for C:2 must be defined');
  assert.equal(netC2, netD1, 'Net C:2 and D:1 must share net ID');
  assert.notEqual(netA1, netC2, 'Net A:1-B:1-C:1 must be isolated from separate net C:2-D:1');

  console.log(`  -> PASS: Multi-wire net grouping unified: net1=${netA1}, net2=${netC2}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 3: DEF-PCB-002 — Real Physical PCB Footprint Mapping
// ═══════════════════════════════════════════════════════════════════════════
{
  console.log('[Test 3] DEF-PCB-002: Real Physical Footprint Geometry');

  // 1. Resistor (Axial 7.62mm pitch)
  const resNode: CanvasNode = {
    id: 'r1',
    name: 'R1',
    type: 'RESISTOR',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    properties: {},
    pins: [
      { id: '1', name: '1', type: 'passive', x: 0, y: 0 },
      { id: '2', name: '2', type: 'passive', x: 10, y: 0 },
    ],
  };
  const resGeom = generatePcbFootprintGeometry(resNode);
  assert.equal(resGeom.packageType, 'RES_AXIAL_0.3');
  assert.equal(resGeom.pads.length, 2);
  assert.equal(resGeom.pads[0].x, -3.81);
  assert.equal(resGeom.pads[1].x, 3.81);
  assert.equal(resGeom.pads[0].y, 0);

  // 2. 555 Timer IC (DIP-8: dual-row, 7.62mm row spacing, 2.54mm pitch)
  const icNode: CanvasNode = {
    id: 'ic1',
    name: 'NE555',
    type: 'IC_555',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    properties: {},
    pins: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'].map((id, i) => ({
      id,
      name: id,
      type: 'bidirectional' as const,
      x: 0,
      y: i * 5,
    })),
  };
  const icGeom = generatePcbFootprintGeometry(icNode);
  assert.equal(icGeom.packageType, 'DIP-8');
  assert.equal(icGeom.pads.length, 8);
  // Left row (pins 0..3) at x = -3.81
  assert.equal(icGeom.pads[0].x, -3.81);
  assert.equal(icGeom.pads[3].x, -3.81);
  // Right row (pins 4..7) at x = +3.81
  assert.equal(icGeom.pads[4].x, 3.81);
  assert.equal(icGeom.pads[7].x, 3.81);
  // Pin 1 has rectangular pad for orientation
  assert.equal(icGeom.pads[0].shape, 'rect');
  assert.equal(icGeom.pads[1].shape, 'circle');

  // 3. Arduino Uno Header Footprint
  const unoNode: CanvasNode = {
    id: 'uno1',
    name: 'Arduino Uno',
    type: 'ARDUINO_UNO',
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    rotation: 0,
    properties: {},
    pins: ARDUINO_UNO_PINS,
  };
  const unoGeom = generatePcbFootprintGeometry(unoNode);
  assert.equal(unoGeom.packageType, 'MODULE_ARDUINO_UNO');
  assert.equal(unoGeom.width, 68.6);
  assert.equal(unoGeom.height, 53.4);
  assert.equal(unoGeom.pads.length, 32);

  console.log('  -> PASS: Standard footprints generated with true dimensions (Axial, DIP-8, Uno module)');
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 4: DEF-FIRM-001 — Board Execution Capability & Non-AVR Handling
// ═══════════════════════════════════════════════════════════════════════════
{
  console.log('[Test 4] DEF-FIRM-001: Board Execution Capability Model');

  // 1. Arduino Uno: full emulation
  const unoCap = getBoardExecutionCapability('ARDUINO_UNO');
  assert.equal(unoCap.mcuArchitecture, 'AVR');
  assert.equal(unoCap.virtualEmulator, 'avr8js');
  assert.equal(unoCap.executionCapability, 'COMPILED_AND_INTERPRETER');
  assert(supportsAvr8js('ARDUINO_UNO'), 'Uno must support AVR8js');

  // 2. Arduino Nano: full emulation
  const nanoCap = getBoardExecutionCapability('ARDUINO_NANO');
  assert.equal(nanoCap.mcuArchitecture, 'AVR');
  assert.equal(nanoCap.virtualEmulator, 'avr8js');

  // 3. ESP32: compilation only, no browser emulator
  const espCap = getBoardExecutionCapability('ESP32');
  assert.equal(espCap.mcuArchitecture, 'Xtensa');
  assert.equal(espCap.virtualEmulator, 'none');
  assert.equal(espCap.executionCapability, 'COMPILATION_ONLY_NO_EMULATOR');
  assert(!supportsAvr8js('ESP32'), 'ESP32 must not report AVR8js support');

  // 4. Raspberry Pi Pico: compilation only, no browser emulator
  const picoCap = getBoardExecutionCapability('RASPBERRY_PI_PICO');
  assert.equal(picoCap.mcuArchitecture, 'ARM-Cortex-M');
  assert.equal(picoCap.virtualEmulator, 'none');
  assert.equal(picoCap.executionCapability, 'COMPILATION_ONLY_NO_EMULATOR');
  assert(!supportsAvr8js('RASPBERRY_PI_PICO'), 'Pico must not report AVR8js support');

  // 5. STM32 Blue Pill: compilation only
  const stmCap = getBoardExecutionCapability('STM32_BLUE_PILL');
  assert.equal(stmCap.mcuArchitecture, 'ARM-Cortex-M');
  assert.equal(stmCap.virtualEmulator, 'none');

  console.log('  -> PASS: Board execution capability model correctly classifies AVR vs non-AVR targets');
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 5: Virtual IoT & MQTT Transport Honesty
// ═══════════════════════════════════════════════════════════════════════════
{
  console.log('[Test 5] MQTT & Virtual IoT: Transport Disclosure and Honesty');

  const mqtt = MqttBridge.getInstance();
  mqtt.setServer('broker.hivemq.com', 8884);
  mqtt.connect('test_device_42');

  const status = mqtt.getStatus();
  assert(status.connected, 'MQTT bridge should be marked connected');
  assert.equal(status.transport, 'virtual_loopback', 'Default MQTT connection must be reported as virtual_loopback');
  assert.equal(status.isExternal, false, 'isExternal must be false for virtual loopback');
  assert(status.modeDescription.includes('Virtual In-Memory Loopback'), 'Description must disclose virtual in-memory loopback');

  // Test loopback publish/receive
  let receivedPayload = '';
  mqtt.subscribe('test/topic');
  mqtt.setCallback((topic, payload) => {
    receivedPayload = payload;
  });

  mqtt.publish('test/topic', 'hello_voltforge');
  assert.equal(receivedPayload, 'hello_voltforge', 'Loopback message must deliver to subscriber callback');

  console.log('  -> PASS: MQTT status honestly discloses virtual loopback vs external network sockets');
}

console.log('--- ALL VOLTFORGE PHASE 1 AUTOMATED REGRESSIONS PASSED CLEANLY ---');
