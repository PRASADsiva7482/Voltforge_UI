import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import { X, Trash2 } from 'lucide-react';
import type { Wire } from '../../types/domain';

export default function PropertyEditor() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedWireId = useCanvasStore((s) => s.selectedWireId);
  const nodes = useCanvasStore((s) => s.nodes);
  const wires = useCanvasStore((s) => s.wires);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const updateWire = useCanvasStore((s) => s.updateWire);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const removeWire = useCanvasStore((s) => s.removeWire);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const selectWire = useCanvasStore((s) => s.selectWire);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const selectedWire = selectedWireId ? wires.find(w => w.id === selectedWireId) : null;

  if (!selectedNode && !selectedWire) {
    return (
      <div className="vf-prop-editor vf-prop-editor--empty">
        <p>Select a component or wire to edit its properties</p>
      </div>
    );
  }

  if (selectedNode) {
    const editablePropKeys = Object.keys(selectedNode.properties || {}).filter(
      k => !['svgData', 'locked'].includes(k)
    );

    return (
      <div className="vf-prop-editor">
        <div className="vf-prop-editor__header">
          <h3>{selectedNode.name}</h3>
          <div className="vf-prop-editor__actions">
            <button
              className="vf-prop-editor__delete"
              onClick={() => { removeNode(selectedNode.id); selectNode(null); }}
              title="Delete component"
            >
              <Trash2 size={14} />
            </button>
            <button
              className="vf-prop-editor__close"
              onClick={() => selectNode(null)}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="vf-prop-editor__section">
          <label className="vf-prop-editor__label">Name</label>
          <input
            className="vf-prop-editor__input"
            value={selectedNode.name}
            onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
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
              onChange={(e) => updateNode(selectedNode.id, { x: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="vf-prop-editor__label">Y</label>
            <input
              className="vf-prop-editor__input vf-prop-editor__input--small"
              type="number"
              value={Math.round(selectedNode.y)}
              onChange={(e) => updateNode(selectedNode.id, { y: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="vf-prop-editor__label">Rotation</label>
            <input
              className="vf-prop-editor__input vf-prop-editor__input--small"
              type="number"
              value={selectedNode.rotation}
              onChange={(e) => updateNode(selectedNode.id, { rotation: Number(e.target.value) })}
            />
          </div>
        </div>

        {editablePropKeys.length > 0 && (
          <>
            <div className="vf-prop-editor__divider" />
            <h4 className="vf-prop-editor__subtitle">Properties</h4>
            {editablePropKeys.map((key) => {
              const val = selectedNode.properties[key];
              const isBoolean = typeof val === 'boolean';
              const isNumber = typeof val === 'number';
              return (
                <div key={key} className="vf-prop-editor__section">
                  <label className="vf-prop-editor__label">{key}</label>
                  {isBoolean ? (
                    <button
                      className={`vf-prop-editor__toggle ${val ? 'is-on' : ''}`}
                      onClick={() => updateNode(selectedNode.id, {
                        properties: { ...selectedNode.properties, [key]: !val }
                      })}
                    >
                      {val ? 'ON' : 'OFF'}
                    </button>
                  ) : (
                    <input
                      className="vf-prop-editor__input"
                      type={isNumber ? 'number' : 'text'}
                      value={String(val ?? '')}
                      onChange={(e) => updateNode(selectedNode.id, {
                        properties: {
                          ...selectedNode.properties,
                          [key]: isNumber ? Number(e.target.value) : e.target.value
                        }
                      })}
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
      </div>
    );
  }

  if (selectedWire) {
    const fromNode = nodes.find(n => n.id === selectedWire.fromNodeId);
    const toNode = nodes.find(n => n.id === selectedWire.toNodeId);
    const modes: Wire['routingMode'][] = ['straight', 'orthogonal', 'auto', 'curved'];

    return (
      <div className="vf-prop-editor">
        <div className="vf-prop-editor__header">
          <h3>Wire</h3>
          <div className="vf-prop-editor__actions">
            <button
              className="vf-prop-editor__delete"
              onClick={() => { removeWire(selectedWire.id); selectWire(null); }}
              title="Delete wire"
            >
              <Trash2 size={14} />
            </button>
            <button
              className="vf-prop-editor__close"
              onClick={() => selectWire(null)}
            >
              <X size={14} />
            </button>
          </div>
        </div>

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
          />
        </div>
      </div>
    );
  }

  return null;
}
