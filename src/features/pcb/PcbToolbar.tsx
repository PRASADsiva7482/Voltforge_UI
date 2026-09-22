import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plus, ShieldCheck } from 'lucide-react';
import { usePcbStore } from '../../store/pcbStore';

const TRACE_WIDTH_OPTIONS = [6, 8, 10, 12, 24];
export const PcbToolbar = memo(function PcbToolbar({ readOnly, onExport }: { readOnly: boolean; onExport: () => void }) {
  const { activeLayer, traceWidth_mil, visibleLayers, setActiveLayer, setTraceWidth, toggleLayerVisibility } = usePcbStore(useShallow(s => ({
    activeLayer: s.activeLayer, traceWidth_mil: s.traceWidth_mil, visibleLayers: s.visibleLayers,
    setActiveLayer: s.setActiveLayer, setTraceWidth: s.setTraceWidth, toggleLayerVisibility: s.toggleLayerVisibility,
  })));
  const addCenteredVia = () => {
    if (readOnly) return;
    const state = usePcbStore.getState();
    state.addVia({ id: `via_${Date.now()}`, x: state.boardWidth_mm / 2, y: state.boardHeight_mm / 2, drill_mm: 0.3, pad_mm: 0.6 });
  };
  return (<div className="vf-pcb-toolbar">
        <span className="vf-pcb-toolbar__label">Active Layer</span>
        <div className="vf-pcb-segment">
          <button
            type="button"
            className={`vf-pcb-segment__item vf-pcb-segment__item--top ${activeLayer === 'F.Cu' ? 'is-active' : ''}`}
            onClick={() => setActiveLayer('F.Cu')}
            disabled={readOnly}
          >
            F.Cu
          </button>
          <button
            type="button"
            className={`vf-pcb-segment__item vf-pcb-segment__item--bottom ${activeLayer === 'B.Cu' ? 'is-active' : ''}`}
            onClick={() => setActiveLayer('B.Cu')}
            disabled={readOnly}
          >
            B.Cu
          </button>
        </div>

        <span className="vf-pcb-toolbar__divider" />

        <span className="vf-pcb-toolbar__label">Layers</span>
        <div className="vf-pcb-chip-group">
          {(['F.Cu', 'B.Cu', 'F.Silk', 'B.Silk', 'Edge.Cuts'] as const).map((layer) => (
            <button
              key={layer}
              type="button"
              className={`vf-pcb-chip ${visibleLayers[layer] ? 'is-active' : ''}`}
              onClick={() => toggleLayerVisibility(layer)}
              title={`${visibleLayers[layer] ? 'Hide' : 'Show'} ${layer}`}
            >
              {layer}
            </button>
          ))}
        </div>

        <span className="vf-pcb-toolbar__divider" />

        <span className="vf-pcb-toolbar__label">Width</span>
        <div className="vf-pcb-chip-group">
          {TRACE_WIDTH_OPTIONS.map((mil) => (
            <button
              key={mil}
              type="button"
              className={`vf-pcb-chip ${traceWidth_mil === mil ? 'is-active' : ''}`}
              onClick={() => setTraceWidth(mil)}
              disabled={readOnly}
            >
              {mil} mil
            </button>
          ))}
        </div>

        <span className="vf-pcb-toolbar__divider" />

        <button type="button" className="vf-pcb-tool-btn vf-pcb-tool-btn--warning" onClick={addCenteredVia} disabled={readOnly}>
          <Plus size={12} />
          <span>Via</span>
        </button>

        <button
          type="button"
          className="vf-pcb-tool-btn vf-pcb-tool-btn--primary"
          onClick={onExport}
        >
          <ShieldCheck size={13} />
          <span>DRC / Export</span>
        </button>
      </div>);
});
