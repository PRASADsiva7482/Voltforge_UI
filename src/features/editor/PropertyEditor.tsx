import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import { Trash2 } from 'lucide-react';
import type { Wire } from '../../types/domain';
import { FloatingPanel } from '../../components/ui/FloatingPanel';
import { isBoardComponentType } from '../canvas/boardCatalog';

/** Properties that are hardware metadata or simulation state — never user-editable. */
const HIDDEN_KEYS = new Set(['svgData', 'locked']);

/** Keys that are read-only when the component is a board. */
const BOARD_READONLY_KEYS = new Set([
  'family', 'logicVoltage', 'clockSpeed', 'compilerSupport', 'features',
  'footprint', 'pinProfile', 'compiler', 'clock', 'sortOrder',
]);

/** Simulation state keys — always read-only on every component. */
const SIM_STATE_KEYS = new Set([
  'isBlown', 'faultMessage', 'isLit', 'currentMa', 'measuredCurrent', 'isSpinning',
  'isBeeping', 'isActive', 'isSwitched_1', 'isSwitched_2', 'isSwitched_3', 'isSwitched_4',
  'rpm', 'escRpm', 'bldcRpm', 'bldcRotation', 'boardPowered', 'builtInLedLit',
  'powered', 'outputHigh', 'outputVoltage', 'isRegulating', 'timerState',
  'shiftRegValue', 'latchRegValue', 'prevSrclk', 'prevRclk',
]);

function isReadonly(key: string, nodeType: string): boolean {
  if (SIM_STATE_KEYS.has(key)) return true;
  if (isBoardComponentType(nodeType) && BOARD_READONLY_KEYS.has(key)) return true;
  return false;
}

function formatValue(val: unknown): string {
  if (Array.isArray(val)) return val.join(', ');
  return String(val ?? '');
}

