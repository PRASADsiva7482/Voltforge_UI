import { useCallback, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Group, Text, Circle, Line } from 'react-konva';
import { useCanvasStore } from '../../store/canvasStore';
import type { CanvasNode, Wire } from '../../types';

interface Props { width: number; height: number; }

export default function CircuitCanvas({ width, height }: Props) {
  const { nodes, wires, selectedNodeId, viewport, updateNode, selectNode, selectWire, isWiring, startWiring, finishWiring, cancelWiring, setViewport } = useCanvasStore();
  const stageRef = useRef<any>(null);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = viewport.scale;
    const pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - viewport.x) / oldScale, y: (pointer.y - viewport.y) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.max(0.1, Math.min(5, direction > 0 ? oldScale * 1.08 : oldScale / 1.08));
    setViewport({ scale: newScale, x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  }, [viewport, setViewport]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { selectNode(null); cancelWiring(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) { useCanvasStore.getState().removeNode(selectedNodeId); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, selectNode, cancelWiring]);

  const colors: Record<string, { fill: string; stroke: string }> = {
    ARDUINO_UNO: { fill: '#1e40af', stroke: '#3b82f6' }, ESP32: { fill: '#065f46', stroke: '#10b981' },
    LED_STANDARD: { fill: '#7f1d1d', stroke: '#ef4444' }, RESISTOR: { fill: '#78350f', stroke: '#f59e0b' },
    default: { fill: '#1e293b', stroke: '#475569' },
  };
  const getColor = (type: string) => colors[type] || colors.default;

  return (
    <Stage ref={stageRef} width={width} height={height} draggable x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale} onWheel={handleWheel}
      onClick={(e) => { if (e.target === e.target.getStage()) { selectNode(null); if (isWiring) cancelWiring(); } }}>
      <Layer>
        {wires.map((w: Wire) => {
          const from = nodes.find(n => n.id === w.fromNodeId), to = nodes.find(n => n.id === w.toNodeId);
          if (!from || !to) return null;
          return <Line key={w.id} points={[from.x + from.width / 2, from.y + from.height, to.x + to.width / 2, to.y]} stroke={w.color} strokeWidth={2.5} bezier shadowColor={w.color} shadowBlur={6} shadowOpacity={0.3} onClick={() => selectWire(w.id)} hitStrokeWidth={10} />;
        })}
        {nodes.map((node: CanvasNode) => {
          const c = getColor(node.type), sel = node.id === selectedNodeId;
          return (
            <Group key={node.id} x={node.x} y={node.y} draggable onDragEnd={(e) => updateNode(node.id, { x: Math.round(e.target.x() / 20) * 20, y: Math.round(e.target.y() / 20) * 20 })} onClick={() => selectNode(node.id)}>
              {sel && <Rect x={-4} y={-4} width={node.width + 8} height={node.height + 8} cornerRadius={10} stroke="#22c55e" strokeWidth={2} shadowColor="#22c55e" shadowBlur={15} dash={[6, 3]} />}
              <Rect width={node.width} height={node.height} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} cornerRadius={8} shadowColor="rgba(0,0,0,0.5)" shadowBlur={8} shadowOffsetY={4} />
              <Text text={node.name} x={8} y={8} fontSize={11} fontFamily="Inter" fontStyle="600" fill="white" width={node.width - 16} />
              <Text text={node.type.replace(/_/g, ' ')} x={8} y={node.height - 20} fontSize={8} fontFamily="Inter" fill="rgba(255,255,255,0.5)" />
              {node.pins?.map((pin) => (
                <Group key={pin.id}>
                  <Circle x={pin.x} y={pin.y} radius={4} fill={isWiring ? '#22c55e' : '#475569'} stroke={isWiring ? '#22c55e' : '#94a3b8'} strokeWidth={1}
                    onClick={() => { if (isWiring) finishWiring(node.id, pin.id); else startWiring(node.id, pin.id); }} hitStrokeWidth={8} />
                  <Text text={pin.name} x={pin.x + 6} y={pin.y - 4} fontSize={7} fill="rgba(255,255,255,0.4)" fontFamily="JetBrains Mono" />
                </Group>
              ))}
            </Group>
          );
        })}
      </Layer>
    </Stage>
  );
}
