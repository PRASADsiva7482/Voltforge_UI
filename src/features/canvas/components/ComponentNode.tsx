import { useRef, useEffect, useMemo, useState } from 'react';
import { Group, Rect, Text, Circle, Image as KonvaImage, Transformer } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCanvasStore } from '../../../store/canvasStore';
import { getPinAbsPos, snapToRoutingGuides } from '../../../utils/wireRouting';
import { componentSvgs } from '../componentSvgs';
import PinDot from './PinDot';
import type { CanvasNode } from '../canvasTypes';
import {
  MAT_GRID_MINOR,
  DRAG_SNAP_THRESHOLD,
  MIN_NODE_SIZE,
  ACTIVE_GLOW_COLOR,
  ACTIVE_GLOW_PADDING,
  ACTIVE_GLOW_SHADOW_BLUR,
  LED_COLOR_MAP,
  LED_COLOR_DEFAULT,
  LCD_I2C_SCREEN,
  LCD_16X2_SCREEN,
  OLED_SCREEN,
  LCD_BACKLIGHT_ON,
  LCD_BACKLIGHT_OFF,
  LCD_TEXT_BACKLIGHT_ON,
  LCD_TEXT_BACKLIGHT_OFF,
  OLED_BG,
  OLED_TEXT_COLOR,
  MOTOR_BELL_CENTER_Y,
  MOTOR_PROPELLER_HUB_RADIUS,
  MOTOR_SPIN_GLOW_RADIUS,
  ESC_THROTTLE_HIGH,
  ESC_THROTTLE_MID,
  ESC_THROTTLE_LOW,
  ESC_THROTTLE_HIGH_THRESHOLD,
  ESC_THROTTLE_MID_THRESHOLD,
} from '../canvasConstants';

// ── SVG Image loader hook ──
const useImage = (url: string) => {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.src = url.trim().startsWith('<svg')
      ? `data:image/svg+xml;utf8,${encodeURIComponent(url)}`
      : url;
    img.onload = () => setImage(img);
  }, [url]);
  return image;
};

interface ComponentNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  isDark: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasNode>) => void;
  onDragEnd: (updates: Partial<CanvasNode>) => void;
  isWiring: boolean;
  wiringFromNodeId: string | null;
  startWiring: (nodeId: string, pinId: string) => void;
  finishWiring: (nodeId: string, pinId: string) => void;
  onInteraction?: (nodeId: string, event: 'press' | 'release') => void;
  readOnly?: boolean;
}