export default function PropertyEditor({ readOnly }: { readOnly?: boolean }) {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedWireId = useCanvasStore((s) => s.selectedWireId);
  const nodes = useCanvasStore((s) => s.nodes);
  const wires = useCanvasStore((s) => s.wires);
  const commitNodeUpdate = useCanvasStore((s) => s.commitNodeUpdate);
  const updateWire = useCanvasStore((s) => s.updateWire);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const removeWire = useCanvasStore((s) => s.removeWire);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const selectWire = useCanvasStore((s) => s.selectWire);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const selectedWire = selectedWireId ? wires.find(w => w.id === selectedWireId) : null;

  if (!selectedNode && !selectedWire) {
    return null;
  }

  const onClose = () => {
    selectNode(null);
    selectWire(null);
  };

  return (
    <FloatingPanel
      isOpen={!!(selectedNode || selectedWire)}
      onClose={onClose}
      title={selectedNode ? selectedNode.name : 'Wire Properties'}
      width="280px"
    >
      <div className="vf-prop-editor">
        {selectedNode && (
          <>
            <div className="vf-prop-editor__section">
              <label className="vf-prop-editor__label">Name</label>
              <input
                className="vf-prop-editor__input"
                value={selectedNode.name}
                onChange={(e) => commitNodeUpdate(selectedNode.id, { name: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className="vf-prop-editor__section">
              <label className="vf-prop-editor__label">Type</label>
              <span className="vf-prop-editor__type">{selectedNode.type}</span>
            </div>

            <div className="vf-prop-editor__section vf-prop-editor__grid">
              <div>
                <label className="vf-prop-editor__label">X</label>
                <input
                  className="vf-prop-editor__input vf-prop-editor__input--small"
                  type="number"
                  value={Math.round(selectedNode.x)}
                  onChange={(e) => commitNodeUpdate(selectedNode.id, { x: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="vf-prop-editor__label">Y</label>
                <input
                  className="vf-prop-editor__input vf-prop-editor__input--small"
                  type="number"
                  value={Math.round(selectedNode.y)}
                  onChange={(e) => commitNodeUpdate(selectedNode.id, { y: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="vf-prop-editor__label">Rotation</label>
                <input
                  className="vf-prop-editor__input vf-prop-editor__input--small"
                  type="number"
                  value={selectedNode.rotation}
                  onChange={(e) => commitNodeUpdate(selectedNode.id, { rotation: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </div>
            </div>

            {Object.keys(selectedNode.properties || {}).filter(
              k => !HIDDEN_KEYS.has(k)
            ).length > 0 && (
                <>
                  <div className="vf-prop-editor__divider" />
                  <h4 className="vf-prop-editor__subtitle">Properties</h4>
                  {Object.keys(selectedNode.properties || {})
                    .filter(k => !HIDDEN_KEYS.has(k))
                    .map((key) => {
                      const val = selectedNode.properties[key];
                      const readonly = isReadonly(key, selectedNode.type);
                      const isBoolean = typeof val === 'boolean';
                      const isNumber = typeof val === 'number';
                      return (
                        <div key={key} className="vf-prop-editor__section">
                          <label className="vf-prop-editor__label">{key}</label>
                          {readonly ? (
                            <span className="vf-prop-editor__readonly">{formatValue(val)}</span>
                          ) : isBoolean ? (
                            <button
                              className={`vf-prop-editor__toggle ${val ? 'is-on' : ''}`}
                              onClick={() => commitNodeUpdate(selectedNode.id, {
                                properties: { ...selectedNode.properties, [key]: !val }
                              })}
                              disabled={readOnly}
                            >
                              {val ? 'ON' : 'OFF'}
                            </button>
                          ) : (
                            <input
                              className="vf-prop-editor__input"
                              type={isNumber ? 'number' : 'text'}
                              value={String(val ?? '')}
                              onChange={(e) => commitNodeUpdate(selectedNode.id, {
                                properties: {
                                  ...selectedNode.properties,
                                  [key]: isNumber ? Number(e.target.value) : e.target.value
                                }
                              })}
                              disabled={readOnly}
                            />
                          )}
                        </div>
                      );
                    })}
                </>
              )}

            <div className="vf-prop-editor__divider" />
            <h4 className="vf-prop-editor__subtitle">Pins ({selectedNode.pins.length})</h4>
            <div className="vf-prop-editor__pins">
              {selectedNode.pins.map(pin => (
                <span key={pin.id} className="vf-prop-editor__pin-tag">
                  {pin.name}
                </span>
              ))}
            </div>
          </>
        )}

        {selectedWire && (
          <>
            {(() => {
              const fromNode = nodes.find(n => n.id === selectedWire.fromNodeId);
              const toNode = nodes.find(n => n.id === selectedWire.toNodeId);
              const modes: Wire['routingMode'][] = ['straight', 'orthogonal', 'auto', 'curved'];
              return (
                <>
                  <div className="vf-prop-editor__section">
                    <label className="vf-prop-editor__label">From</label>
                    <span className="vf-prop-editor__type">
                      {fromNode?.name || selectedWire.fromNodeId} : {selectedWire.fromPinId}
                    </span>
                  </div>
                  <div className="vf-prop-editor__section">
                    <label className="vf-prop-editor__label">To</label>
                    <span className="vf-prop-editor__type">
                      {toNode?.name || selectedWire.toNodeId} : {selectedWire.toPinId}
                    </span>
                  </div>

                  <div className="vf-prop-editor__section">
                    <label className="vf-prop-editor__label">Color</label>
                    <div className="vf-prop-editor__color-swatches">
                      {WIRE_COLORS.map(c => (
                        <button
                          key={c}
                          className={`vf-wire-swatch ${selectedWire.color === c ? 'is-active' : ''}`}
                          style={{ backgroundColor: c }}
                          onClick={() => updateWire(selectedWire.id, { color: c })}
                          disabled={readOnly}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="vf-prop-editor__section">
                    <label className="vf-prop-editor__label">Routing</label>
                    <select
                      className="vf-prop-editor__input"
                      value={selectedWire.routingMode}
                      onChange={(e) => updateWire(selectedWire.id, { routingMode: e.target.value as Wire['routingMode'] })}
                      disabled={readOnly}
                    >
                      {modes.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div className="vf-prop-editor__section">
                    <label className="vf-prop-editor__label">Label</label>
                    <input
                      className="vf-prop-editor__input"
                      value={selectedWire.label || ''}
                      placeholder="Optional wire label"
                      onChange={(e) => updateWire(selectedWire.id, { label: e.target.value || undefined })}
                      disabled={readOnly}
                    />
                  </div>
                </>
              );
            })()}
          </>
        )}

        {!readOnly && (
          <button
            className="vf-btn vf-btn--danger"
            onClick={() => {
              if (selectedNode) {
                removeNode(selectedNode.id);
                selectNode(null);
              } else if (selectedWire) {
                removeWire(selectedWire.id);
                selectWire(null);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '8px',
              marginTop: '16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
          >
            <Trash2 size={14} />
            Delete {selectedNode ? 'Component' : 'Wire'}
          </button>
        )}
      </div>
    </FloatingPanel>
  );
}
