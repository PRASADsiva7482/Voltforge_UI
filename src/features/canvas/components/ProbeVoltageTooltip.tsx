import { memo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { useCanvasStore } from '../../../store/canvasStore';
import type { PinPosition, Wire } from '../canvasTypes';

function pinVoltage(nodeId: string, pinId: string): number | undefined {
  return (globalThis as typeof globalThis & { __voltforgePinVoltages?: Record<string, number> }).__voltforgePinVoltages?.[`${nodeId}:${pinId}`];
}

// These consumers exist only for hovered probes. Keep the existing runtime-node
// refresh behavior without making every wire and pin subscribe to live properties.
export const PinVoltageTooltip = memo(function PinVoltageTooltip({ nodeId, pin }: { nodeId: string; pin: PinPosition }) {
  useCanvasStore(state => state.nodesById.get(nodeId));
  const voltage = pinVoltage(nodeId, pin.id);
  if (voltage === undefined) return null;
  return <Group x={pin.x + 12} y={pin.y - 12} listening={false}>
    <Rect width={75} height={30} cornerRadius={6} fill="#0c0a1c" stroke="#c084fc" strokeWidth={1.5} shadowColor="#c084fc" shadowBlur={10} shadowOpacity={0.6} />
    <Text text={pin.name} x={6} y={4} fontSize={8} fontFamily="JetBrains Mono" fontStyle="700" fill="#a855f7" />
    <Text text={`${voltage.toFixed(3)} V`} x={6} y={15} fontSize={10} fontFamily="JetBrains Mono" fontStyle="700" fill="#34d399" />
  </Group>;
});

export const WireVoltageTooltip = memo(function WireVoltageTooltip({ wire, points }: { wire: Wire; points: number[] }) {
  useCanvasStore(state => state.nodesById.get(wire.fromNodeId));
  useCanvasStore(state => state.nodesById.get(wire.toNodeId));
  const voltage = pinVoltage(wire.fromNodeId, wire.fromPinId) ?? pinVoltage(wire.toNodeId, wire.toPinId);
  if (voltage === undefined) return null;
  const count = points.length / 2, index = Math.floor(count / 2);
  const mid = points.length < 4 ? { x: 0, y: 0 } : count % 2 === 1
    ? { x: points[2 * index], y: points[2 * index + 1] }
    : { x: (points[2 * (index - 1)] + points[2 * index]) / 2, y: (points[2 * (index - 1) + 1] + points[2 * index + 1]) / 2 };
  return <Group x={mid.x - 32} y={mid.y - 10} listening={false}>
    <Rect width={65} height={20} cornerRadius={4} fill="#0c0a1c" stroke="#c084fc" strokeWidth={1.2} shadowColor="#c084fc" shadowBlur={8} shadowOpacity={0.6} />
    <Text text={`${voltage.toFixed(3)} V`} x={6} y={5} fontSize={9} fontFamily="JetBrains Mono" fontStyle="700" fill="#34d399" />
  </Group>;
});
