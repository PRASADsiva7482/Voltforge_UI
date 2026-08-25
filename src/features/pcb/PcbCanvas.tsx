import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Plus, ShieldCheck } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import { usePcbStore, type PcbFootprint } from '../../store/pcbStore';
import PcbExportModal from './PcbExportModal';
import PcbFootprintRenderer from './PcbFootprintRenderer';
import { RatlineEngine } from './RatlineEngine';
import { TraceRouter } from './TraceRouter';

interface Props {
  height: number;
  projectName?: string;
  readOnly?: boolean;
  width: number;
}

const BOARD_OFFSET_PX = 40;
const SCALE_MM_TO_PX = 4;
const TRACE_WIDTH_OPTIONS = [6, 8, 10, 12, 24];

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
    traceWidth_mil,
    traces,
    vias,
    visibleLayers,
    viewport,
    addVia,
    cancelRouting,
    finishRouting,
    selectFootprint,
    selectTrace,
    setActiveLayer,
    setFootprints,
    setRatlines,
    setTraceWidth,
    setViewport,
    toggleLayerVisibility,
    startRouting,
    updateActiveRoute,
    updateFootprintPosition,
    updateViaPosition,
  } = usePcbStore();

  const nodes = useCanvasStore((s) => s.nodes);
  const wires = useCanvasStore((s) => s.wires);
  const [showExportModal, setShowExportModal] = useState(false);
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    const createFootprint = (node: typeof nodes[number], index: number): PcbFootprint => {
      const col = index % 5;
      const row = Math.floor(index / 5);
      const pads = (node.pins || []).map((pin, pinIndex) => ({
        id: pin.id,
        name: pin.name,
        x: (pinIndex - ((node.pins?.length || 1) - 1) / 2) * 2.54,
        y: 3.5,
        width: 1.4,
        height: 1.4,
        shape: 'rect' as const,
        drillDiameter: 0.8,
        netId: wires.find((wire) =>
          (wire.fromNodeId === node.id && wire.fromPinId === pin.id) ||
          (wire.toNodeId === node.id && wire.toPinId === pin.id)
        )?.id,
      }));

      return {
        id: `fp_${node.id}`,
        componentId: node.id,
        componentType: node.type,
        height: 10,
        name: node.name,
        packageType: String(node.properties?.footprint || (node.pins.length > 20 ? 'QFP' : 'DIP')),
        pads,
        rotation: 0,
        width: Math.max(12, pads.length * 2.54 + 4),
        x: 20 + col * 18,
        y: 20 + row * 18,
      };
    };

    const existingByComponent = new Map(footprints.map((footprint) => [footprint.componentId, footprint]));
    const occupiedPlacements = new Set(footprints.map((footprint) => `${footprint.x}:${footprint.y}`));
    let nextPlacementIndex = footprints.length;
    const reconciled = nodes.map((node) => {
      const existing = existingByComponent.get(node.id);
      let generated = createFootprint(node, nextPlacementIndex);
      while (!existing && occupiedPlacements.has(`${generated.x}:${generated.y}`)) {
        nextPlacementIndex += 1;
        generated = createFootprint(node, nextPlacementIndex);
      }
      if (!existing) {
        occupiedPlacements.add(`${generated.x}:${generated.y}`);
        nextPlacementIndex += 1;
      }
      if (!existing) return generated;

      // Preserve the user's PCB placement/rotation while refreshing the
      // schematic-derived identity, package, pad list, and net assignments.
      return {
        ...generated,
        id: existing.id,
        x: existing.x,
        y: existing.y,
        rotation: existing.rotation,
      };
    });

    if (JSON.stringify(reconciled) !== JSON.stringify(footprints)) {
      setFootprints(reconciled);
    }
  }, [footprints, nodes, setFootprints, wires]);

  useEffect(() => {
    if (footprints.length === 0) return;
    setRatlines(RatlineEngine.computeRatlines(nodes, wires, footprints, traces));
  }, [footprints, nodes, setRatlines, traces, wires]);

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isRoutingTrace || !activeRoute) return;

    const stage = e.target.getStage();
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return;

    updateActiveRoute({
      x: TraceRouter.snapToGrid((pos.x - BOARD_OFFSET_PX) / SCALE_MM_TO_PX),
      y: TraceRouter.snapToGrid((pos.y - BOARD_OFFSET_PX) / SCALE_MM_TO_PX),
    });
  };

  const addCenteredVia = () => {
    if (readOnly) return;
    addVia({
      id: `via_${Date.now()}`,
      x: boardWidth_mm / 2,
      y: boardHeight_mm / 2,
      drill_mm: 0.3,
      pad_mm: 0.6,
    });
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    const oldScale = viewport.scale;
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
      <div className="vf-pcb-toolbar">
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
          onClick={() => setShowExportModal(true)}
        >
          <ShieldCheck size={13} />
          <span>DRC / Export</span>
        </button>
      </div>

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
        onDragEnd={(e: KonvaEventObject<DragEvent>) => {
          setViewport({ ...viewport, x: e.target.x(), y: e.target.y() });
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
          {ratlines.map((ratline) => (
            <Line
              key={ratline.id}
              points={[
                ratline.from.x * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
                ratline.from.y * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
                ratline.to.x * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
                ratline.to.y * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
              ]}
              stroke="#cbd5e1"
              strokeWidth={1}
              dash={[4, 4]}
              opacity={0.6}
            />
          ))}
        </Layer>

        <Layer>
          {traces.map((trace) => {
            const isTopLayer = trace.layer === 'F.Cu';
            if (!visibleLayers[trace.layer]) return null;

            return (
              <Line
                key={trace.id}
                points={trace.points.flatMap((point) => [
                  point.x * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
                  point.y * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
                ])}
                stroke={isTopLayer ? '#ef4444' : '#38bdf8'}
                strokeWidth={trace.width_mm * SCALE_MM_TO_PX * 2.5}
                lineCap="round"
                lineJoin="round"
                opacity={0.85}
                shadowColor={isTopLayer ? '#ef4444' : '#38bdf8'}
                shadowBlur={4}
                onClick={(e: KonvaEventObject<MouseEvent>) => {
                  e.cancelBubble = true;
                  selectTrace(trace.id);
                }}
              />
            );
          })}

          {isRoutingTrace && activeRoute && (
            <Line
              points={activeRoute.currentPoints.flatMap((point) => [
                point.x * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
                point.y * SCALE_MM_TO_PX + BOARD_OFFSET_PX,
              ])}
              stroke={activeLayer === 'F.Cu' ? '#f87171' : '#7dd3fc'}
              strokeWidth={traceWidth_mil * 0.0254 * SCALE_MM_TO_PX * 2.5}
              lineCap="round"
              lineJoin="round"
              dash={[6, 3]}
            />
          )}

          {vias.map((via) => (
            <Group
              key={via.id}
              x={via.x * SCALE_MM_TO_PX + BOARD_OFFSET_PX}
              y={via.y * SCALE_MM_TO_PX + BOARD_OFFSET_PX}
              draggable={!readOnly}
              onDragEnd={(e: KonvaEventObject<DragEvent>) => {
                updateViaPosition(
                  via.id,
                  TraceRouter.snapToGrid((e.target.x() - BOARD_OFFSET_PX) / SCALE_MM_TO_PX),
                  TraceRouter.snapToGrid((e.target.y() - BOARD_OFFSET_PX) / SCALE_MM_TO_PX)
                );
              }}
            >
              <Circle radius={via.pad_mm * SCALE_MM_TO_PX * 2} fill="#facc15" stroke="#ca8a04" strokeWidth={1} />
              <Circle radius={via.drill_mm * SCALE_MM_TO_PX * 2} fill="#090d16" />
            </Group>
          ))}
        </Layer>

        <Layer visible={visibleLayers['F.Silk']}>
          {footprints.map((footprint) => (
            <Group key={footprint.id} x={BOARD_OFFSET_PX} y={BOARD_OFFSET_PX}>
              <PcbFootprintRenderer
                footprint={footprint}
                isSelected={footprint.id === selectedFootprintId}
                scaleMmToPx={SCALE_MM_TO_PX}
                showCopper={visibleLayers['F.Cu']}
                showSilk={visibleLayers['F.Silk']}
                readOnly={readOnly}
                onSelect={() => selectFootprint(footprint.id)}
                onDragEnd={(x_mm, y_mm) => updateFootprintPosition(footprint.id, x_mm, y_mm)}
                onPadClick={(padId, padX_mm, padY_mm) => {
                  if (readOnly) return;
                  if (!isRoutingTrace) {
                    startRouting({
                      componentId: footprint.componentId,
                      padId,
                      x: padX_mm,
                      y: padY_mm,
                      netId: footprint.pads.find((pad) => pad.id === padId)?.netId,
                    });
                  } else {
                    finishRouting({
                      componentId: footprint.componentId,
                      padId,
                      x: padX_mm,
                      y: padY_mm,
                      netId: footprint.pads.find((pad) => pad.id === padId)?.netId,
                    }, TraceRouter.route45Degree(
                      activeRoute?.startPad ? { x: activeRoute.startPad.x, y: activeRoute.startPad.y } : { x: padX_mm, y: padY_mm },
                      { x: padX_mm, y: padY_mm },
                    ));
                  }
                }}
              />
            </Group>
          ))}
        </Layer>
      </Stage>

      <PcbExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        projectName={projectName}
        wires={wires}
      />
    </div>
  );
}
