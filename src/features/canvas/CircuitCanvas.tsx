import { useCallback, useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Group, Text, Circle, Line, Image as KonvaImage, Transformer, Shape } from 'react-konva';
import { useCanvasStore } from '../../store/canvasStore';
import type { CanvasNode, Wire, PinPosition } from '../../types';
import { componentSvgs } from './componentSvgs';

interface Props { width: number; height: number; }

const useImage = (url: string) => {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.src = url;
    img.onload = () => setImage(img);
  }, [url]);
  return image;
};

// ── Wire Component with proper bezier routing ──
const WireShape = ({ wire, nodes, isSelected, onSelect }: {
  wire: Wire; nodes: CanvasNode[]; isSelected: boolean; onSelect: () => void;
}) => {
  const from = nodes.find(n => n.id === wire.fromNodeId);
  const to = nodes.find(n => n.id === wire.toNodeId);
  if (!from || !to) return null;

  const fp = from.pins?.find(p => p.id === wire.fromPinId);
  const tp = to.pins?.find(p => p.id === wire.toPinId);
  const sx = fp ? from.x + fp.x : from.x + from.width / 2;
  const sy = fp ? from.y + fp.y : from.y + from.height;
  const ex = tp ? to.x + tp.x : to.x + to.width / 2;
  const ey = tp ? to.y + tp.y : to.y;

  // Smart bezier: route wires with right-angle segments
  const dx = Math.abs(ex - sx);
  const dy = Math.abs(ey - sy);
  const cpOffset = Math.max(30, Math.min(dx, dy) * 0.5);

  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        context.moveTo(sx, sy);
        // Create smooth bezier curve
        const midY = (sy + ey) / 2;
        context.bezierCurveTo(sx, sy + cpOffset, ex, ey - cpOffset, ex, ey);
        context.fillStrokeShape(shape);
      }}
      stroke={isSelected ? '#22c55e' : wire.color}
      strokeWidth={isSelected ? 3.5 : 2.5}
      shadowColor={wire.color}
      shadowBlur={isSelected ? 12 : 4}
      shadowOpacity={0.4}
      hitStrokeWidth={14}
      onClick={onSelect}
      onTap={onSelect}
    />
  );
};

// ── Live wiring preview ──
const WiringPreview = ({ fromPos, mousePos }: { fromPos: { x: number; y: number }; mousePos: { x: number; y: number } }) => (
  <Shape
    sceneFunc={(context, shape) => {
      context.beginPath();
      context.moveTo(fromPos.x, fromPos.y);
      const cpOffset = Math.max(30, Math.abs(mousePos.y - fromPos.y) * 0.4);
      context.bezierCurveTo(fromPos.x, fromPos.y + cpOffset, mousePos.x, mousePos.y - cpOffset, mousePos.x, mousePos.y);
      context.fillStrokeShape(shape);
    }}
    stroke="#22c55e"
    strokeWidth={2}
    dash={[6, 4]}
    shadowColor="#22c55e"
    shadowBlur={8}
    shadowOpacity={0.5}
  />
);

// ── Pin component ──
const PinDot = ({ pin, nodeId, isWiring, startWiring, finishWiring }: {
  pin: PinPosition; nodeId: string; isWiring: boolean;
  startWiring: (n: string, p: string) => void;
  finishWiring: (n: string, p: string) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const pinColor = pin.type === 'power' ? '#ef4444' : pin.type === 'ground' ? '#333' : '#e2e8f0';

  return (
    <Group>
      {/* Hover ring */}
      {(hovered || isWiring) && (
        <Circle x={pin.x} y={pin.y} radius={8} fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={1} dash={[2, 2]} />
      )}
      <Circle
        x={pin.x} y={pin.y} radius={4}
        fill={hovered ? '#22c55e' : pinColor}
        stroke={hovered ? '#22c55e' : '#475569'}
        strokeWidth={1}
        hitStrokeWidth={14}
        onClick={(e) => { e.cancelBubble = true; if (isWiring) finishWiring(nodeId, pin.id); else startWiring(nodeId, pin.id); }}
        onMouseEnter={(e) => { setHovered(true); const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'crosshair'; }}
        onMouseLeave={(e) => { setHovered(false); const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'default'; }}
      />
      {/* Pin label */}
      <Text text={pin.name} x={pin.x + 6} y={pin.y - 5} fontSize={7} fill="rgba(255,255,255,0.7)" fontFamily="JetBrains Mono" shadowColor="black" shadowBlur={3} />
    </Group>
  );
};

// ── Component Node ──
const ComponentNode = ({ node, isSelected, onSelect, onChange, isWiring, startWiring, finishWiring }: {
  node: CanvasNode; isSelected: boolean; onSelect: () => void; onChange: (a: any) => void;
  isWiring: boolean; startWiring: (n: string, p: string) => void; finishWiring: (n: string, p: string) => void;
}) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const svgData = componentSvgs[node.type];
  const image = useImage(svgData || '');

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const isActive = node.properties?.isLit || node.properties?.isSpinning || node.properties?.isBeeping || node.properties?.isSwitched;

  return (
    <>
      <Group
        ref={shapeRef} x={node.x} y={node.y} width={node.width} height={node.height}
        draggable
        onClick={onSelect}
        onDragEnd={(e) => onChange({ x: Math.round(e.target.x() / 20) * 20, y: Math.round(e.target.y() / 20) * 20 })}
        onTransformEnd={() => {
          const n = shapeRef.current;
          const sx = n.scaleX(), sy = n.scaleY();
          n.scaleX(1); n.scaleY(1);
          const nw = Math.max(20, node.width * sx), nh = Math.max(20, node.height * sy);
          const newPins = node.pins?.map(p => ({ ...p, x: p.x * (nw / node.width), y: p.y * (nh / node.height) }));
          onChange({ x: n.x(), y: n.y(), width: nw, height: nh, pins: newPins });
        }}
      >
        {/* Active glow */}
        {isActive && <Rect x={-6} y={-6} width={node.width + 12} height={node.height + 12} cornerRadius={12} fill="rgba(34,197,94,0.2)" shadowColor="#22c55e" shadowBlur={20} />}

        {/* Component image or fallback */}
        {image ? (
          <KonvaImage image={image} width={node.width} height={node.height} shadowColor="rgba(0,0,0,0.5)" shadowBlur={8} shadowOffsetY={3} />
        ) : (
          <>
            <Rect width={node.width} height={node.height} fill="#1e293b" stroke="#475569" strokeWidth={1.5} cornerRadius={6} shadowColor="rgba(0,0,0,0.5)" shadowBlur={8} shadowOffsetY={4} />
            <Text text={node.name} x={6} y={6} fontSize={10} fontFamily="Inter" fontStyle="600" fill="white" width={node.width - 12} />
            <Text text={node.type.replace(/_/g, ' ')} x={6} y={node.height - 16} fontSize={7} fontFamily="Inter" fill="rgba(255,255,255,0.4)" />
          </>
        )}

        {/* Pins */}
        {node.pins?.map(pin => (
          <PinDot key={pin.id} pin={pin} nodeId={node.id} isWiring={isWiring} startWiring={startWiring} finishWiring={finishWiring} />
        ))}
      </Group>

      {isSelected && (
        <Transformer ref={trRef} flipEnabled={false} rotateEnabled={false}
          boundBoxFunc={(_, nb) => (nb.width < 20 || nb.height < 20) ? _ : nb} />
      )}
    </>
  );
};

