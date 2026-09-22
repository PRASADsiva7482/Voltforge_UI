import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import Konva from 'konva';
import { Layer, Line, Rect, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCanvasStore } from '../../store/canvasStore';
import { usePcbStore, type PcbFootprint } from '../../store/pcbStore';
import PcbExportModal from './PcbExportModal';
import PcbFootprintRenderer from './PcbFootprintRenderer';
import { usePcbSchematicSync } from './usePcbSchematicSync';
import { TraceRouter } from './TraceRouter';
import { usePcbSceneElements } from './usePcbSceneElements';
import { BOARD_OFFSET_PX, SCALE_MM_TO_PX, PCB_DETAIL_SCALE, PCB_RETAIN_PX, PcbSceneGeometry, PcbVisibilityWindow, pcbPoints, pcbViewportBounds } from './pcbSceneGeometry';
import { PcbRatline, PcbTraceShape, PcbViaShape } from './PcbSceneObjects';
import { PcbRasterBudget } from './pcbRasterBudget';
import { PcbToolbar } from './PcbToolbar';

interface Props {
  height: number;
  projectName?: string;
  readOnly?: boolean;
  width: number;
}

const PcbExportBridge = memo(function PcbExportBridge(props: { isOpen: boolean; onClose: () => void; projectName?: string }) {
  const wires = useCanvasStore(s => s.wires);
  return <PcbExportModal {...props} wires={wires} />;
});

