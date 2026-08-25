import { Group, Rect, Circle, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { PcbFootprint } from '../../store/pcbStore';

interface Props {
  footprint: PcbFootprint;
  isSelected: boolean;
  scaleMmToPx: number;
  onSelect: () => void;
  onDragEnd: (x_mm: number, y_mm: number) => void;
  onPadClick: (padId: string, padX_mm: number, padY_mm: number) => void;
  showCopper?: boolean;
  showSilk?: boolean;
  readOnly?: boolean;
}

export default function PcbFootprintRenderer({
  footprint,
  isSelected,
  scaleMmToPx,
  onSelect,
  onDragEnd,
  onPadClick,
  showCopper = true,
  showSilk = true,
  readOnly = false,
}: Props) {
  const x = footprint.x * scaleMmToPx;
  const y = footprint.y * scaleMmToPx;
  const w = footprint.width * scaleMmToPx;
  const h = footprint.height * scaleMmToPx;

  return (
    <Group
      x={x}
      y={y}
      rotation={footprint.rotation}
      draggable={!readOnly}
      onClick={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        const newX_mm = e.target.x() / scaleMmToPx;
        const newY_mm = e.target.y() / scaleMmToPx;
        onDragEnd(newX_mm, newY_mm);
      }}
    >
      <Group visible={showSilk}>
        {/* Silkscreen body outline (F.Silk) */}
        <Rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          stroke={isSelected ? '#38bdf8' : '#ffffff'}
          strokeWidth={isSelected ? 2 : 1}
          fill={isSelected ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)'}
          cornerRadius={2}
        />

        {/* Pin 1 orientation indicator notch / dot */}
        <Circle x={-w / 2 + 4} y={-h / 2 + 4} radius={2} fill="#ffffff" />

        {/* Reference Designator Text */}
        <Text
          text={footprint.name}
          x={-w / 2}
          y={-h / 2 - 12}
          fontSize={10}
          fontFamily="'JetBrains Mono', monospace"
          fontStyle="bold"
          fill="#ffffff"
        />
      </Group>

      {/* Copper Pads */}
      <Group visible={showCopper}>
        {footprint.pads.map((pad) => {
        const padX = pad.x * scaleMmToPx;
        const padY = pad.y * scaleMmToPx;
        const padW = pad.width * scaleMmToPx;
        const padH = pad.height * scaleMmToPx;
        const isTht = Boolean(pad.drillDiameter);

          return (
            <Group
              key={pad.id}
              x={padX}
              y={padY}
              onClick={(e: KonvaEventObject<MouseEvent>) => {
                e.cancelBubble = true;
                const radians = (footprint.rotation * Math.PI) / 180;
                const rotatedX = pad.x * Math.cos(radians) - pad.y * Math.sin(radians);
                const rotatedY = pad.x * Math.sin(radians) + pad.y * Math.cos(radians);
                onPadClick(pad.id, footprint.x + rotatedX, footprint.y + rotatedY);
              }}
            >
            {/* Outer Copper Pad */}
            <Rect
              x={-padW / 2}
              y={-padH / 2}
              width={padW}
              height={padH}
              fill="#facc15"
              stroke="#ca8a04"
              strokeWidth={0.8}
              cornerRadius={pad.shape === 'circle' ? padW / 2 : 1}
            />

            {/* Drill Hole for Through-Hole Pads */}
            {isTht && (
              <Circle
                radius={((pad.drillDiameter || 0.8) * scaleMmToPx) / 2}
                fill="#0f172a"
                stroke="#475569"
                strokeWidth={0.5}
              />
            )}

            {/* Pad Label */}
            <Text
              text={pad.name}
              x={-padW / 2}
              y={-padH / 2 + 2}
              width={padW}
              align="center"
              fontSize={7}
              fontFamily="monospace"
              fontStyle="bold"
              fill="#713f12"
            />
            </Group>
          );
        })}
      </Group>
    </Group>
  );
}
