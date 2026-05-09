import { motion, AnimatePresence } from 'framer-motion';
import { X, Sliders, Trash2, RotateCw } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';

// Property schemas for each component type
const propertySchemas: Record<string, { label: string; key: string; type: 'number' | 'text' | 'select' | 'color'; options?: string[]; unit?: string; min?: number; max?: number; step?: number }[]> = {
  RESISTOR: [
    { label: 'Resistance', key: 'resistance', type: 'number', unit: 'Ω', min: 1, max: 10000000, step: 1 },
    { label: 'Tolerance', key: 'tolerance', type: 'select', options: ['5%', '1%', '0.5%', '0.1%'] },
    { label: 'Power Rating', key: 'powerRating', type: 'select', options: ['0.125W', '0.25W', '0.5W', '1W', '2W'] },
  ],
  CAPACITOR: [
    { label: 'Capacitance', key: 'capacitance', type: 'number', unit: 'µF', min: 0.001, max: 100000, step: 0.001 },
    { label: 'Voltage Rating', key: 'voltageRating', type: 'select', options: ['10V', '16V', '25V', '50V', '100V'] },
  ],
  LED_STANDARD: [
    { label: 'Color', key: 'ledColor', type: 'color' },
    { label: 'Forward Voltage', key: 'forwardVoltage', type: 'number', unit: 'V', min: 1.5, max: 3.5, step: 0.1 },
    { label: 'Max Current', key: 'maxCurrent', type: 'number', unit: 'mA', min: 1, max: 30, step: 1 },
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
  TEMP_SENSOR: [
    { label: 'Sensor Type', key: 'sensorType', type: 'select', options: ['DHT11', 'DHT22', 'LM35', 'DS18B20'] },
  ],
  ULTRASONIC_SENSOR: [
    { label: 'Max Range', key: 'maxRange', type: 'number', unit: 'cm', min: 2, max: 400, step: 1 },
  ],
  LCD_16X2: [
    { label: 'Backlight', key: 'backlight', type: 'select', options: ['On', 'Off'] },
    { label: 'Interface', key: 'interface', type: 'select', options: ['I2C', 'Parallel'] },
  ],
  RELAY_SPDT: [
    { label: 'Coil Voltage', key: 'coilVoltage', type: 'select', options: ['5V', '12V', '24V'] },
    { label: 'Max Load', key: 'maxLoad', type: 'select', options: ['5A', '10A', '20A', '30A'] },
  ],
};

export default function PropertyEditor() {
  const { selectedNodeId, nodes, updateNode, removeNode } = useCanvasStore();
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  if (!selectedNode) return null;

  const schema = propertySchemas[selectedNode.type] || [];
  const properties = selectedNode.properties || {};

  const handlePropertyChange = (key: string, value: unknown) => {
    updateNode(selectedNode.id, {
      properties: { ...properties, [key]: value },
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        key={selectedNode.id}
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 300, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute top-0 right-0 bottom-0 w-72 glass border-l border-white/10 z-20 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-surface-900/50">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-volt-400" />
            <h3 className="text-sm font-semibold text-white truncate">{selectedNode.name}</h3>
          </div>
          <button onClick={() => useCanvasStore.getState().selectNode(null)} className="p-1 rounded-lg hover:bg-white/5 text-surface-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Type Badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-800 text-surface-300 border border-surface-700">
              {selectedNode.type.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Position */}
          <div>
            <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Position</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-surface-500 mb-1 block">X</label>
                <input type="number" value={Math.round(selectedNode.x)} onChange={(e) => updateNode(selectedNode.id, { x: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-volt-500/50" />
              </div>
              <div>
                <label className="text-[10px] text-surface-500 mb-1 block">Y</label>
                <input type="number" value={Math.round(selectedNode.y)} onChange={(e) => updateNode(selectedNode.id, { y: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-volt-500/50" />
              </div>
            </div>
          </div>

          {/* Rotation */}
          <div>
            <label className="text-[10px] text-surface-500 mb-1 block">Rotation (°)</label>
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="360" step="15" value={selectedNode.rotation}
                onChange={(e) => updateNode(selectedNode.id, { rotation: Number(e.target.value) })}
                className="flex-1 accent-volt-500" />
              <span className="text-xs text-surface-300 w-8 text-right">{selectedNode.rotation}°</span>
            </div>
          </div>

          {/* Component Properties */}
          {schema.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Properties</h4>
              <div className="space-y-3">
                {schema.map((prop) => (
                  <div key={prop.key}>
                    <label className="text-[10px] text-surface-500 mb-1 block">
                      {prop.label} {prop.unit && <span className="text-surface-600">({prop.unit})</span>}
                    </label>
                    {prop.type === 'number' && (
                      <input
                        type="number"
                        value={(properties[prop.key] as number) ?? prop.min ?? 0}
                        min={prop.min}
                        max={prop.max}
                        step={prop.step}
                        onChange={(e) => handlePropertyChange(prop.key, Number(e.target.value))}
                        className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-volt-500/50"
                      />
                    )}
                    {prop.type === 'text' && (
                      <input
                        type="text"
                        value={(properties[prop.key] as string) || ''}
                        onChange={(e) => handlePropertyChange(prop.key, e.target.value)}
                        className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-volt-500/50"
                      />
                    )}
                    {prop.type === 'select' && (
                      <select
                        value={(properties[prop.key] as string) || prop.options?.[0] || ''}
                        onChange={(e) => handlePropertyChange(prop.key, e.target.value)}
                        className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-volt-500/50"
                      >
                        {prop.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    )}
                    {prop.type === 'color' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={(properties[prop.key] as string) || '#ff0000'}
                          onChange={(e) => handlePropertyChange(prop.key, e.target.value)}
                          className="w-8 h-8 rounded-lg border border-white/10 cursor-pointer"
                        />
                        <span className="text-xs text-surface-400">{(properties[prop.key] as string) || '#ff0000'}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pins */}
          {selectedNode.pins && selectedNode.pins.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Pins ({selectedNode.pins.length})</h4>
              <div className="space-y-1">
                {selectedNode.pins.map((pin) => (
                  <div key={pin.id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/[0.02] text-[10px]">
                    <span className="text-surface-300 font-mono">{pin.name}</span>
                    <span className="text-surface-500">{pin.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-white/5 flex gap-2">
          <button
            onClick={() => updateNode(selectedNode.id, { rotation: (selectedNode.rotation + 90) % 360 })}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-surface-300 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <RotateCw className="w-3 h-3" /> Rotate
          </button>
          <button
            onClick={() => { if (confirm('Delete this component?')) { removeNode(selectedNode.id); } }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
