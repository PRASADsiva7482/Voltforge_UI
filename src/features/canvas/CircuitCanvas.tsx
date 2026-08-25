import { useCallback, useRef, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Stage, Layer, Rect, Group, Text, Circle, Line, Shape } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Download, Layers, LayoutGrid, Zap } from 'lucide-react';
import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import { useSimulationStore } from '../../store/simulationStore';

import { useThemeStore } from '../../store/themeStore';
import { getPinAbsPos, getWireRenderPoints, snapToRoutingGuides } from '../../utils/wireRouting';
import {
  WireShape,
  WiringPreview,
  ComponentNode,
  CanvasErrorBoundary,
  CurrentFlowLayer,
} from './components';
import {
  MAT_GRID_MINOR,
  MAT_GRID_MAJOR,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  CANVAS_BG_DARK,
  CANVAS_BG_LIGHT,
  ORIGIN_AXIS_COLOR,
  PCB_TRACE_TOP,
  PCB_TRACE_BOTTOM,
  COLLABORATOR_CURSOR_RADIUS,
  COLLABORATOR_DEFAULT_COLOR,
} from './canvasConstants';
import type { Collaborator, ActiveBendPoint, Wire } from './canvasTypes';

interface Props {
  width: number;
  height: number;
  viewMode?: 'breadboard' | 'pcb';
  collaborators?: Record<string, Collaborator>;
  onComponentInteraction?: (nodeId: string, event: 'press' | 'release') => void;
  onCursorMove?: (x: number, y: number) => void;
  onProbeToggle?: (target: { nodeId: string; pinId: string; x: number; y: number }) => void;
  readOnly?: boolean;
  isProbeMode?: boolean;
  isSimulating?: boolean;
}

// ── Grid Layer (memoized) — professional engineering grid ──
const CanvasMat = ({
  width,
  height,
  viewport,
  isDark,
}: {
  width: number;
  height: number;
  viewport: { x: number; y: number; scale: number };
  isDark: boolean;
}) => {
  const scale = viewport.scale || 1;
  const minorStroke = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.055)';
  const majorStroke = isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.11)';

  return (
    <Group>
      <Rect
        x={-viewport.x / scale}
        y={-viewport.y / scale}
        width={width / scale}
        height={height / scale}
        fill={isDark ? CANVAS_BG_DARK : CANVAS_BG_LIGHT}
        listening={false}
      />
      <Shape
        listening={false}
        sceneFunc={(context) => {
          const pad = 200;
          const minX = Math.floor((-viewport.x / scale - pad) / MAT_GRID_MINOR) * MAT_GRID_MINOR;
          const minY = Math.floor((-viewport.y / scale - pad) / MAT_GRID_MINOR) * MAT_GRID_MINOR;
          const maxX = -viewport.x / scale + width / scale + pad;
          const maxY = -viewport.y / scale + height / scale + pad;

          // 1. Draw minor grid lines
          context.beginPath();
          for (let x = minX; x <= maxX; x += MAT_GRID_MINOR) {
            if (x % MAT_GRID_MAJOR === 0) continue;
            context.moveTo(x, minY);
            context.lineTo(x, maxY);
          }
          for (let y = minY; y <= maxY; y += MAT_GRID_MINOR) {
            if (y % MAT_GRID_MAJOR === 0) continue;
            context.moveTo(minX, y);
            context.lineTo(maxX, y);
          }
          context.strokeStyle = minorStroke;
          context.lineWidth = 0.5 / scale;
          context.stroke();

          // 2. Draw major grid lines
          context.beginPath();
          const majorMinX = Math.floor(minX / MAT_GRID_MAJOR) * MAT_GRID_MAJOR;
          const majorMinY = Math.floor(minY / MAT_GRID_MAJOR) * MAT_GRID_MAJOR;

          for (let x = majorMinX; x <= maxX; x += MAT_GRID_MAJOR) {
            context.moveTo(x, minY);
            context.lineTo(x, maxY);
          }
          for (let y = majorMinY; y <= maxY; y += MAT_GRID_MAJOR) {
            context.moveTo(minX, y);
            context.lineTo(maxX, y);
          }
          context.strokeStyle = majorStroke;
          context.lineWidth = 0.8 / scale;
          context.stroke();

          // 3. Draw origin axis if visible
          if (minX <= 0 && maxX >= 0) {
            context.beginPath();
            context.moveTo(0, minY);
            context.lineTo(0, maxY);
            context.strokeStyle = ORIGIN_AXIS_COLOR;
            context.lineWidth = 1.4 / scale;
            context.stroke();
          }
          if (minY <= 0 && maxY >= 0) {
            context.beginPath();
            context.moveTo(minX, 0);
            context.lineTo(maxX, 0);
            context.strokeStyle = ORIGIN_AXIS_COLOR;
            context.lineWidth = 1.4 / scale;
            context.stroke();
          }
        }}
      />
    </Group>
  );
};

