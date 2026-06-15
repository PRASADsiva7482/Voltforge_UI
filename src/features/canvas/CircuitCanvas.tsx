import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Group, Text, Circle, Line } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Download, Layers } from 'lucide-react';
import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import { useThemeStore } from '../../store/themeStore';
import { getPinAbsPos, getWireRenderPoints, snapToRoutingGuides } from '../../utils/wireRouting';
import {
  WireShape,
  WiringPreview,
  ComponentNode,
  CanvasErrorBoundary,
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
import type { Collaborator, ActiveBendPoint, CanvasNode, Wire } from './canvasTypes';

interface Props {
  width: number;
  height: number;
  viewMode?: 'breadboard' | 'pcb';
  collaborators?: Record<string, Collaborator>;
  onComponentInteraction?: (nodeId: string, event: 'press' | 'release') => void;
  onCursorMove?: (x: number, y: number) => void;
  readOnly?: boolean;
  isProbeMode?: boolean;
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
  const guides = useMemo(() => {
    const result: React.ReactNode[] = [];
    const scale = viewport.scale || 1;
    const pad = 200;
    const minX = Math.floor((-viewport.x / scale - pad) / MAT_GRID_MINOR) * MAT_GRID_MINOR;
    const minY = Math.floor((-viewport.y / scale - pad) / MAT_GRID_MINOR) * MAT_GRID_MINOR;
    const maxX = -viewport.x / scale + width / scale + pad;
    const maxY = -viewport.y / scale + height / scale + pad;

    // Minor grid lines (fine 20px)
    for (let x = minX; x <= maxX; x += MAT_GRID_MINOR) {
      if (x % MAT_GRID_MAJOR === 0) continue;
      result.push(
        <Line key={`gm_x_${x}`} points={[x, minY, x, maxY]}
          stroke={isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.055)'}
          strokeWidth={0.5 / scale} listening={false} />
      );
    }
    for (let y = minY; y <= maxY; y += MAT_GRID_MINOR) {
      if (y % MAT_GRID_MAJOR === 0) continue;
      result.push(
        <Line key={`gm_y_${y}`} points={[minX, y, maxX, y]}
          stroke={isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.055)'}
          strokeWidth={0.5 / scale} listening={false} />
      );
    }

    // Major grid lines (100px)
    const majorMinX = Math.floor(minX / MAT_GRID_MAJOR) * MAT_GRID_MAJOR;
    const majorMinY = Math.floor(minY / MAT_GRID_MAJOR) * MAT_GRID_MAJOR;
    for (let x = majorMinX; x <= maxX; x += MAT_GRID_MAJOR) {
      result.push(
        <Line key={`gM_x_${x}`} points={[x, minY, x, maxY]}
          stroke={x === 0 ? ORIGIN_AXIS_COLOR : (isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.11)')}
          strokeWidth={(x === 0 ? 1.4 : 0.8) / scale} listening={false} />
      );
    }
    for (let y = majorMinY; y <= maxY; y += MAT_GRID_MAJOR) {
      result.push(
        <Line key={`gM_y_${y}`} points={[minX, y, maxX, y]}
          stroke={y === 0 ? ORIGIN_AXIS_COLOR : (isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.11)')}
          strokeWidth={(y === 0 ? 1.4 : 0.8) / scale} listening={false} />
      );
    }

    return result;
  }, [width, height, viewport.x, viewport.y, viewport.scale, isDark]);

  return (
    <>
      <Rect
        x={-viewport.x / viewport.scale}
        y={-viewport.y / viewport.scale}
        width={width / viewport.scale}
        height={height / viewport.scale}
        fill={isDark ? CANVAS_BG_DARK : CANVAS_BG_LIGHT}
        listening={false}
      />
      {guides}
    </>
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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 glass rounded-xl px-3 py-2 flex items-center gap-3 border border-surface-200 dark:border-white/10">
      <span className="text-[10px] text-surface-600 font-medium dark:text-surface-400">Wire Color:</span>
      <div className="flex gap-1">
        {WIRE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setWiringColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${wiringColor === c ? 'border-surface-950 scale-125 dark:border-white' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="h-4 w-px bg-surface-200 dark:bg-white/10" />
      <button
        onClick={cycleMode}
        className="text-[10px] px-2 py-1 rounded bg-surface-100 text-surface-700 hover:text-surface-950 hover:bg-white dark:bg-white/5 dark:text-surface-300 dark:hover:text-white dark:hover:bg-white/10"
      >
        {modeLabels[wiringMode]}
      </button>
      <span className="text-[9px] text-surface-500 ml-1">Click a pin to connect • ESC to cancel</span>
    </div>
  );
};

// ── PCB Trace Layer ──
const PcbTraceLayer = ({
  nodes,
  wires,
  isDark,
}: {
  nodes: CanvasNode[];
  wires: Wire[];
  isDark: boolean;
}) => (
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

// ── Main Canvas ──
export default function CircuitCanvas({
  width,
  height,
  viewMode = 'breadboard',
  collaborators = {},
  onComponentInteraction,
  onCursorMove,
  readOnly,
  isProbeMode,
}: Props) {
  const isDark = useThemeStore((state) => state.theme === 'dark');
  const {
    nodes,
    wires,
    selectedNodeId,
    selectedWireId,
    viewport,
    updateNode,
    selectNode,
    selectWire,
    isWiring,
    wiringFrom,
    startWiring,
    finishWiring,
    cancelWiring,
    setViewport,
    addBendPoint,
  } = useCanvasStore();

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
    const node = nodes.find((n) => n.id === wiringFrom.nodeId);
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
    <div className="relative w-full h-full">
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
          onWheel={handleWheel}
          onClick={(e: KonvaEventObject<MouseEvent>) => {
            if (e.target === e.target.getStage()) {
              selectNode(null);
              selectWire(null);
              if (isWiring) cancelWiring();
            }
          }}
          onMouseMove={(e: KonvaEventObject<MouseEvent>) => {
            const stage = stageRef.current;
            if (!stage) return;
            const pos = stage.getRelativePointerPosition();
            if (!pos) return;
            const x = pos.x;
            const y = pos.y;

            if (isWiring) {
              setMousePos({ x, y });
            } else if (activeNewBendPoint) {
              const anchors = nodes.flatMap((node) =>
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
            if (activeNewBendPoint) {
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

          {viewMode === 'pcb' && <PcbTraceLayer nodes={nodes} wires={wires} isDark={isDark} />}

          {/* Component layer (below wires) */}
          <Layer opacity={viewMode === 'pcb' ? 0.35 : 1}>
            {nodes.map((node) => (
              <ComponentNode
                key={node.id}
                node={node}
                isSelected={node.id === selectedNodeId}
                isDark={isDark}
                onSelect={() => selectNode(node.id)}
                onChange={(a) => updateNode(node.id, a)}
                onDragEnd={(a) => useCanvasStore.getState().updateNodeDragEnd(node.id, a)}
                isWiring={isWiring}
                wiringFromNodeId={wiringFrom?.nodeId || null}
                startWiring={readOnly ? () => {} : startWiring}
                finishWiring={readOnly ? () => {} : finishWiring}
                onInteraction={onComponentInteraction}
                readOnly={readOnly}
                isProbeMode={isProbeMode}
              />
            ))}
          </Layer>

          {/* Wire layer (on top — wires should never be hidden under components) */}
          <Layer>
            {wires.map((w) => (
              <WireShape
                key={w.id}
                wire={w}
                nodes={nodes}
                wires={wires}
                isSelected={w.id === selectedWireId}
                isDark={isDark}
                onSelect={() => selectWire(w.id)}
                onWireDragStart={handleWireDragStart}
                activeNewBendPoint={activeNewBendPoint}
                isProbeMode={isProbeMode}
              />
            ))}
            {isWiring && wiringFrom && (
              <WiringPreview fromPos={getWiringFromPos()} mousePos={mousePos} />
            )}
          </Layer>

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
        className="absolute top-3 left-3 z-20 glass px-2.5 py-1.5 rounded-lg text-[10px] text-surface-600 hover:text-surface-950 border border-surface-200 flex items-center gap-1.5 dark:text-surface-300 dark:hover:text-white dark:border-white/10"
        title="Export circuit PNG"
      >
        <Download className="w-3.5 h-3.5" />
        PNG
      </button>

      {viewMode === 'pcb' && (
        <div className="absolute top-3 left-20 z-20 glass px-2.5 py-1.5 rounded-lg text-[10px] text-surface-600 border border-surface-200 flex items-center gap-1.5 dark:text-surface-300 dark:border-white/10">
          <Layers className="w-3.5 h-3.5 text-forge-400" />
          2-layer PCB traces
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 z-20 glass px-2 py-1 rounded-lg text-[9px] text-surface-400 font-mono">
        {Math.round(viewport.scale * 100)}%
      </div>
    </div>
  );
}
