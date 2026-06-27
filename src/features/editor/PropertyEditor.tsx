import { useState, useEffect } from 'react';

import { X, Sliders, Trash2, RotateCw, FlipHorizontal, FlipVertical, Lock, Unlock, Palette } from 'lucide-react';
import VfSegmentedControl from '../../components/ui/VfSegmentedControl';
import VfConfirmDialog from '../../components/ui/VfConfirmDialog';
import VfBadge from '../../components/ui/VfBadge';
import VfFormField from '../../components/ui/VfFormField';
import VfSelect from '../../components/ui/VfSelect';
import VfTextarea from '../../components/ui/VfTextarea';
import VfInput from '../../components/ui/VfInput';
import VfColorSelector from '../../components/ui/VfColorSelector';
import VfPropertyGrid from '../../components/ui/VfPropertyGrid';
import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import type { Wire } from '../../types';

// Property schemas for each component type
const propertySchemas: Record<string, { label: string; key: string; type: 'number' | 'text' | 'select' | 'color'; options?: string[]; unit?: string; min?: number; max?: number; step?: number }[]> = {
  RESISTOR: [
    { label: 'Resistance', key: 'resistance', type: 'number', unit: 'Ω', min: 0.1, max: 10000000, step: 0.1 },
    { label: 'Tolerance', key: 'tolerance', type: 'select', options: ['5%', '1%', '0.5%', '0.1%'] },
    { label: 'Power Rating', key: 'powerRating', type: 'select', options: ['0.125W', '0.25W', '0.5W', '1W', '2W'] },
  ],
  CAPACITOR: [
    { label: 'Capacitance', key: 'capacitance', type: 'number', unit: 'µF', min: 0.001, max: 100000, step: 0.001 },
    { label: 'Voltage Rating', key: 'voltageRating', type: 'select', options: ['10V', '16V', '25V', '50V', '100V'] },
  ],
  CERAMIC_CAPACITOR: [
    { label: 'Capacitance', key: 'capacitance', type: 'number', unit: 'pF', min: 1, max: 1000000, step: 1 },
    { label: 'Voltage Rating', key: 'voltageRating', type: 'select', options: ['16V', '25V', '50V', '100V'] },
  ],
  ELECTROLYTIC_CAPACITOR: [
    { label: 'Capacitance', key: 'capacitance', type: 'number', unit: 'uF', min: 0.47, max: 10000, step: 0.47 },
    { label: 'Voltage Rating', key: 'voltageRating', type: 'select', options: ['6.3V', '10V', '16V', '25V', '50V'] },
    { label: 'Polarity', key: 'polarity', type: 'select', options: ['Polarized'] },
  ],
  DIODE: [
    { label: 'Forward Voltage', key: 'forwardVoltage', type: 'number', unit: 'V', min: 0.1, max: 1.2, step: 0.05 },
    { label: 'Max Current', key: 'maxCurrent', type: 'number', unit: 'mA', min: 10, max: 1000, step: 10 },
    { label: 'Part Number', key: 'partNumber', type: 'text' },
  ],
  NPN_TRANSISTOR: [
    { label: 'Gain hFE', key: 'gain', type: 'number', min: 20, max: 800, step: 1 },
    { label: 'Collector Current', key: 'collectorCurrent', type: 'number', unit: 'mA', min: 10, max: 1000, step: 10 },
    { label: 'Part Number', key: 'partNumber', type: 'text' },
  ],
  PNP_TRANSISTOR: [
    { label: 'Gain hFE', key: 'gain', type: 'number', min: 20, max: 800, step: 1 },
    { label: 'Collector Current', key: 'collectorCurrent', type: 'number', unit: 'mA', min: 10, max: 1000, step: 10 },
    { label: 'Part Number', key: 'partNumber', type: 'text' },
  ],
  VOLTAGE_REGULATOR_7805: [
    { label: 'Output Voltage', key: 'outputVoltage', type: 'number', unit: 'V', min: 5, max: 5, step: 0.1 },
    { label: 'Max Current', key: 'maxCurrent', type: 'number', unit: 'A', min: 0.1, max: 1.5, step: 0.1 },
    { label: 'Dropout Voltage', key: 'dropoutVoltage', type: 'number', unit: 'V', min: 1.5, max: 2.5, step: 0.1 },
  ],
  LED_STANDARD: [
    { label: 'Color', key: 'color', type: 'color' },
    { label: 'Forward Voltage', key: 'forwardVoltage', type: 'number', unit: 'V', min: 1.5, max: 3.5, step: 0.1 },
    { label: 'Max Current', key: 'maxCurrent', type: 'number', unit: 'mA', min: 1, max: 30, step: 1 },
  ],
  LED_RGB: [
    { label: 'Red', key: 'rgbRed', type: 'number', min: 0, max: 255, step: 1 },
    { label: 'Green', key: 'rgbGreen', type: 'number', min: 0, max: 255, step: 1 },
    { label: 'Blue', key: 'rgbBlue', type: 'number', min: 0, max: 255, step: 1 },
    { label: 'Mode', key: 'rgbMode', type: 'select', options: ['Common Cathode', 'Common Anode'] },
  ],
  MOTOR_DC: [
    { label: 'Voltage', key: 'voltage', type: 'select', options: ['3V', '5V', '6V', '9V', '12V'] },
    { label: 'RPM', key: 'rpm', type: 'number', unit: 'rpm', min: 100, max: 30000, step: 100 },
  ],
  SERVO_MOTOR: [
    { label: 'Angle', key: 'angle', type: 'number', unit: '°', min: 0, max: 180, step: 1 },
    { label: 'Speed', key: 'speed', type: 'select', options: ['Slow', 'Normal', 'Fast'] },
  ],
  BUZZER: [
    { label: 'Frequency', key: 'frequency', type: 'number', unit: 'Hz', min: 20, max: 20000, step: 10 },
    { label: 'Type', key: 'buzzerType', type: 'select', options: ['Active', 'Passive'] },
  ],
  POTENTIOMETER: [
    { label: 'Max Resistance', key: 'maxResistance', type: 'number', unit: 'Ω', min: 100, max: 1000000, step: 100 },
    { label: 'Position', key: 'position', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
  ],
  PUSH_BUTTON: [
    { label: 'Type', key: 'buttonType', type: 'select', options: ['Momentary', 'Latching'] },
    { label: 'State', key: 'state', type: 'select', options: ['NO (Normally Open)', 'NC (Normally Closed)'] },
  ],
  BUTTON: [
    { label: 'Type', key: 'buttonType', type: 'select', options: ['Momentary', 'Latching'] },
    { label: 'State', key: 'state', type: 'select', options: ['NO (Normally Open)', 'NC (Normally Closed)'] },
  ],
  TEMP_SENSOR: [
    { label: 'Sensor Type', key: 'sensorType', type: 'select', options: ['DHT11', 'DHT22', 'LM35', 'DS18B20'] },
    { label: 'Temperature', key: 'temperature', type: 'number', unit: '°C', min: -40, max: 80, step: 0.5 },
    { label: 'Humidity', key: 'humidity', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
  ],
  ULTRASONIC_SENSOR: [
    { label: 'Max Range', key: 'maxRange', type: 'number', unit: 'cm', min: 2, max: 400, step: 1 },
    { label: 'Distance', key: 'distance', type: 'number', unit: 'cm', min: 2, max: 400, step: 1 },
  ],
  SENSOR_ULTRASONIC: [
    { label: 'Max Range', key: 'maxRange', type: 'number', unit: 'cm', min: 2, max: 400, step: 1 },
    { label: 'Distance', key: 'distance', type: 'number', unit: 'cm', min: 2, max: 400, step: 1 },
  ],
  SENSOR_DHT11: [
    { label: 'Temperature', key: 'temperature', type: 'number', unit: 'C', min: 0, max: 50, step: 0.5 },
    { label: 'Humidity', key: 'humidity', type: 'number', unit: '%', min: 20, max: 90, step: 1 },
  ],
  SENSOR_PIR: [
    { label: 'Detection Range', key: 'range', type: 'number', unit: 'm', min: 1, max: 7, step: 0.5 },
    { label: 'Retrigger Delay', key: 'delay', type: 'number', unit: 's', min: 0.3, max: 300, step: 0.1 },
  ],
  SENSOR_LDR: [
    { label: 'Light Level', key: 'lightLevel', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
    { label: 'Dark Resistance', key: 'resistanceDark', type: 'number', unit: 'ohm', min: 10000, max: 2000000, step: 1000 },
    { label: 'Light Resistance', key: 'resistanceLight', type: 'number', unit: 'ohm', min: 100, max: 50000, step: 100 },
  ],
  SENSOR_IMU: [
    { label: 'Accel X', key: 'accelerationX', type: 'number', unit: 'g', min: -16, max: 16, step: 0.1 },
    { label: 'Accel Y', key: 'accelerationY', type: 'number', unit: 'g', min: -16, max: 16, step: 0.1 },
    { label: 'Accel Z', key: 'accelerationZ', type: 'number', unit: 'g', min: -16, max: 16, step: 0.1 },
    { label: 'Gyro X', key: 'gyroX', type: 'number', unit: '°/s', min: -2000, max: 2000, step: 1 },
    { label: 'Gyro Y', key: 'gyroY', type: 'number', unit: '°/s', min: -2000, max: 2000, step: 1 },
    { label: 'Gyro Z', key: 'gyroZ', type: 'number', unit: '°/s', min: -2000, max: 2000, step: 1 },
  ],
  LCD_16X2: [
    { label: 'Backlight', key: 'backlight', type: 'select', options: ['On', 'Off'] },
    { label: 'Interface', key: 'interface', type: 'select', options: ['I2C', 'Parallel'] },
    { label: 'Text Line 1', key: 'line1', type: 'text' },
    { label: 'Text Line 2', key: 'line2', type: 'text' },
  ],
  DISPLAY_LCD_I2C: [
    { label: 'Backlight', key: 'backlight', type: 'select', options: ['On', 'Off'] },
    { label: 'I2C Address', key: 'address', type: 'select', options: ['0x27', '0x3F'] },
    { label: 'Text Line 1', key: 'line1', type: 'text' },
    { label: 'Text Line 2', key: 'line2', type: 'text' },
  ],
  DISPLAY_OLED: [
    { label: 'I2C Address', key: 'address', type: 'select', options: ['0x3C', '0x3D'] },
    { label: 'Text Line 1', key: 'line1', type: 'text' },
    { label: 'Text Line 2', key: 'line2', type: 'text' },
  ],
  RELAY_SPDT: [
    { label: 'Coil Voltage', key: 'coilVoltage', type: 'select', options: ['5V', '12V', '24V'] },
    { label: 'Max Load', key: 'maxLoad', type: 'select', options: ['5A', '10A', '20A', '30A'] },
  ],
  RELAY_SINGLE: [
    { label: 'Coil Voltage', key: 'coilVoltage', type: 'select', options: ['5V', '12V'] },
    { label: 'Max Load', key: 'maxLoad', type: 'select', options: ['5A', '10A'] },
    { label: 'Trigger', key: 'triggerType', type: 'select', options: ['Active Low', 'Active High'] },
  ],
  RELAY_2CH: [
    { label: 'Coil Voltage', key: 'coilVoltage', type: 'select', options: ['5V', '12V'] },
    { label: 'Max Load', key: 'maxLoad', type: 'select', options: ['5A', '10A', '20A'] },
    { label: 'Trigger', key: 'triggerType', type: 'select', options: ['Active Low', 'Active High'] },
  ],
  RELAY_4CH: [
    { label: 'Coil Voltage', key: 'coilVoltage', type: 'select', options: ['5V', '12V'] },
    { label: 'Max Load', key: 'maxLoad', type: 'select', options: ['5A', '10A', '20A'] },
    { label: 'Trigger', key: 'triggerType', type: 'select', options: ['Active Low', 'Active High'] },
  ],
  SWITCH_SPST: [
    { label: 'Type', key: 'switchType', type: 'select', options: ['Toggle', 'Slide'] },
    { label: 'State', key: 'state', type: 'select', options: ['Open', 'Closed'] },
  ],
  MOTOR_STEPPER: [
    { label: 'Steps/Rev', key: 'stepsPerRev', type: 'select', options: ['2048 (half-step)', '4096 (geared)'] },
    { label: 'Voltage', key: 'voltage', type: 'select', options: ['5V'] },
  ],
  MOTOR_SERVO: [
    { label: 'Angle', key: 'angle', type: 'number', unit: '°', min: 0, max: 180, step: 1 },
    { label: 'Speed', key: 'speed', type: 'select', options: ['Slow', 'Normal', 'Fast'] },
  ],
  DISPLAY_7SEG: [
    { label: 'Color', key: 'segColor', type: 'color' },
    { label: 'Type', key: 'segType', type: 'select', options: ['Common Cathode', 'Common Anode'] },
  ],
  LED_NEOPIXEL: [
    { label: 'Pixel Count', key: 'pixelCount', type: 'number', min: 1, max: 256, step: 1 },
    { label: 'Brightness', key: 'brightness', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
  ],
  ARDUINO_UNO: [
    { label: 'USB Connected', key: 'usbConnected', type: 'select', options: ['Yes', 'No'] },
  ],
  ARDUINO_NANO: [
    { label: 'USB Connected', key: 'usbConnected', type: 'select', options: ['Yes', 'No'] },
  ],
  ARDUINO_MEGA: [
    { label: 'USB Connected', key: 'usbConnected', type: 'select', options: ['Yes', 'No'] },
  ],
  ESP32: [
    { label: 'USB Connected', key: 'usbConnected', type: 'select', options: ['Yes', 'No'] },
  ],
  ESP32_S3: [
    { label: 'USB Connected', key: 'usbConnected', type: 'select', options: ['Yes', 'No'] },
  ],
  ESP8266: [
    { label: 'USB Connected', key: 'usbConnected', type: 'select', options: ['Yes', 'No'] },
  ],
  SENSOR_DHT22: [
    { label: 'Temperature', key: 'temperature', type: 'number', unit: '°C', min: -40, max: 80, step: 0.5 },
    { label: 'Humidity', key: 'humidity', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
  ],
  PIR_SENSOR: [
    { label: 'Detection Range', key: 'range', type: 'number', unit: 'm', min: 1, max: 7, step: 0.5 },
    { label: 'Motion Detected', key: 'motionDetected', type: 'select', options: ['false', 'true'] },
    { label: 'Retrigger Delay', key: 'delay', type: 'number', unit: 's', min: 0.3, max: 300, step: 0.1 },
  ],
  SOIL_MOISTURE: [
    { label: 'Moisture Level', key: 'moistureLevel', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
    { label: 'Threshold', key: 'threshold', type: 'number', unit: '%', min: 0, max: 100, step: 5 },
  ],
  IR_RECEIVER: [
    { label: 'Signal', key: 'irSignal', type: 'select', options: ['None', 'Power', 'Vol+', 'Vol-', 'Ch+', 'Ch-', 'Play', 'Custom'] },
  ],
  BLUETOOTH_MODULE: [
    { label: 'Module Name', key: 'moduleName', type: 'text' },
    { label: 'Baud Rate', key: 'baudRate', type: 'select', options: ['9600', '38400', '57600', '115200'] },
  ],
  WIFI_MODULE: [
    { label: 'SSID', key: 'ssid', type: 'text' },
    { label: 'Baud Rate', key: 'baudRate', type: 'select', options: ['9600', '115200'] },
  ],
  MOTOR_BLDC: [
    { label: 'Max RPM', key: 'maxRpm', type: 'number', unit: 'rpm', min: 1000, max: 30000, step: 500 },
    { label: 'KV Rating', key: 'kv', type: 'number', unit: 'KV', min: 100, max: 5000, step: 50 },
  ],
  ESC_MODULE: [
    { label: 'Max Current', key: 'maxCurrent', type: 'select', options: ['20A', '30A', '40A', '60A'] },
    { label: 'Throttle', key: 'escThrottle', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
  ],
  IC_555_TIMER: [
    { label: 'Mode', key: 'timerMode', type: 'select', options: ['Astable', 'Monostable'] },
  ],
  IC_74HC595: [
    { label: 'Latch Value', key: 'latchRegValue', type: 'number', min: 0, max: 255, step: 1 },
  ],
  BATTERY_9V: [
    { label: 'Voltage', key: 'voltage', type: 'number', unit: 'V', min: 0, max: 9, step: 0.1 },
  ],
  POWER_SUPPLY: [
    { label: 'Voltage', key: 'voltage', type: 'select', options: ['3.3V', '5V', '9V', '12V', '24V'] },
    { label: 'Max Current', key: 'maxCurrent', type: 'select', options: ['500mA', '1A', '2A', '3A', '5A'] },
  ],
  STEPPER_MOTOR: [
    { label: 'Steps/Rev', key: 'stepsPerRev', type: 'select', options: ['200 (1.8°)', '400 (0.9°)'] },
    { label: 'Voltage', key: 'voltage', type: 'select', options: ['5V', '12V', '24V'] },
  ],
};

// ── Wire Properties Panel ──
function WirePropertiesPanel() {
  const { selectedWireId, wires, updateWire, removeWire, selectWire } = useCanvasStore();
  const selectedWire = wires.find(w => w.id === selectedWireId);
  if (!selectedWire) return null;

  return (
      <div
        key={selectedWire.id}
        className="w-64 glass flex flex-col h-full bg-white/80 dark:bg-surface-950/80 animate-slide-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200/70 bg-surface-50/70 dark:border-white/5 dark:bg-surface-900/50">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-volt-400" />
            <h3 className="text-sm font-semibold text-surface-950 dark:text-white">Wire</h3>
          </div>
          <button onClick={() => selectWire(null)} className="p-1 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-950 dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Color picker */}
          <div>
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Color</h4>
            <VfColorSelector
              value={selectedWire.color || ''}
              onChange={(val) => updateWire(selectedWire.id, { color: val })}
              options={WIRE_COLORS.map(c => ({ value: c, label: c }))}
            />
          </div>

          {/* Routing mode */}
          <div>
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Routing</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateWire(selectedWire.id, { routingMode: 'straight' })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-medium border ${selectedWire.routingMode === 'straight' ? 'bg-volt-500/20 text-volt-500 border-volt-500/30 dark:text-volt-400' : 'bg-surface-100 text-surface-600 border-surface-200 dark:bg-white/5 dark:text-surface-400 dark:border-white/10'}`}
              >
                Straight
              </button>
              <button
                onClick={() => updateWire(selectedWire.id, { routingMode: 'orthogonal' })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-medium border ${selectedWire.routingMode === 'orthogonal' ? 'bg-volt-500/20 text-volt-500 border-volt-500/30 dark:text-volt-400' : 'bg-surface-100 text-surface-600 border-surface-200 dark:bg-white/5 dark:text-surface-400 dark:border-white/10'}`}
              >
                Orthogonal
              </button>
              <button
                onClick={() => updateWire(selectedWire.id, { routingMode: 'curved' })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-medium border ${selectedWire.routingMode === 'curved' ? 'bg-volt-500/20 text-volt-500 border-volt-500/30 dark:text-volt-400' : 'bg-surface-100 text-surface-600 border-surface-200 dark:bg-white/5 dark:text-surface-400 dark:border-white/10'}`}
              >
                Curved
              </button>
              <button
                onClick={() => updateWire(selectedWire.id, { routingMode: 'auto' })}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-medium border ${selectedWire.routingMode === 'auto' ? 'bg-volt-500/20 text-volt-500 border-volt-500/30 dark:text-volt-400' : 'bg-surface-100 text-surface-600 border-surface-200 dark:bg-white/5 dark:text-surface-400 dark:border-white/10'}`}
              >
                Smart
              </button>
            </div>
          </div>

          {/* Label */}
          <div>
            <VfInput
              type="text"
              value={selectedWire.label || ''}
              onChange={(e) => updateWire(selectedWire.id, { label: e.target.value })}
              placeholder="e.g. SCL, SDA, VCC..."
              inputSize="sm"
            />
          </div>

          {/* Bend points info */}
          <div>
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1 dark:text-surface-400">Bend Points</h4>
            <p className="text-[10px] text-surface-500">
              {selectedWire.bendPoints.length} points • Double-click wire to add • Double-click point to remove
            </p>
          </div>
        </div>

        <div className="p-3 border-t border-surface-200/70 dark:border-white/5">
          <button
            onClick={() => { removeWire(selectedWire.id); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete Wire
          </button>
        </div>
      </div>
  );
}

function PropertyInput({
  propKey,
  value,
  type,
  min,
  max,
  step,
  onChange,
}: {
  propKey: string;
  value: any;
  type: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (key: string, val: any) => void;
}) {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleCommit = () => {
    if (localVal !== value) {
      onChange(propKey, type === 'number' ? Number(localVal) : localVal);
    }
  };

  return (
    <VfInput
      type={type}
      value={localVal ?? ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleCommit();
      }}
      inputSize="sm"
    />
  );
}

// ── Component Properties Panel ──
export default function PropertyEditor() {
  const { selectedNodeId, selectedWireId, nodes, updateNode, removeNode } = useCanvasStore();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // If wire is selected, show wire panel
  if (selectedWireId) return <WirePropertiesPanel />;

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  if (!selectedNode) return null;

  const schema = propertySchemas[selectedNode.type] || [];
  const properties = selectedNode.properties || {};

  const handlePropertyChange = (key: string, value: unknown) => {
    updateNode(selectedNode.id, {
      properties: { ...properties, [key]: value },
    });
  };

  const handleRotate = (angle: number) => {
    const newRot = ((selectedNode.rotation || 0) + angle) % 360;
    updateNode(selectedNode.id, { rotation: newRot });
  };

  const toggleLock = () => {
    handlePropertyChange('locked', !properties.locked);
  };

  return (
      <div
        key={selectedNode.id}
        className="w-72 glass flex flex-col h-full bg-white/80 dark:bg-surface-950/80 animate-slide-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200/70 bg-surface-50/70 dark:border-white/5 dark:bg-surface-900/50">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-volt-400" />
            <h3 className="text-sm font-semibold text-surface-950 truncate dark:text-white">{selectedNode.name}</h3>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleLock} className="p-1 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-950 dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white" title={properties.locked ? 'Unlock' : 'Lock'}>
              {properties.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => useCanvasStore.getState().selectNode(null)} className="p-1 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-950 dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Type Badge */}
          <div className="flex items-center gap-2">
            <VfBadge variant="secondary">
              {selectedNode.type.replace(/_/g, ' ')}
            </VfBadge>
          </div>

          {/* Position */}
          <VfFormField label="Position">
            <div className="grid grid-cols-2 gap-2">
              <VfInput
                type="number"
                value={Math.round(selectedNode.x)}
                onChange={(e) => updateNode(selectedNode.id, { x: Number(e.target.value) })}
                inputSize="sm"
                iconLeft={<span className="text-[10px] text-slate-500 font-bold">X</span>}
              />
              <VfInput
                type="number"
                value={Math.round(selectedNode.y)}
                onChange={(e) => updateNode(selectedNode.id, { y: Number(e.target.value) })}
                inputSize="sm"
                iconLeft={<span className="text-[10px] text-slate-500 font-bold">Y</span>}
              />
            </div>
          </VfFormField>

          {/* Rotation with quick buttons */}
          <div>
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Transform</h4>
            <VfSegmentedControl
              options={[
                { value: 0, label: '0°' },
                { value: 90, label: '90°' },
                { value: 180, label: '180°' },
                { value: 270, label: '270°' }
              ]}
              selected={selectedNode.rotation || 0}
              onChange={(val) => updateNode(selectedNode.id, { rotation: val })}
              className="mb-2"
            />
            <input type="range" min="0" max="359" step="1" value={selectedNode.rotation || 0}
              onChange={(e) => updateNode(selectedNode.id, { rotation: Number(e.target.value) })}
              className="w-full accent-volt-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-surface-500 mt-1">
              <span>0°</span>
              <span className="text-volt-400 font-medium">{selectedNode.rotation || 0}°</span>
              <span>359°</span>
            </div>
          </div>

          {/* Size */}
          <VfFormField label="Size">
            <div className="grid grid-cols-2 gap-2">
              <VfInput
                type="number"
                value={Math.round(selectedNode.width)}
                min={20}
                onChange={(e) => updateNode(selectedNode.id, { width: Math.max(20, Number(e.target.value)) })}
                inputSize="sm"
                iconLeft={<span className="text-[10px] text-slate-500 font-bold">W</span>}
              />
              <VfInput
                type="number"
                value={Math.round(selectedNode.height)}
                min={20}
                onChange={(e) => updateNode(selectedNode.id, { height: Math.max(20, Number(e.target.value)) })}
                inputSize="sm"
                iconLeft={<span className="text-[10px] text-slate-500 font-bold">H</span>}
              />
            </div>
          </VfFormField>

          {/* Component Properties */}
          {schema.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 dark:text-slate-400">Properties</h4>
              <div className="space-y-3">
                {schema.map((prop) => (
                  <VfFormField key={prop.key} label={`${prop.label} ${prop.unit ? `(${prop.unit})` : ''}`}>
                    {(prop.type === 'number' || prop.type === 'text') && (
                      <PropertyInput
                        propKey={prop.key}
                        value={properties[prop.key]}
                        type={prop.type}
                        min={prop.min}
                        max={prop.max}
                        step={prop.step}
                        onChange={handlePropertyChange}
                      />
                    )}
                    {prop.type === 'select' && (
                      <VfSelect
                        value={(properties[prop.key] as string) || prop.options?.[0] || ''}
                        onChange={(e) => handlePropertyChange(prop.key, e.target.value)}
                        options={prop.options?.map(opt => ({ value: opt, label: opt })) || []}
                      />
                    )}
                    {prop.type === 'color' && (
                      <VfColorSelector
                        value={(properties[prop.key] as string) || '#ff0000'}
                        onChange={(val) => handlePropertyChange(prop.key, val)}
                        options={WIRE_COLORS.map(color => ({ value: color, label: color }))}
                      />
                    )}
                  </VfFormField>
                ))}
              </div>
            </div>
          )}

          {/* Label */}
          <VfFormField label="Display Name">
            <VfInput
              type="text"
              value={selectedNode.name}
              onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
              inputSize="sm"
            />
          </VfFormField>

          {/* Pins */}
          {selectedNode.pins && selectedNode.pins.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Pins ({selectedNode.pins.length})</h4>
              <VfPropertyGrid
                items={selectedNode.pins.map(pin => ({
                  key: pin.id,
                  label: pin.name,
                  value: pin.type,
                  mono: true,
                  copyable: true
                }))}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-surface-200/70 flex gap-2 dark:border-white/5">
          <button
            onClick={() => handleRotate(90)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-surface-700 bg-surface-100 hover:bg-surface-200 transition-colors dark:text-surface-300 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <RotateCw className="w-3 h-3" /> +90°
          </button>
          <button
            onClick={() => handleRotate(-90)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-surface-700 bg-surface-100 hover:bg-surface-200 transition-colors dark:text-surface-300 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <RotateCw className="w-3 h-3 -scale-x-100" /> −90°
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        <VfConfirmDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => removeNode(selectedNode.id)}
          title="Delete Component"
          message={`Are you sure you want to delete this ${selectedNode.name || 'component'}?`}
          isDestructive={true}
        />
      </div>
  );
}