// ── Wire Color Picker Toolbar ──
const WireToolbar = () => {
  const { wiringColor, setWiringColor, wiringMode, setWiringMode, isWiring } = useCanvasStore();

  if (!isWiring) return null;

  const cycleMode = () => {
    const modes: Wire['routingMode'][] = ['straight', 'orthogonal', 'auto', 'curved'];
    const currentIndex = modes.indexOf(wiringMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setWiringMode(nextMode);
  };

  const modeLabels: Record<Wire['routingMode'], string> = {
    straight: 'Straight',
    orthogonal: 'Orthogonal',
    auto: 'Smart-route',
    curved: 'Curved',
  };

  return (
    <div className="vf-wire-toolbar">
      <span className="vf-wire-toolbar__label">Wire Color:</span>
      <div className="vf-wire-toolbar__swatches">
        {WIRE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setWiringColor(c)}
            className={`vf-wire-swatch ${wiringColor === c ? 'is-active' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <span className="vf-wire-toolbar__divider" />
      <button onClick={cycleMode} className="vf-wire-toolbar__mode">
        {modeLabels[wiringMode]}
      </button>
      <span className="vf-wire-toolbar__hint">Click a pin to connect • ESC to cancel</span>
    </div>
  );
};

// ── PCB Trace Layer ──
const PcbTraceLayer = ({
  wires,
  isDark,
}: {
  wires: Wire[];
  isDark: boolean;
}) => {
  const nodes = useCanvasStore((state) => state.nodes);
  return (
    <Layer listening={false}>
      {wires.map((wire, index) => {
        const points = getWireRenderPoints({ ...wire, routingMode: 'auto' }, nodes, [], wires);
        const isBottom = index % 2 === 1;
        return (
          <Line
            key={`pcb_${wire.id}`}
            points={points}
            stroke={isBottom ? PCB_TRACE_BOTTOM : PCB_TRACE_TOP}
            strokeWidth={5}
            opacity={0.62}
            lineCap="round"
            lineJoin="round"
            dash={isBottom ? [12, 6] : undefined}
            shadowColor={isBottom ? PCB_TRACE_BOTTOM : PCB_TRACE_TOP}
            shadowBlur={6}
          />
        );
      })}
      {nodes.flatMap((node) =>
        node.pins.map((pin) => {
          const pos = getPinAbsPos(node, pin.id);
          if (!pos) return null;
          return (
            <Circle
              key={`pad_${node.id}_${pin.id}`}
              x={pos.x}
              y={pos.y}
              radius={5}
              fill={isDark ? '#0f172a' : '#f8fafc'}
              stroke={pin.type === 'ground' ? '#94a3b8' : '#facc15'}
              strokeWidth={2}
            />
          );
        })
      )}
    </Layer>
  );
};

// ── Component Node Wrapper (isolates state changes to a single component) ──
const ComponentNodeWrapper = ({
  id,
  isDark,
  onComponentInteraction,
  onProbeToggle,
  readOnly,
  isProbeMode,
  isSimulating,
}: {
  id: string;
  isDark: boolean;
  onComponentInteraction?: (nodeId: string, event: 'press' | 'release') => void;
  onProbeToggle?: (target: { nodeId: string; pinId: string; x: number; y: number }) => void;
  readOnly?: boolean;
  isProbeMode?: boolean;
  isSimulating?: boolean;
}) => {
  const node = useCanvasStore((state) => state.nodesById.get(id));
  const isSelected = useCanvasStore((state) => state.selectedNodeId === id);
  const isWiring = useCanvasStore((state) => state.isWiring);
  const wiringFromNodeId = useCanvasStore((state) => state.wiringFrom?.nodeId || null);

  const updateNode = useCanvasStore((state) => state.updateNode);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const startWiring = useCanvasStore((state) => state.startWiring);
  const finishWiring = useCanvasStore((state) => state.finishWiring);

  if (!node) return null;

  return (
    <ComponentNode
      node={node}
      isSelected={isSelected}
      isDark={isDark}
      onSelect={() => selectNode(node.id)}
      onChange={(a) => updateNode(node.id, a)}
      onGestureStart={() => {
        if (!readOnly) useCanvasStore.getState().pushHistory();
      }}
      onDragEnd={(a) => useCanvasStore.getState().updateNodeDragEnd(node.id, a)}
      isWiring={isWiring}
      wiringFromNodeId={wiringFromNodeId}
      startWiring={readOnly ? () => {} : startWiring}
      finishWiring={readOnly ? () => {} : finishWiring}
      onInteraction={onComponentInteraction}
      onProbeToggle={onProbeToggle}
      readOnly={readOnly}
      isProbeMode={isProbeMode}
      isSimulating={isSimulating}
    />
  );
};

// ── Main Canvas ──
export default function CircuitCanvas({
  width,
  height,
  viewMode = 'breadboard',
  collaborators = {},
  onComponentInteraction,
  onProbeToggle,
  onCursorMove,
  readOnly,
  isProbeMode,
  isSimulating,
}: Props) {
  const isDark = useThemeStore((state) => state.theme === 'dark');

  const nodeIds = useCanvasStore(
    useShallow((state) => state.nodes.map((n) => n.id))
  );
  const wires = useCanvasStore((state) => state.wires);
  const selectedWireId = useCanvasStore((state) => state.selectedWireId);
  const viewport = useCanvasStore((state) => state.viewport);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const selectWire = useCanvasStore((state) => state.selectWire);
  const isWiring = useCanvasStore((state) => state.isWiring);
  const wiringFrom = useCanvasStore((state) => state.wiringFrom);
  const cancelWiring = useCanvasStore((state) => state.cancelWiring);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const addBendPoint = useCanvasStore((state) => state.addBendPoint);

  const stageRef = useRef<Konva.Stage>(null);
  const gridLayerRef = useRef<Konva.Layer>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeNewBendPoint, setActiveNewBendPoint] = useState<ActiveBendPoint | null>(null);

  const handleWireDragStart = useCallback(
    (wireId: string, index: number, x: number, y: number) => {
      setActiveNewBendPoint({ wireId, index, x, y });
    },
    []
  );

  // Wheel zoom
  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const old = viewport.scale;
      const ptr = stage.getPointerPosition();
      const mp = stage.getRelativePointerPosition() || { x: 0, y: 0 };
      const dir = e.evt.deltaY > 0 ? -1 : 1;
      const ns = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, dir > 0 ? old * ZOOM_STEP : old / ZOOM_STEP));
      setViewport({ scale: ns, x: (ptr?.x || 0) - mp.x * ns, y: (ptr?.y || 0) - mp.y * ns });
    },
    [viewport, setViewport]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectNode(null);
        selectWire(null);
        cancelWiring();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !readOnly) {
        const state = useCanvasStore.getState();
        if (
          state.selectedNodeId &&
          !state.nodes.find((n) => n.id === state.selectedNodeId)?.properties?.locked
        ) {
          state.removeNode(state.selectedNodeId);
        }
        if (state.selectedWireId) state.removeWire(state.selectedWireId);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectNode, selectWire, cancelWiring, readOnly]);

  // Get wiring start position
  const getWiringFromPos = () => {
    if (!wiringFrom) return { x: 0, y: 0 };
    const node = useCanvasStore.getState().nodesById.get(wiringFrom.nodeId);
    if (!node) return { x: 0, y: 0 };
    return getPinAbsPos(node, wiringFrom.pinId) || { x: 0, y: 0 };
  };

  const handleExportImage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    selectNode(null);
    selectWire(null);
    requestAnimationFrame(() => {
      gridLayerRef.current?.visible(false);
      stage.batchDraw();
      const dataUrl = stage.toDataURL({
        pixelRatio: 2,
        mimeType: 'image/png',
      });
      gridLayerRef.current?.visible(true);
      stage.batchDraw();

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `voltforge-circuit-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }, [selectNode, selectWire]);

  return (
    <div className="vf-canvas-container">
      <CanvasErrorBoundary>
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          draggable
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          onDragEnd={(e: KonvaEventObject<DragEvent>) => {
            setViewport({ ...viewport, x: e.target.x(), y: e.target.y() });
          }}
          onWheel={handleWheel}
          onClick={(e: KonvaEventObject<MouseEvent>) => {
            if (e.target === e.target.getStage()) {
              selectNode(null);
              selectWire(null);
              if (isWiring) cancelWiring();
            }
          }}
          onMouseMove={() => {
            const stage = stageRef.current;
            if (!stage) return;
            const pos = stage.getRelativePointerPosition();
            if (!pos) return;
            const x = pos.x;
            const y = pos.y;

            if (isWiring) {
              setMousePos({ x, y });
            } else if (activeNewBendPoint) {
              const anchors = useCanvasStore.getState().nodes.flatMap((node) =>
                node.pins
                  .map((pin) => getPinAbsPos(node, pin.id))
                  .filter(Boolean) as { x: number; y: number }[]
              );
              const snapped = snapToRoutingGuides({ x, y }, anchors);
              setActiveNewBendPoint((prev) =>
                prev ? { ...prev, x: snapped.x, y: snapped.y } : null
              );
            } else {
              onCursorMove?.(x, y);
            }
          }}
          onMouseUp={() => {
            if (activeNewBendPoint && !readOnly) {
              addBendPoint(activeNewBendPoint.wireId, activeNewBendPoint.index, {
                x: activeNewBendPoint.x,
                y: activeNewBendPoint.y,
              });
              setActiveNewBendPoint(null);
            }
          }}
        >
          {/* Grid layer (below everything) */}
          <Layer ref={gridLayerRef} listening={false}>
            <CanvasMat width={width} height={height} viewport={viewport} isDark={isDark} />
          </Layer>

          {viewMode === 'pcb' && <PcbTraceLayer wires={wires} isDark={isDark} />}

          {/* Component layer (below wires) */}
          <Layer opacity={viewMode === 'pcb' ? 0.35 : 1}>
            {nodeIds.map((id) => (
              <ComponentNodeWrapper
                key={id}
                id={id}
                isDark={isDark}
                onComponentInteraction={onComponentInteraction}
                onProbeToggle={onProbeToggle}
                readOnly={readOnly}
                isProbeMode={isProbeMode}
                isSimulating={isSimulating}
              />
            ))}
          </Layer>

          {/* Wire layer (on top — wires should never be hidden under components) */}
          <Layer>
            {wires.map((w) => (
              <WireShape
                key={w.id}
                wire={w}
                wires={wires}
                isSelected={w.id === selectedWireId}
                isDark={isDark}
                onSelect={() => selectWire(w.id)}
                onWireDragStart={handleWireDragStart}
                activeNewBendPoint={activeNewBendPoint}
                readOnly={readOnly}
                isProbeMode={isProbeMode}
              />
            ))}
            {isWiring && wiringFrom && (
              <WiringPreview fromPos={getWiringFromPos()} mousePos={mousePos} />
            )}
          </Layer>

          {/* Animated Current Flow Layer (renders particles on active wires) */}
          <CurrentFlowLayer />

          <Layer listening={false}>
            {Object.values(collaborators).map((user) => (
              <Group
                key={user.userId || user.displayName || 'unknown'}
                x={Number(user.x || 0)}
                y={Number(user.y || 0)}
              >
                <Circle
                  radius={COLLABORATOR_CURSOR_RADIUS}
                  fill={user.color || COLLABORATOR_DEFAULT_COLOR}
                  shadowColor={user.color || COLLABORATOR_DEFAULT_COLOR}
                  shadowBlur={6}
                />
                <Text
                  text={user.displayName || 'Collaborator'}
                  x={8}
                  y={-14}
                  fontSize={10}
                  fill={isDark ? '#e5e7eb' : '#0f172a'}
                  fontFamily="Inter"
                />
              </Group>
            ))}
          </Layer>
        </Stage>
      </CanvasErrorBoundary>

      {/* Wire toolbar overlay (HTML, not canvas) */}
      {!readOnly && <WireToolbar />}

      <button
        onClick={handleExportImage}
        className="vf-canvas-overlay-btn"
        title="Export circuit PNG"
      >
        <Download size={14} />
        PNG
      </button>

      <button
        onClick={() => useCanvasStore.getState().autoArrangeLayout()}
        disabled={readOnly}
        className="vf-canvas-overlay-btn"
        style={{ left: 80 }}
        title="Auto-arrange component layout with orthogonal routing"
      >
        <LayoutGrid size={14} />
        Auto-Arrange
      </button>

      <button
        onClick={() => useSimulationStore.getState().setShowCurrentFlow(!useSimulationStore.getState().showCurrentFlow)}
        className="vf-canvas-overlay-btn"
        style={{ left: 195, color: useSimulationStore((s) => s.showCurrentFlow) ? '#38bdf8' : 'inherit' }}
        title="Toggle animated current flow particles on wires"
      >
        <Zap size={14} />
        Current Flow
      </button>

      <button
        onClick={() => useSimulationStore.getState().setThermalHeatmapEnabled(!useSimulationStore.getState().thermalHeatmapEnabled)}
        className="vf-canvas-overlay-btn"
        style={{ left: 310, color: useSimulationStore((s) => s.thermalHeatmapEnabled) ? '#f97316' : 'inherit' }}
        title="Toggle live component power and thermal stress heat map"
      >
        Thermal Map
      </button>

      {viewMode === 'pcb' && (
        <div className="vf-canvas-overlay-btn" style={{ left: 410 }}>
          <Layers size={14} />
          2-layer PCB traces
        </div>
      )}


      {/* Zoom indicator */}
      <div className="vf-canvas-zoom">
        {Math.round(viewport.scale * 100)}%
      </div>
    </div>
  );
}