/** Main visual component rendered on the canvas. */
const ComponentNode = ({
  node,
  isSelected,
  isDark,
  onSelect,
  onChange,
  onDragEnd,
  isWiring,
  wiringFromNodeId,
  startWiring,
  finishWiring,
  onInteraction,
  readOnly,
}: ComponentNodeProps) => {
  const shapeRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  // Cached snap anchors: computed once on DragStart, reused every onDragMove frame
  const snapAnchorsRef = useRef<{ x: number; y: number }[]>([]);

  let svgData = (node.properties?.svgData as string | undefined) || componentSvgs[node.type];

  // ── Memoize LED color resolution ──
  const ledColor = useMemo(() => {
    if (!node.type.includes('LED')) return LED_COLOR_DEFAULT;
    if (node.properties?.ledColor) return node.properties.ledColor as string;
    if (node.properties?.color && typeof node.properties.color === 'string')
      return node.properties.color as string;
    // Infer from component name
    const name = (node.name || '').toLowerCase();
    for (const [key, color] of Object.entries(LED_COLOR_MAP)) {
      if (name.includes(key)) return color;
    }
    return LED_COLOR_DEFAULT;
  }, [node.type, node.properties?.ledColor, node.properties?.color, node.name]);

  // ── Memoize SVG recoloring for LEDs ──
  const processedSvgData = useMemo(() => {
    if (!svgData || !node.type.includes('LED')) return svgData;
    const rawColor = ledColor.replace('#', '');
    const encodedColor = `%23${rawColor}`;
    return svgData.replace(/%23ef4444/gi, encodedColor).replace(/%23991b1b/gi, '%23334155');
  }, [svgData, node.type, ledColor]);

  const image = useImage(processedSvgData || '');

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const isBlown = Boolean(node.properties?.isBlown);
  const isActive =
    !isBlown &&
    (node.properties?.isLit ||
      node.properties?.isSpinning ||
      node.properties?.isBeeping ||
      node.properties?.isActive);
  const isButton = node.type === 'PUSH_BUTTON' || node.type === 'BUTTON';
  const isServo = node.type === 'SERVO_MOTOR' || node.type === 'MOTOR_SERVO';

  return (
    <>
      <Group
        ref={shapeRef}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rotation={node.rotation || 0}
        offsetX={0}
        offsetY={0}
        draggable={!node.properties?.locked && !readOnly}
        onClick={(e: KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e: KonvaEventObject<TouchEvent>) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onMouseDown={() => {
          if (isButton && onInteraction) onInteraction(node.id, 'press');
        }}
        onMouseUp={() => {
          if (isButton && onInteraction) onInteraction(node.id, 'release');
        }}
        onMouseLeave={() => {
          if (isButton && onInteraction) onInteraction(node.id, 'release');
        }}
        onTouchStart={() => {
          if (isButton && onInteraction) onInteraction(node.id, 'press');
        }}
        onTouchEnd={() => {
          if (isButton && onInteraction) onInteraction(node.id, 'release');
        }}
        onDragStart={() => {
          // Cache snap anchors ONCE at the start of the drag gesture
          const state = useCanvasStore.getState();
          snapAnchorsRef.current = state.nodes
            .filter((item) => item.id !== node.id)
            .flatMap((item) => [
              { x: item.x, y: item.y },
              { x: item.x + item.width, y: item.y + item.height },
              { x: item.x + item.width / 2, y: item.y + item.height / 2 },
              ...(item.pins
                .map((p) => getPinAbsPos(item, p.id))
                .filter(Boolean) as { x: number; y: number }[]),
            ]);
        }}
        onDragMove={(e: KonvaEventObject<DragEvent>) => {
          // Use cached anchors — zero allocation per frame
          const anchors = snapAnchorsRef.current;
          const snapped = snapToRoutingGuides(
            { x: e.target.x(), y: e.target.y() },
            anchors,
            DRAG_SNAP_THRESHOLD
          );
          // Grid-snap fallback
          const sx = anchors.some((a) => Math.abs(a.x - snapped.x) <= DRAG_SNAP_THRESHOLD)
            ? snapped.x
            : Math.round(snapped.x / MAT_GRID_MINOR) * MAT_GRID_MINOR;
          const sy = anchors.some((a) => Math.abs(a.y - snapped.y) <= DRAG_SNAP_THRESHOLD)
            ? snapped.y
            : Math.round(snapped.y / MAT_GRID_MINOR) * MAT_GRID_MINOR;
          e.target.x(sx);
          e.target.y(sy);
          if (sx !== node.x || sy !== node.y) {
            onChange({ x: sx, y: sy });
          }
        }}
        onDragEnd={(e: KonvaEventObject<DragEvent>) => {
          // Full global wire reroute runs exactly ONCE per drag gesture
          onDragEnd({ x: e.target.x(), y: e.target.y() });
          snapAnchorsRef.current = [];
        }}
        onTransformEnd={() => {
          const n = shapeRef.current;
          if (!n) return;
          const sx = n.scaleX(),
            sy = n.scaleY();
          n.scaleX(1);
          n.scaleY(1);
          const nw = Math.max(MIN_NODE_SIZE, node.width * sx);
          const nh = Math.max(MIN_NODE_SIZE, node.height * sy);
          const newPins = node.pins?.map((p) => ({
            ...p,
            x: p.x * (nw / node.width),
            y: p.y * (nh / node.height),
          }));
          onDragEnd({
            x: n.x(),
            y: n.y(),
            width: nw,
            height: nh,
            pins: newPins,
            rotation: n.rotation(),
          });
        }}
      >
        {/* Active glow — skipped for LEDs which have their own bloom */}
        {isActive && !node.type.includes('LED') && (
          <Rect
            x={-ACTIVE_GLOW_PADDING}
            y={-ACTIVE_GLOW_PADDING}
            width={node.width + ACTIVE_GLOW_PADDING * 2}
            height={node.height + ACTIVE_GLOW_PADDING * 2}
            cornerRadius={8}
            fill="rgba(34,197,94,0.15)"
            shadowColor={ACTIVE_GLOW_COLOR}
            shadowBlur={ACTIVE_GLOW_SHADOW_BLUR}
            listening={false}
          />
        )}

        {/* Multi-layered LED bloom effect */}
        {isActive && node.type.includes('LED') && (
          <>
            {/* Outer haze — wide ambient glow */}
            <Circle
              x={node.width / 2}
              y={node.height / 2 - 10}
              radius={node.width * 0.9}
              fill={ledColor}
              opacity={0.1}
              shadowColor={ledColor}
              shadowBlur={40}
              shadowOpacity={0.4}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
              listening={false}
            />
            {/* Mid glow — concentrated bloom */}
            <Circle
              x={node.width / 2}
              y={node.height / 2 - 10}
              radius={node.width / 2.2}
              fill={ledColor}
              opacity={0.35}
              shadowColor={ledColor}
              shadowBlur={24}
              shadowOpacity={0.7}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
              listening={false}
            />
            {/* Bright core — high-intensity center */}
            <Circle
              x={node.width / 2}
              y={node.height / 2 - 10}
              radius={node.width / 5}
              fill="white"
              opacity={0.85}
              shadowColor={ledColor}
              shadowBlur={12}
              shadowOpacity={0.9}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
              listening={false}
            />
          </>
        )}

        {isBlown && node.type.includes('LED') && (
          <>
            <Circle
              x={node.width / 2}
              y={node.height / 2 - 10}
              radius={node.width / 3}
              fill="#111827"
              stroke="#ef4444"
              strokeWidth={2}
              opacity={0.9}
              shadowColor="#ef4444"
              shadowBlur={18}
            />
            <Text
              text="BLOWN"
              x={4}
              y={Math.max(4, node.height / 2 - 7)}
              width={node.width - 8}
              align="center"
              fontSize={9}
              fontFamily="Inter"
              fontStyle="700"
              fill="#fecaca"
              listening={false}
            />
          </>
        )}

        {/* Component image or fallback */}
        {image ? (
          <KonvaImage
            image={image}
            width={node.width}
            height={node.height}
            shadowColor="rgba(0,0,0,0.4)"
            shadowBlur={6}
            shadowOffsetY={2}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />
        ) : (
          <>
            <Rect
              width={node.width}
              height={node.height}
              fill="#1e293b"
              stroke="#475569"
              strokeWidth={1.5}
              cornerRadius={6}
              shadowColor="rgba(0,0,0,0.4)"
              shadowBlur={6}
            />
            <Text
              text={node.name}
              x={6}
              y={6}
              fontSize={10}
              fontFamily="Inter"
              fontStyle="600"
              fill="white"
              width={node.width - 12}
            />
            <Text
              text={node.type.replace(/_/g, ' ')}
              x={6}
              y={node.height - 16}
              fontSize={7}
              fontFamily="Inter"
              fill="rgba(255,255,255,0.3)"
            />
          </>
        )}

        {node.type === 'MULTIMETER' && (
          <Text
            text={(node.properties?.displayValue as string) || '0.00V'}
            x={14}
            y={27}
            width={node.width - 28}
            align="center"
            fontSize={Math.max(12, Math.min(20, node.width / 6))}
            fontFamily="JetBrains Mono"
            fontStyle="700"
            fill="#86efac"
            listening={false}
          />
        )}

        {/* LCD / I2C Display — live text overlay */}
        {(node.type === 'DISPLAY_LCD_I2C' || node.type === 'LCD_16X2') &&
          (() => {
            const line1 = (node.properties?.lcdLine1 as string) || '';
            const line2 = (node.properties?.lcdLine2 as string) || '';
            const hasText = line1.trim() || line2.trim();
            const backlight = node.properties?.lcdBacklight !== false;
            const screen = node.type === 'DISPLAY_LCD_I2C' ? LCD_I2C_SCREEN : LCD_16X2_SCREEN;
            const fontSize = Math.max(7, Math.min(11, screen.width / 18));
            const lineH = screen.height / 2;

            return (
              <>
                <Rect
                  x={screen.x}
                  y={screen.y}
                  width={screen.width}
                  height={screen.height}
                  cornerRadius={2}
                  fill={backlight ? LCD_BACKLIGHT_ON : LCD_BACKLIGHT_OFF}
                  opacity={hasText ? 0.95 : 0.7}
                  listening={false}
                />
                <Text
                  x={screen.x + 3}
                  y={screen.y + (lineH - fontSize) / 2}
                  width={screen.width - 6}
                  text={line1 || (hasText ? '' : 'LCD 16x2')}
                  fontSize={fontSize}
                  fontFamily="'JetBrains Mono', 'Courier New', monospace"
                  fontStyle="700"
                  fill={backlight ? LCD_TEXT_BACKLIGHT_ON : LCD_TEXT_BACKLIGHT_OFF}
                  listening={false}
                />
                <Text
                  x={screen.x + 3}
                  y={screen.y + lineH + (lineH - fontSize) / 2}
                  width={screen.width - 6}
                  text={line2 || ''}
                  fontSize={fontSize}
                  fontFamily="'JetBrains Mono', 'Courier New', monospace"
                  fontStyle="700"
                  fill={backlight ? LCD_TEXT_BACKLIGHT_ON : LCD_TEXT_BACKLIGHT_OFF}
                  listening={false}
                />
              </>
            );
          })()}

        {/* OLED Display — live text overlay */}
        {(node.type === 'DISPLAY_OLED' || node.type === 'OLED_DISPLAY') &&
          (() => {
            const line1 = (node.properties?.lcdLine1 as string) || '';
            const line2 = (node.properties?.lcdLine2 as string) || '';
            const hasText = line1.trim() || line2.trim();
            const fontSize = Math.max(7, Math.min(9, OLED_SCREEN.width / 12));
            const lineH = OLED_SCREEN.height / 2;

            return (
              <>
                <Rect
                  x={OLED_SCREEN.x}
                  y={OLED_SCREEN.y}
                  width={OLED_SCREEN.width}
                  height={OLED_SCREEN.height}
                  cornerRadius={2}
                  fill={OLED_BG}
                  opacity={0.95}
                  listening={false}
                />
                <Text
                  x={OLED_SCREEN.x + 3}
                  y={OLED_SCREEN.y + (lineH - fontSize) / 2}
                  width={OLED_SCREEN.width - 6}
                  text={line1 || (hasText ? '' : 'OLED 128x64')}
                  fontSize={fontSize}
                  fontFamily="'JetBrains Mono', 'Courier New', monospace"
                  fontStyle="700"
                  fill={OLED_TEXT_COLOR}
                  listening={false}
                />
                <Text
                  x={OLED_SCREEN.x + 3}
                  y={OLED_SCREEN.y + lineH + (lineH - fontSize) / 2}
                  width={OLED_SCREEN.width - 6}
                  text={line2 || ''}
                  fontSize={fontSize}
                  fontFamily="'JetBrains Mono', 'Courier New', monospace"
                  fontStyle="700"
                  fill={OLED_TEXT_COLOR}
                  listening={false}
                />
              </>
            );
          })()}

        {isServo && (
          <Group
            x={node.width - 15}
            y={node.height / 2}
            rotation={Number(node.properties?.servoAngle || 0) - 90}
            listening={false}
          >
            <Rect
              x={-4}
              y={-22}
              width={8}
              height={44}
              cornerRadius={4}
              fill="#f8fafc"
              stroke="#94a3b8"
              strokeWidth={1}
            />
            <Circle x={0} y={0} radius={5} fill="#334155" />
          </Group>
        )}

        {/* BLDC Motor — animated rotating propeller cross */}
        {node.type === 'MOTOR_BLDC' &&
          (() => {
            const rpm = Number(node.properties?.bldcRpm) || 0;
            const rotation = Number(node.properties?.bldcRotation) || 0;
            const isMotorSpinning = rpm > 0;

            return (
              <>
                <Group
                  x={node.width / 2}
                  y={MOTOR_BELL_CENTER_Y}
                  rotation={rotation}
                  listening={false}
                >
                  {/* Four propeller blades */}
                  <Rect x={-3} y={-22} width={6} height={18} cornerRadius={3}
                    fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3} />
                  <Rect x={-3} y={4} width={6} height={18} cornerRadius={3}
                    fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3} />
                  <Rect x={-22} y={-3} width={18} height={6} cornerRadius={3}
                    fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3} />
                  <Rect x={4} y={-3} width={18} height={6} cornerRadius={3}
                    fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3} />
                  {/* Center hub */}
                  <Circle x={0} y={0} radius={MOTOR_PROPELLER_HUB_RADIUS} fill="#334155" stroke="#94a3b8" strokeWidth={1} />
                </Group>
                {isMotorSpinning && (
                  <Text
                    text={`${rpm} RPM`} x={0} y={node.height - 6} width={node.width}
                    align="center" fontSize={7} fontFamily="JetBrains Mono" fontStyle="700"
                    fill={ACTIVE_GLOW_COLOR} shadowColor={ACTIVE_GLOW_COLOR} shadowBlur={6} listening={false}
                  />
                )}
                {isMotorSpinning && (
                  <Circle
                    x={node.width / 2} y={MOTOR_BELL_CENTER_Y} radius={MOTOR_SPIN_GLOW_RADIUS}
                    fill="transparent" stroke={ACTIVE_GLOW_COLOR} strokeWidth={1.5}
                    opacity={Math.min(0.6, rpm / 12000)}
                    shadowColor={ACTIVE_GLOW_COLOR} shadowBlur={12} shadowOpacity={0.4} listening={false}
                  />
                )}
              </>
            );
          })()}

        {/* ESC Module — throttle percentage overlay */}
        {node.type === 'ESC_MODULE' &&
          (() => {
            const throttle = Number(node.properties?.escThrottle) || 0;
            const rpm = Number(node.properties?.escRpm) || 0;
            const isEscActive = throttle > 0;

            const throttleColor =
              throttle > ESC_THROTTLE_HIGH_THRESHOLD
                ? ESC_THROTTLE_HIGH
                : throttle > ESC_THROTTLE_MID_THRESHOLD
                  ? ESC_THROTTLE_MID
                  : ESC_THROTTLE_LOW;

            return (
              <>
                {isEscActive && (
                  <>
                    <Rect x={14} y={24} width={92} height={6} cornerRadius={3} fill="#0f172a" opacity={0.7} listening={false} />
                    <Rect
                      x={14} y={24}
                      width={Math.round((throttle / 100) * 92)} height={6}
                      cornerRadius={3} fill={throttleColor}
                      shadowColor={throttle > ESC_THROTTLE_HIGH_THRESHOLD ? ESC_THROTTLE_HIGH : ACTIVE_GLOW_COLOR}
                      shadowBlur={6} listening={false}
                    />
                    <Text
                      text={`${throttle}% • ${rpm} RPM`}
                      x={14} y={32} width={92} align="center"
                      fontSize={7} fontFamily="JetBrains Mono" fontStyle="700"
                      fill="#e5e7eb" listening={false}
                    />
                  </>
                )}
              </>
            );
          })()}

        {/* Pins */}
        {node.pins?.map((pin) => (
          <PinDot
            key={pin.id}
            pin={pin}
            nodeId={node.id}
            node={node}
            isWiring={isWiring}
            wiringFromNodeId={wiringFromNodeId}
            isDark={isDark}
            startWiring={startWiring}
            finishWiring={finishWiring}
          />
        ))}

        {/* Lock indicator */}
        {node.properties?.locked && (
          <Text text="🔒" x={node.width - 16} y={2} fontSize={10} listening={false} />
        )}
      </Group>

      {isSelected && !node.properties?.locked && !readOnly && (
        <Transformer
          ref={trRef}
          flipEnabled={false}
          rotateEnabled={true}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          boundBoxFunc={(_, nb) => (nb.width < MIN_NODE_SIZE || nb.height < MIN_NODE_SIZE ? _ : nb)}
        />
      )}
    </>
  );
};

export default ComponentNode;