export default function PcbCanvas({ width, height, projectName, readOnly = false }: Props) {
  const {
    activeLayer,
    activeRoute,
    boardHeight_mm,
    boardWidth_mm,
    footprints,
    isRoutingTrace,
    ratlines,
    selectedFootprintId,
    selectedTraceId,
    traceWidth_mil,
    traces,
    vias,
    visibleLayers,
    viewport,
    cancelRouting,
    selectFootprint,
    selectTrace,
    setViewport,
    updateActiveRoute,
    updateFootprintPosition,
    updateViaPosition,
  } = usePcbStore(useShallow(s => ({
    activeLayer: s.activeLayer, activeRoute: s.activeRoute,
    boardHeight_mm: s.boardHeight_mm, boardWidth_mm: s.boardWidth_mm,
    footprints: s.footprints, isRoutingTrace: s.isRoutingTrace, ratlines: s.ratlines,
    selectedFootprintId: s.selectedFootprintId, selectedTraceId: s.selectedTraceId, traceWidth_mil: s.traceWidth_mil,
    traces: s.traces, vias: s.vias, visibleLayers: s.visibleLayers, viewport: s.viewport,
    cancelRouting: s.cancelRouting,
    selectFootprint: s.selectFootprint, selectTrace: s.selectTrace,
    setViewport: s.setViewport,
    updateActiveRoute: s.updateActiveRoute, updateFootprintPosition: s.updateFootprintPosition,
    updateViaPosition: s.updateViaPosition,
  })));

  usePcbSchematicSync();
  const [showExportModal, setShowExportModal] = useState(false);
  const openExport = useCallback(() => setShowExportModal(true), []);
  const closeExport = useCallback(() => setShowExportModal(false), []);
  const stageRef = useRef<Konva.Stage>(null);
  const geometry = useMemo(() => new PcbSceneGeometry(), []);
  const visibility = useMemo(() => ({ footprints: new PcbVisibilityWindow(), traces: new PcbVisibilityWindow(), vias: new PcbVisibilityWindow(), ratlines: new PcbVisibilityWindow() }), []);
  const rasterBudget = useMemo(() => new PcbRasterBudget(), []);
  // Starting a native drag changes no rendered props. These IDs only matter
  // when a later pan/zoom recomputes the visible set during the gesture.
  const draggedFootprint = useRef<string | null>(null);
  const draggedVia = useRef<string | null>(null);
  const startFootprintDrag = useCallback((id: string) => { draggedFootprint.current = id; }, []);
  const startViaDrag = useCallback((id: string) => { draggedVia.current = id; }, []);
  const [pan, setPan] = useState<{ base: typeof viewport; view: typeof viewport } | null>(null);
  const panFrame = useRef<number | null>(null);
  const pendingPan = useRef<typeof pan>(null);
  const cancelPan = useCallback(() => {
    if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
    panFrame.current = null;
    pendingPan.current = null;
  }, []);
  useEffect(() => { cancelPan(); return cancelPan; }, [viewport, cancelPan]);
  // Native Stage motion is transient until release. An external viewport/load
  // invalidates a stale pan immediately, without dirtying the document per frame.
  const sceneViewport = pan?.base === viewport ? pan.view : viewport;
  const bounds = pcbViewportBounds(sceneViewport, width, height);
  const retainBounds = pcbViewportBounds(sceneViewport, width, height, PCB_RETAIN_PX);
  const detailed = sceneViewport.scale >= PCB_DETAIL_SCALE;
  const visibleFootprints = visibility.footprints.select(footprints, bounds, retainBounds, fp => geometry.footprint(fp),
    fp => fp.id === selectedFootprintId || fp.id === draggedFootprint.current || fp.componentId === activeRoute?.startPad?.componentId);
  const visibleTraces = visibility.traces.select(traces.filter(trace => visibleLayers[trace.layer]), bounds, retainBounds,
    trace => geometry.trace(trace).bounds, trace => trace.id === selectedTraceId);
  const visibleRatlines = visibility.ratlines.select(ratlines, bounds, retainBounds, line => geometry.ratline(line).bounds);
  const visibleVias = visibility.vias.select(vias, bounds, retainBounds, via => geometry.via(via), via => via.id === draggedVia.current);
  const handleFootprintDragEnd = useCallback((id: string, x: number, y: number) => {
    draggedFootprint.current = null;
    if (!readOnly) updateFootprintPosition(id, x, y);
  }, [readOnly, updateFootprintPosition]);
  const handleViaDragEnd = useCallback((id: string, x: number, y: number) => {
    draggedVia.current = null;
    if (!readOnly) updateViaPosition(id, x, y);
  }, [readOnly, updateViaPosition]);
  const handlePadClick = useCallback((footprint: PcbFootprint, padId: string, x: number, y: number) => {
    if (readOnly) return;
    const state = usePcbStore.getState();
    const pad = { componentId: footprint.componentId, padId, x, y, netId: footprint.pads.find(p => p.id === padId)?.netId };
    if (!state.isRoutingTrace) state.startRouting(pad);
    else {
      const start = state.activeRoute?.startPad;
      state.finishRouting(pad, TraceRouter.route45Degree(start ? { x: start.x, y: start.y } : { x, y }, { x, y }));
    }
  }, [readOnly]);

  const footprintElements = usePcbSceneElements(visibleFootprints, footprint => ({
    footprint, isSelected: footprint.id === selectedFootprintId, scaleMmToPx: SCALE_MM_TO_PX,
    detailed, rasterBudget, showCopper: visibleLayers['F.Cu'], showSilk: visibleLayers['F.Silk'], readOnly,
    onSelect: selectFootprint, onDragStart: startFootprintDrag, onDragEnd: handleFootprintDragEnd, onPadClick: handlePadClick,
  }), (footprint, props) => <PcbFootprintRenderer key={footprint.id} {...props} />);
  const traceElements = usePcbSceneElements(visibleTraces, trace => ({ trace, points: geometry.trace(trace).points, onSelect: selectTrace, rasterBudget }),
    (trace, props) => <PcbTraceShape key={trace.id} {...props} />);
  const ratlineElements = usePcbSceneElements(visibleRatlines, line => ({ points: geometry.ratline(line).points }),
    (line, props) => <PcbRatline key={line.id} {...props} />,
    (a, b) => a.points === b.points || a.points.every((value, i) => value === b.points[i]));
  const viaElements = usePcbSceneElements(visibleVias, via => ({ via, readOnly, detailed, onDragStart: startViaDrag, onDragEnd: handleViaDragEnd }),
    (via, props) => <PcbViaShape key={via.id} {...props} />);

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (readOnly || !isRoutingTrace || !activeRoute) return;

    const stage = e.target.getStage();
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return;

    updateActiveRoute({
      x: TraceRouter.snapToGrid((pos.x - BOARD_OFFSET_PX) / SCALE_MM_TO_PX),
      y: TraceRouter.snapToGrid((pos.y - BOARD_OFFSET_PX) / SCALE_MM_TO_PX),
    });
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    const oldScale = stage.scaleX();
    cancelPan();
    setPan(null);
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const nextScale = Math.max(0.5, Math.min(2.5, direction > 0 ? oldScale * 1.1 : oldScale / 1.1));
    const local = stage.getRelativePointerPosition() || { x: 0, y: 0 };
    setViewport({
      scale: nextScale,
      x: (pointer?.x || 0) - local.x * nextScale,
      y: (pointer?.y || 0) - local.y * nextScale,
    });
  };

  return (
    <div className="vf-pcb-canvas">
      <PcbToolbar readOnly={readOnly} onExport={openExport} />

      <Stage
        ref={stageRef}
        width={width}
        height={height}
        draggable
        x={sceneViewport.x}
        y={sceneViewport.y}
        scaleX={sceneViewport.scale}
        scaleY={sceneViewport.scale}
        onWheel={handleWheel}
        onDragMove={(e: KonvaEventObject<DragEvent>) => {
          if (e.target !== e.target.getStage()) return;
          pendingPan.current = { base: viewport, view: { scale: e.target.scaleX(), x: e.target.x(), y: e.target.y() } };
          if (panFrame.current === null) panFrame.current = requestAnimationFrame(() => {
            panFrame.current = null;
            setPan(pendingPan.current);
          });
        }}
        onDragEnd={(e: KonvaEventObject<DragEvent>) => {
          if (e.target !== e.target.getStage()) return;
          cancelPan();
          setPan(null);
          setViewport({ scale: e.target.scaleX(), x: e.target.x(), y: e.target.y() });
        }}
        onMouseMove={handleStageMouseMove}
        onClick={(e: KonvaEventObject<MouseEvent>) => {
          if (e.target === e.target.getStage()) {
            selectFootprint(null);
            selectTrace(null);
            if (isRoutingTrace) cancelRouting();
          }
        }}
      >
        <Layer>
          <Rect
            visible={visibleLayers['Edge.Cuts']}
            x={BOARD_OFFSET_PX}
            y={BOARD_OFFSET_PX}
            width={boardWidth_mm * SCALE_MM_TO_PX}
            height={boardHeight_mm * SCALE_MM_TO_PX}
            fill="#064e3b"
            stroke="#22c55e"
            strokeWidth={1.5}
            cornerRadius={4}
            shadowColor="#000000"
            shadowBlur={16}
            shadowOpacity={0.6}
          />
          <Text
            text={`PCB Edge: ${boardWidth_mm}mm x ${boardHeight_mm}mm (2-Layer FR4)`}
            x={BOARD_OFFSET_PX + 5}
            y={boardHeight_mm * SCALE_MM_TO_PX + BOARD_OFFSET_PX + 8}
            fontSize={11}
            fontFamily="'JetBrains Mono', monospace"
            fill="#64748b"
          />
        </Layer>

        <Layer listening={false}>
          {ratlineElements}
        </Layer>

        <Layer>
          {traceElements}
          {isRoutingTrace && activeRoute && (
            <Line
              name="pcb-active-route"
              points={pcbPoints(activeRoute.currentPoints)}
              stroke={activeLayer === 'F.Cu' ? '#f87171' : '#7dd3fc'}
              strokeWidth={traceWidth_mil * 0.0254 * SCALE_MM_TO_PX * 2.5}
              lineCap="round"
              lineJoin="round"
              dash={[6, 3]}
            />
          )}
          {viaElements}
        </Layer>

        <Layer visible={visibleLayers['F.Silk'] || visibleLayers['F.Cu']}>
          {footprintElements}
        </Layer>
      </Stage>

      <PcbExportBridge
        isOpen={showExportModal}
        onClose={closeExport}
        projectName={projectName}
      />
    </div>
  );
}
