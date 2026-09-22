import { useCallback, useRef, useEffect, useLayoutEffect, useMemo, useState, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Stage, Layer, Rect, Group, Text, Circle, Line, Shape } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Download, Layers, LayoutGrid, Zap } from 'lucide-react';
import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import CanvasRoutingStatus from './CanvasRoutingStatus';
import { useSimulationStore } from '../../store/simulationStore';

import { useThemeStore } from '../../store/themeStore';
import { componentPairKey, getPinAbsPos, getWireRenderPoints, snapToRoutingGuides } from '../../utils/wireRouting';
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
import type { Collaborator, ActiveBendPoint, Wire, CanvasNode } from './canvasTypes';
import { createCurrentFlowRenderBudget, cullWiresToViewport } from './renderBudget';
import { canvasLayoutBudgetFields, recordCanvasLayout } from './canvasRenderInstrumentation';
import { indexIncidentWires } from './dragRouting';
import { ComponentBoundsCache, ComponentSpatialIndex, createComponentVisibilitySnapshot, COMPONENT_DETAIL_SCALE } from './componentVisibility';
import { CanvasAudioBridge } from './CanvasAudioBridge';
import { WireRoutingPeerCache } from './wireRoutingPeers';

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
const CanvasMat = memo(({
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
});

// ── Wire Color Picker Toolbar ──
const WireToolbar = memo(() => {
  const { wiringColor, setWiringColor, wiringMode, setWiringMode, isWiring } = useCanvasStore(useShallow(state => ({
    wiringColor: state.wiringColor,
    setWiringColor: state.setWiringColor,
    wiringMode: state.wiringMode,
    setWiringMode: state.setWiringMode,
    isWiring: state.isWiring,
  })));

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
});

// ── PCB Trace Layer ──
const PcbTraceLayer = ({
  wires,
  allWires,
  visibleNodes,
  isDark,
}: {
  wires: Wire[];
  allWires: Wire[];
  visibleNodes: CanvasNode[];
  isDark: boolean;
}) => {
  const nodes = useCanvasStore((state) => state.nodes);
  const wireIndexById = useMemo(
    () => new Map(allWires.map((wire, index) => [wire.id, index])),
    [allWires],
  );
  return (
    <Layer listening={false}>
      {wires.map((wire) => {
        const points = getWireRenderPoints({ ...wire, routingMode: 'auto' }, nodes, [], allWires);
        const index = wireIndexById.get(wire.id) ?? 0;
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
      {visibleNodes.flatMap((authoredNode) => {
        const node = useCanvasStore.getState().nodesById.get(authoredNode.id) ?? authoredNode;
        return node.pins.map((pin) => {
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
        });
      })}
    </Layer>
  );
};

// ── Component Node Wrapper (isolates state changes to a single component) ──
const ComponentNodeWrapper = memo(({
  id,
  isDark,
  onComponentInteraction,
  onProbeToggle,
  readOnly,
  isProbeMode,
  isSimulating,
  detailed,
}: {
  id: string;
  isDark: boolean;
  onComponentInteraction?: (nodeId: string, event: 'press' | 'release') => void;
  onProbeToggle?: (target: { nodeId: string; pinId: string; x: number; y: number }) => void;
  readOnly?: boolean;
  isProbeMode?: boolean;
  isSimulating?: boolean;
  detailed: boolean;
}) => {
  const node = useCanvasStore((state) => state.nodesById.get(id));
  const isSelected = useCanvasStore((state) => state.selectedNodeId === id);
  const isWiring = useCanvasStore((state) => state.isWiring);
  const wiringFromNodeId = useCanvasStore((state) => state.wiringFrom?.nodeId || null);

  const updateNode = useCanvasStore((state) => state.updateNode);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const startWiring = useCanvasStore((state) => state.startWiring);
  const finishWiring = useCanvasStore((state) => state.finishWiring);

  useEffect(() => () => useCanvasStore.getState().cancelNodeGesture(id), [id, readOnly]);

  if (!node) return null;

  return (
    <ComponentNode
      node={node}
      isSelected={isSelected}
      isDark={isDark}
      onSelect={() => selectNode(node.id)}
      onChange={(a) => updateNode(node.id, a)}
      onDragMove={(a) => { if (!readOnly) useCanvasStore.getState().queueNodeGesture(node.id, a); }}
      onGestureStart={() => {
        if (!readOnly) useCanvasStore.getState().beginNodeGesture(node.id);
      }}
      onDragEnd={(a) => { if (!readOnly) useCanvasStore.getState().endNodeGesture(node.id, a); }}
      isWiring={isWiring}
      wiringFromNodeId={wiringFromNodeId}
      startWiring={readOnly ? () => {} : startWiring}
      finishWiring={readOnly ? () => {} : finishWiring}
      onInteraction={onComponentInteraction}
      onProbeToggle={onProbeToggle}
      readOnly={readOnly}
      isProbeMode={isProbeMode}
      isSimulating={isSimulating}
      detailed={detailed || isSelected || isWiring || isProbeMode}
    />
  );
});

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

  const [selectComponentDocument] = useState(createComponentVisibilitySnapshot);
  const documentNodes = useCanvasStore(selectComponentDocument);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const wires = useCanvasStore((state) => state.wires);
  const [routingPeerCache] = useState(() => new WireRoutingPeerCache());
  const routingPeers = useMemo(() => routingPeerCache.update(wires), [wires, routingPeerCache]);
  const draggingNodeId = useCanvasStore((state) => state.draggingNodeId);
  const geometryCommitRevision = useCanvasStore((state) => state.geometryCommitRevision);
  const incidentWires = useMemo(() => indexIncidentWires(wires), [wires]);
  const selectedWireId = useCanvasStore((state) => state.selectedWireId);
  const viewport = useCanvasStore((state) => state.viewport);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const selectWire = useCanvasStore((state) => state.selectWire);
  const isWiring = useCanvasStore((state) => state.isWiring);
  const wiringFrom = useCanvasStore((state) => state.wiringFrom);
  const cancelWiring = useCanvasStore((state) => state.cancelWiring);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const addBendPoint = useCanvasStore((state) => state.addBendPoint);
  const showCurrentFlow = useSimulationStore((state) => state.showCurrentFlow);
  const storeIsSimulating = useSimulationStore((state) => state.isSimulating);
  const currentFlowQualityMode = useSimulationStore((state) => state.currentFlowQualityMode);
  const thermalHeatmapEnabled = useSimulationStore((state) => state.thermalHeatmapEnabled);
  const probeNodeIds = useSimulationStore(useShallow((state) => state.meterProbes.map(probe => probe.nodeId)));

  const stageRef = useRef<Konva.Stage>(null);
  const gridLayerRef = useRef<Konva.Layer>(null);
  const viewportRenderAnchorRef = useRef(viewport);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeNewBendPoint, setActiveNewBendPoint] = useState<ActiveBendPoint | null>(null);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(null);
  const [boundsCache] = useState(() => new ComponentBoundsCache());
  const previousVisible = useRef<ReadonlySet<string>>(new Set());
  const componentIndex = useMemo(() => new ComponentSpatialIndex(documentNodes, boundsCache), [documentNodes, boundsCache]);
  const retainedNodeIds = useMemo(() => {
    const ids = new Set(probeNodeIds.filter((id): id is string => Boolean(id)));
    for (const id of [selectedNodeId, draggingNodeId, wiringFrom?.nodeId, activeInteractionId]) if (id) ids.add(id);
    for (const wire of wires) if (wire.id === selectedWireId || wire.id === activeNewBendPoint?.wireId) {
      ids.add(wire.fromNodeId); ids.add(wire.toNodeId);
    }
    return ids;
  }, [probeNodeIds, selectedNodeId, draggingNodeId, wiringFrom?.nodeId, activeInteractionId, wires, selectedWireId, activeNewBendPoint?.wireId]);
  const visibleNodes = useMemo(() => componentIndex.select(viewport, width, height, previousVisible.current, retainedNodeIds), [componentIndex, viewport, width, height, retainedNodeIds]);
  useLayoutEffect(() => { previousVisible.current = new Set(visibleNodes.map(node => node.id)); }, [visibleNodes]);

  // Native DOM capture runs before controls stop Konva event bubbling. Keep
  // dials, momentary buttons and nested sensor drag handles alive until release.
  useEffect(() => {
    let frame = 0;
    const release = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setActiveInteractionId(null)); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, []);

  const wireRenderContext = useMemo(() => {
    const nodesById = useCanvasStore.getState().nodesById;
    const visible = cullWiresToViewport(wires, nodesById, viewport, width, height);
    // Keep moving connections mounted even if their original bounds were offscreen.
    const visibleIds = new Set(visible.map(wire => wire.id));
    if (draggingNodeId) for (const index of incidentWires.get(draggingNodeId) ?? []) {
      if (!visibleIds.has(wires[index].id)) visible.push(wires[index]);
    }
    return {
      geometryCommitRevision,
      nodesById,
      visibleWires: visible,
    };
  }, [wires, viewport, width, height, draggingNodeId, geometryCommitRevision, incidentWires]);

  const currentFlowBudget = useMemo(
    () => createCurrentFlowRenderBudget(
      currentFlowQualityMode,
      viewport.scale,
      wireRenderContext.visibleWires.length,
      width,
      height,
    ),
    [currentFlowQualityMode, viewport.scale, wireRenderContext.visibleWires.length, width, height],
  );

  useEffect(() => {
    recordCanvasLayout({
      viewport: { ...viewport },
      viewportWidth: width,
      viewportHeight: height,
      totalWireCount: wires.length,
      mountedWireShapeCount: wireRenderContext.visibleWires.length,
      totalComponentCount: documentNodes.length,
      mountedComponentCount: visibleNodes.length,
      mountedPinCount: visibleNodes.reduce((count, node) => count + node.pins.length, 0),
      currentFlowEnabled: Boolean((isSimulating ?? storeIsSimulating) && showCurrentFlow),
      ...canvasLayoutBudgetFields(currentFlowBudget),
    });
  }, [
    currentFlowBudget,
    height,
    isSimulating,
    showCurrentFlow,
    storeIsSimulating,
    viewport,
    width,
    wireRenderContext.visibleWires.length,
    wires.length,
    documentNodes.length,
    visibleNodes,
  ]);

  useEffect(() => {
    viewportRenderAnchorRef.current = viewport;
  }, [viewport]);

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
    <div className="vf-canvas-container" onPointerDownCapture={(event) => {
      const stage = stageRef.current;
      if (!stage || !stage.content.contains(event.target as Node)) return;
      const rect = stage.content.getBoundingClientRect();
      const hit = stage.getIntersection({ x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height });
      setActiveInteractionId(hit?.findAncestor('.schematic-component', true)?.id() ?? null);
    }}>
      <CanvasAudioBridge isSimulating={isSimulating} />
      <CanvasRoutingStatus />
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
          onDragMove={(e: KonvaEventObject<DragEvent>) => {
            // Konva drag events from a component bubble to the Stage. Only a
            // drag that began on the Stage itself is canvas panning; otherwise
            // the component's coordinates would be written as the viewport.
            if (e.target !== e.currentTarget) return;
            const anchor = viewportRenderAnchorRef.current;
            const nextX = e.target.x();
            const nextY = e.target.y();
            if (Math.max(Math.abs(nextX - anchor.x), Math.abs(nextY - anchor.y)) < 64) return;
            const nextViewport = { ...anchor, x: nextX, y: nextY };
            viewportRenderAnchorRef.current = nextViewport;
            setViewport(nextViewport);
          }}
          onDragEnd={(e: KonvaEventObject<DragEvent>) => {
            if (e.target !== e.currentTarget) return;
            const nextViewport = { ...viewport, x: e.target.x(), y: e.target.y() };
            viewportRenderAnchorRef.current = nextViewport;
            setViewport(nextViewport);
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

          {viewMode === 'pcb' && (
            <PcbTraceLayer wires={wireRenderContext.visibleWires} allWires={wires} visibleNodes={visibleNodes} isDark={isDark} />
          )}

          {/* Component layer (below wires) */}
          <Layer opacity={viewMode === 'pcb' ? 0.35 : 1}>
            {visibleNodes.map(({ id }) => (
              <ComponentNodeWrapper
                key={id}
                id={id}
                isDark={isDark}
                onComponentInteraction={onComponentInteraction}
                onProbeToggle={onProbeToggle}
                readOnly={readOnly}
                isProbeMode={isProbeMode}
                isSimulating={isSimulating}
                detailed={viewport.scale >= COMPONENT_DETAIL_SCALE || retainedNodeIds.has(id)}
              />
            ))}
          </Layer>

          {/* Wire layer (on top — wires should never be hidden under components) */}
          <Layer>
            {wireRenderContext.visibleWires.map((w) => (
              <WireShape
                key={w.id}
                wire={w}
                routingPeers={routingPeers.get(componentPairKey(w))!}
                isSelected={w.id === selectedWireId}
                isDark={isDark}
                onSelect={selectWire}
                onWireDragStart={handleWireDragStart}
                activeNewBendPoint={activeNewBendPoint?.wireId === w.id ? activeNewBendPoint : null}
                readOnly={readOnly}
                isProbeMode={isProbeMode}
              />
            ))}
            {isWiring && wiringFrom && (
              <WiringPreview fromPos={getWiringFromPos()} mousePos={mousePos} />
            )}
          </Layer>

          {/* Animated Current Flow Layer (renders particles on active wires) */}
          <CurrentFlowLayer
            previewNodeId={draggingNodeId}
            isSimulating={isSimulating}
            visibleWires={wireRenderContext.visibleWires}
            allWires={wires}
            nodesById={wireRenderContext.nodesById}
            viewportScale={viewport.scale}
            budget={currentFlowBudget}
          />

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
        style={{ left: 195, color: showCurrentFlow ? '#38bdf8' : 'inherit' }}
        title="Toggle animated current flow particles on wires"
      >
        <Zap size={14} />
        Current Flow
      </button>

      {showCurrentFlow && (currentFlowBudget.isLimited || currentFlowQualityMode === 'full') && (
        <button
          onClick={() => useSimulationStore.getState().setCurrentFlowQualityMode(
            currentFlowQualityMode === 'full' ? 'adaptive' : 'full',
          )}
          className={`vf-canvas-quality-control ${currentFlowBudget.isLimited ? 'is-limited' : 'is-full'}`}
          title={currentFlowQualityMode === 'full'
            ? 'Full current-flow detail is enabled. Click to restore the adaptive rendering budget.'
            : `Current-flow detail is limited for ${currentFlowBudget.limitLabel}. Electrical values are unchanged. Click for full detail.`}
        >
          {currentFlowQualityMode === 'full'
            ? 'Flow detail: Full · Use adaptive'
            : 'Flow detail limited · Use full'}
        </button>
      )}

      <button
        onClick={() => useSimulationStore.getState().setThermalHeatmapEnabled(!useSimulationStore.getState().thermalHeatmapEnabled)}
        className="vf-canvas-overlay-btn"
        style={{ left: 310, color: thermalHeatmapEnabled ? '#f97316' : 'inherit' }}
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