// ── Main Canvas ──
export default function CircuitCanvas({ width, height }: Props) {
  const { nodes, wires, selectedNodeId, selectedWireId, viewport, updateNode, selectNode, selectWire, isWiring, wiringFrom, startWiring, finishWiring, cancelWiring, setViewport } = useCanvasStore();
  const stageRef = useRef<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current; if (!stage) return;
    const old = viewport.scale;
    const ptr = stage.getPointerPosition();
    const mp = { x: (ptr.x - viewport.x) / old, y: (ptr.y - viewport.y) / old };
    const dir = e.evt.deltaY > 0 ? -1 : 1;
    const ns = Math.max(0.1, Math.min(5, dir > 0 ? old * 1.08 : old / 1.08));
    setViewport({ scale: ns, x: ptr.x - mp.x * ns, y: ptr.y - mp.y * ns });
  }, [viewport, setViewport]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { selectNode(null); cancelWiring(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) useCanvasStore.getState().removeNode(selectedNodeId);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWireId) useCanvasStore.getState().removeWire(selectedWireId);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedNodeId, selectedWireId, selectNode, cancelWiring]);

  // Get absolute pin position for wiring preview
  const getWiringFromPos = () => {
    if (!wiringFrom) return { x: 0, y: 0 };
    const node = nodes.find(n => n.id === wiringFrom.nodeId);
    if (!node) return { x: 0, y: 0 };
    const pin = node.pins?.find(p => p.id === wiringFrom.pinId);
    return { x: node.x + (pin?.x || 0), y: node.y + (pin?.y || 0) };
  };

  return (
    <Stage
      ref={stageRef} width={width} height={height} draggable
      x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}
      onWheel={handleWheel}
      onClick={(e) => { if (e.target === e.target.getStage()) { selectNode(null); selectWire(null); if (isWiring) cancelWiring(); } }}
      onMouseMove={(e) => {
        if (!isWiring) return;
        const stage = stageRef.current; if (!stage) return;
        const ptr = stage.getPointerPosition();
        setMousePos({ x: (ptr.x - viewport.x) / viewport.scale, y: (ptr.y - viewport.y) / viewport.scale });
      }}
    >
      <Layer>
        {/* Grid dots */}
        {Array.from({ length: Math.ceil(width / viewport.scale / 20) + 10 }).map((_, i) =>
          Array.from({ length: Math.ceil(height / viewport.scale / 20) + 10 }).map((_, j) => (
            <Circle key={`g${i}_${j}`} x={i * 20} y={j * 20} radius={0.5} fill="rgba(255,255,255,0.08)" />
          ))
        )}

        {/* Wires */}
        {wires.map(w => (
          <WireShape key={w.id} wire={w} nodes={nodes} isSelected={w.id === selectedWireId} onSelect={() => selectWire(w.id)} />
        ))}

        {/* Live wiring preview */}
        {isWiring && wiringFrom && <WiringPreview fromPos={getWiringFromPos()} mousePos={mousePos} />}

        {/* Components */}
        {nodes.map(node => (
          <ComponentNode
            key={node.id} node={node} isSelected={node.id === selectedNodeId}
            onSelect={() => selectNode(node.id)}
            onChange={(a) => updateNode(node.id, a)}
            isWiring={isWiring} startWiring={startWiring} finishWiring={finishWiring}
          />
        ))}
      </Layer>
    </Stage>
  );
}
