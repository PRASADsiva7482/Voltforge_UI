import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Group, Text, Circle, Line, Image as KonvaImage, Transformer } from 'react-konva';
import { Download, Layers } from 'lucide-react';
import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import { useThemeStore } from '../../store/themeStore';
import type { CanvasNode, Wire, PinPosition, WireBendPoint } from '../../types';
import { componentSvgs } from './componentSvgs';
import { getPinAbsPos, distToSegment, getWireRenderPoints, getWiringPreviewPoints, snapToRoutingGuides } from '../../utils/wireRouting';

interface Props {
  width: number;
  height: number;
  viewMode?: 'breadboard' | 'pcb';
  collaborators?: Record<string, any>;
  onComponentInteraction?: (nodeId: string, event: 'press' | 'release') => void;
  onCursorMove?: (x: number, y: number) => void;
  readOnly?: boolean;
}

const MAT_GRID_MINOR = 20;
const MAT_GRID_MAJOR = 100;

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

// ── Helper: get absolute pin position ──
// ── Wire rendering with multi-segment support ──
const WireShape = ({ wire, nodes, wires, isSelected, isDark, onSelect, onWireDragStart, activeNewBendPoint }: {
  wire: Wire; nodes: CanvasNode[]; wires: Wire[]; isSelected: boolean;
  isDark: boolean;
  onSelect: () => void;
  onWireDragStart: (wireId: string, index: number, x: number, y: number) => void;
  activeNewBendPoint: { wireId: string, index: number, x: number, y: number } | null;
}) => {
  const from = nodes.find(n => n.id === wire.fromNodeId);
  const to = nodes.find(n => n.id === wire.toNodeId);
  if (!from || !to) return null;

  const startPos = getPinAbsPos(from, wire.fromPinId);
  const endPos = getPinAbsPos(to, wire.toPinId);
  if (!startPos || !endPos) return null;

  // Insert phantom bend point if actively dragging a new one
  const currentBendPoints = [...(wire.bendPoints || [])];
  if (activeNewBendPoint && activeNewBendPoint.wireId === wire.id) {
    currentBendPoints.splice(activeNewBendPoint.index, 0, { x: activeNewBendPoint.x, y: activeNewBendPoint.y });
  }

  const allPoints = getWireRenderPoints(wire, nodes, currentBendPoints, wires);

  const handleMouseDown = (e: any) => {
    e.cancelBubble = true;
    onSelect();
  };

  const handleDoubleClick = (e: any) => {
    e.cancelBubble = true;
    if (wire.routingMode === 'auto') return;

    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    const x = pos.x;
    const y = pos.y;

    const allPts = [startPos, ...(wire.bendPoints || []), endPos];
    let bestIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < allPts.length - 1; i++) {
      const d = distToSegment(x, y, allPts[i], allPts[i + 1]);
      if (d < minD) { minD = d; bestIdx = i; }
    }
    onWireDragStart(wire.id, bestIdx, x, y);
  };

  return (
    <>
      {/* Dark outline for wire separation — prevents merging of adjacent wires */}
      <Line
        points={allPoints}
        stroke={isDark ? '#06060f' : '#ffffff'}
        strokeWidth={isSelected ? 7 : 5.5}
        tension={wire.routingMode === 'curved' ? 0.4 : 0}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      {/* Main wire line */}
      <Line
        points={allPoints}
        stroke={isSelected ? (isDark ? '#ffffff' : '#0f172a') : wire.color}
        strokeWidth={isSelected ? 3 : 2.5}
        tension={wire.routingMode === 'curved' ? 0.4 : 0}
        lineCap="round"
        lineJoin="round"
        shadowColor={wire.color}
        shadowBlur={isSelected ? 10 : 4}
        shadowOpacity={0.6}
        hitStrokeWidth={18}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onMouseEnter={(e) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = isSelected ? 'pointer' : 'default';
        }}
        onMouseLeave={(e) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'default';
        }}
      />

      {/* Real Bend point circles */}
      {isSelected && wire.routingMode !== 'auto' && (wire.bendPoints || []).map((bp, idx) => (
        <BendPointHandle key={`bp_${wire.id}_${idx}`} wireId={wire.id} index={idx} point={bp} />
      ))}

      {/* Phantom active drag bend point */}
      {activeNewBendPoint && activeNewBendPoint.wireId === wire.id && (
        <Circle x={activeNewBendPoint.x} y={activeNewBendPoint.y} radius={6} fill="#ef4444" stroke="#22c55e" strokeWidth={2} />
      )}

      {/* Wire label */}
      {wire.label && (
        <Text
          x={(startPos.x + endPos.x) / 2 - 20}
          y={(startPos.y + endPos.y) / 2 - 12}
          text={wire.label}
          fontSize={9}
          fontFamily="Inter"
          fill={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.72)'}
          padding={2}
        />
      )}
    </>
  );
};

// ── Draggable bend point ──
const BendPointHandle = ({ wireId, index, point }: { wireId: string; index: number; point: WireBendPoint }) => {
  const { updateBendPoint, removeBendPoint } = useCanvasStore();
  const [hovered, setHovered] = useState(false);

  return (
    <Circle
      x={point.x} y={point.y}
      radius={hovered ? 7 : 5}
      fill={hovered ? '#ef4444' : '#ffffff'}
      stroke="#22c55e"
      strokeWidth={2}
      shadowColor="#22c55e"
      shadowBlur={hovered ? 10 : 4}
      draggable
      onDragMove={(e) => {
        const state = useCanvasStore.getState();
        const anchors = state.nodes.flatMap(node =>
          node.pins.map(pin => getPinAbsPos(node, pin.id)).filter(Boolean) as { x: number; y: number }[]
        );
        const snapped = snapToRoutingGuides({ x: e.target.x(), y: e.target.y() }, anchors);
        updateBendPoint(wireId, index, snapped);
      }}
      onDblClick={(e) => {
        e.cancelBubble = true;
        removeBendPoint(wireId, index);
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'default';
      }}
    />
  );
};

// ── Live wiring preview ──
const WiringPreview = ({ fromPos, mousePos }: { fromPos: { x: number; y: number }; mousePos: { x: number; y: number } }) => (
  <Line
    points={getWiringPreviewPoints(fromPos, mousePos)}
    stroke="#22c55e"
    strokeWidth={2}
    dash={[8, 4]}
    lineCap="round"
    shadowColor="#22c55e"
    shadowBlur={8}
    shadowOpacity={0.6}
    listening={false}
  />
);

// ── Pin component — large magnetic snap zones ──
const PinDot = ({ pin, nodeId, node, isWiring, wiringFromNodeId, isDark, startWiring, finishWiring }: {
  pin: PinPosition; nodeId: string; node: CanvasNode; isWiring: boolean; wiringFromNodeId: string | null;
  isDark: boolean;
  startWiring: (n: string, p: string) => void;
  finishWiring: (n: string, p: string) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const isValidTarget = isWiring && wiringFromNodeId !== nodeId;
  const pinColor = pin.type === 'power' ? '#ef4444'
    : pin.type === 'ground' ? '#555555'
      : '#cbd5e1';
  const glowColor = pin.type === 'power' ? '#ef4444'
    : pin.type === 'ground' ? '#64748b'
      : '#60a5fa';

  return (
    <Group>
      {/* Magnetic snap zone — large invisible hit area */}
      {isValidTarget && (
        <>
          <Circle
            x={pin.x} y={pin.y}
            radius={hovered ? 18 : 14}
            fill={hovered ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.06)'}
            stroke="#22c55e"
            strokeWidth={hovered ? 2 : 1}
            dash={hovered ? undefined : [4, 3]}
            shadowColor="#22c55e"
            shadowBlur={hovered ? 12 : 0}
            listening={false}
          />
          {/* Direction indicator lines */}
          {hovered && (
            <>
              <Line points={[pin.x - 22, pin.y, pin.x - 14, pin.y]} stroke="#22c55e" strokeWidth={1} opacity={0.5} listening={false} />
              <Line points={[pin.x + 14, pin.y, pin.x + 22, pin.y]} stroke="#22c55e" strokeWidth={1} opacity={0.5} listening={false} />
              <Line points={[pin.x, pin.y - 22, pin.x, pin.y - 14]} stroke="#22c55e" strokeWidth={1} opacity={0.5} listening={false} />
              <Line points={[pin.x, pin.y + 14, pin.x, pin.y + 22]} stroke="#22c55e" strokeWidth={1} opacity={0.5} listening={false} />
            </>
          )}
        </>
      )}
      {/* Type glow ring (always visible during wiring) */}
      {isWiring && !isValidTarget && wiringFromNodeId === nodeId && (
        <Circle x={pin.x} y={pin.y} radius={10}
          fill="rgba(96,165,250,0.12)" stroke="#60a5fa" strokeWidth={1.5}
          shadowColor="#60a5fa" shadowBlur={8} listening={false}
        />
      )}
      {/* Pin dot */}
      <Circle
        x={pin.x} y={pin.y} radius={hovered ? 8 : 6}
        fill={hovered ? (isValidTarget ? '#22c55e' : '#60a5fa') : pinColor}
        stroke={hovered ? (isValidTarget ? '#22c55e' : '#60a5fa') : (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.28)')}
        strokeWidth={1.5}
        shadowColor={hovered ? glowColor : 'transparent'}
        shadowBlur={hovered ? 8 : 0}
        hitStrokeWidth={36}
        onClick={(e) => {
          e.cancelBubble = true;
          if (isWiring) {
            if (wiringFromNodeId === nodeId) return;
            finishWiring(nodeId, pin.id);
          } else {
            startWiring(nodeId, pin.id);
          }
        }}
        onMouseEnter={(e) => {
          setHovered(true);
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'crosshair';
        }}
        onMouseLeave={(e) => {
          setHovered(false);
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'default';
        }}
      />
      {/* Pin label — edge-aware orientation to prevent overlap */}
      {(() => {
        const isLeft = pin.x <= 5;
        const isRight = pin.x >= node.width - 5;
        const isTop = pin.y <= 5;
        const isBottom = pin.y >= node.height - 5;

        let labelX: number, labelY: number, rotation: number;
        let labelWidth: number | undefined;
        let labelAlign: string | undefined;

        if (isLeft) {
          // Left-edge pins: horizontal label pushed to the right of the pin
          rotation = 0;
          labelX = pin.x + 10;
          labelY = pin.y - 4;
          labelAlign = 'left';
        } else if (isRight) {
          // Right-edge pins: horizontal label to the left, right-aligned
          rotation = 0;
          labelX = pin.x - 50;
          labelY = pin.y - 4;
          labelWidth = 42;
          labelAlign = 'right';
        } else if (isTop) {
          // Top-edge pins: vertical label below the pin
          rotation = -90;
          labelX = pin.x - 3;
          labelY = pin.y + 10;
        } else if (isBottom) {
          // Bottom-edge pins: vertical label above the pin, text pointing upward
          rotation = -90;
          labelX = pin.x - 3;
          labelY = pin.y - 10;
          labelWidth = 42;
          labelAlign = 'right';
        } else {
          // Interior / fallback: use top-half heuristic
          const isTopHalf = pin.y < node.height / 2;
          rotation = isTopHalf ? -90 : -90;
          labelX = pin.x - 3;
          labelY = isTopHalf ? pin.y + 10 : pin.y - 10;
          labelWidth = isTopHalf ? undefined : 42;
          labelAlign = isTopHalf ? undefined : 'right';
        }

        if (node.type === 'BREADBOARD' && !hovered) return null;

        return (
          <Text
            text={pin.name}
            x={labelX}
            y={labelY}
            fontSize={8}
            rotation={rotation}
            width={labelWidth}
            align={labelAlign}
            fill={hovered ? (isDark ? 'rgba(255,255,255,1)' : 'rgba(15,23,42,0.95)') : isWiring ? (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.82)') : (isDark ? 'rgba(255,255,255,0.48)' : 'rgba(15,23,42,0.58)')}
            fontFamily="JetBrains Mono"
            fontStyle={hovered ? '700' : '400'}
            shadowColor="black"
            shadowBlur={4}
            listening={false}
          />
        );
      })()}
    </Group>
  );
};

// ── Component Node ──
const ComponentNode = ({ node, isSelected, isDark, onSelect, onChange, onDragEnd, isWiring, wiringFromNodeId, startWiring, finishWiring, onInteraction, readOnly }: {
  node: CanvasNode; isSelected: boolean; onSelect: () => void;
  isDark: boolean;
  onChange: (a: Partial<CanvasNode>) => void;
  onDragEnd: (a: Partial<CanvasNode>) => void;
  isWiring: boolean; wiringFromNodeId: string | null;
  startWiring: (n: string, p: string) => void;
  finishWiring: (n: string, p: string) => void;
  onInteraction?: (nodeId: string, event: 'press' | 'release') => void;
  readOnly?: boolean;
}) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  // ── Cached snap anchors: computed once on DragStart, reused every onDragMove frame ──
  const snapAnchorsRef = useRef<{ x: number; y: number }[]>([]);
  let svgData = (node.properties?.svgData as string | undefined) || componentSvgs[node.type];

  // Resolve the effective LED color from multiple sources:
  // ledColor (user override) → color (from DB seed) → name-based inference → default red
  const getLedColor = (): string => {
    if (node.properties?.ledColor) return node.properties.ledColor as string;
    if (node.properties?.color && typeof node.properties.color === 'string') return node.properties.color as string;
    // Infer from component name
    const name = (node.name || '').toLowerCase();
    if (name.includes('green')) return '#22c55e';
    if (name.includes('blue')) return '#3b82f6';
    if (name.includes('yellow')) return '#eab308';
    if (name.includes('white')) return '#f8fafc';
    if (name.includes('orange')) return '#f97316';
    if (name.includes('rgb') || name.includes('neopixel')) return '#a855f7';
    return '#ef4444'; // default red
  };
  const ledColor = node.type.includes('LED') ? getLedColor() : '#ef4444';

  // Dynamically recolor LED SVG to match the resolved ledColor
  if (svgData && node.type.includes('LED')) {
    const rawColor = ledColor.replace('#', '');
    const encodedColor = `%23${rawColor}`;
    svgData = svgData.replace(/%23ef4444/gi, encodedColor).replace(/%23991b1b/gi, '%23334155');
  }
  const image = useImage(svgData || '');

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const isBlown = Boolean(node.properties?.isBlown);
  const isActive = !isBlown && (node.properties?.isLit || node.properties?.isSpinning || node.properties?.isBeeping || node.properties?.isActive);
  const isButton = node.type === 'PUSH_BUTTON' || node.type === 'BUTTON';
  const isServo = node.type === 'SERVO_MOTOR' || node.type === 'MOTOR_SERVO';

  return (
    <>
      <Group
        ref={shapeRef}
        x={node.x} y={node.y}
        width={node.width} height={node.height}
        rotation={node.rotation || 0}
        offsetX={0} offsetY={0}
        draggable={!node.properties?.locked && !readOnly}
        onClick={(e) => { e.cancelBubble = true; onSelect(); }}
        onTap={(e) => { e.cancelBubble = true; onSelect(); }}
        onMouseDown={() => { if (isButton && onInteraction) onInteraction(node.id, 'press'); }}
        onMouseUp={() => { if (isButton && onInteraction) onInteraction(node.id, 'release'); }}
        onMouseLeave={() => { if (isButton && onInteraction) onInteraction(node.id, 'release'); }}
        onTouchStart={() => { if (isButton && onInteraction) onInteraction(node.id, 'press'); }}
        onTouchEnd={() => { if (isButton && onInteraction) onInteraction(node.id, 'release'); }}
        onDragStart={() => {
          // ── Cache snap anchors ONCE at the start of the drag gesture ──────────
          // This avoids O(N*pins) allocation on every 16 ms onDragMove tick.
          const state = useCanvasStore.getState();
          snapAnchorsRef.current = state.nodes
            .filter(item => item.id !== node.id)
            .flatMap(item => [
              { x: item.x, y: item.y },
              { x: item.x + item.width, y: item.y + item.height },
              { x: item.x + item.width / 2, y: item.y + item.height / 2 },
              ...item.pins.map(p => getPinAbsPos(item, p.id)).filter(Boolean) as { x: number; y: number }[],
            ]);
        }}
        onDragMove={(e) => {
          // ── Use cached anchors — zero allocation per frame ───────────────────
          const anchors = snapAnchorsRef.current;
          const snapped = snapToRoutingGuides({ x: e.target.x(), y: e.target.y() }, anchors, 8);
          // Grid-snap fallback (20px grid)
          const sx = anchors.some(a => Math.abs(a.x - snapped.x) <= 8) ? snapped.x : Math.round(snapped.x / MAT_GRID_MINOR) * MAT_GRID_MINOR;
          const sy = anchors.some(a => Math.abs(a.y - snapped.y) <= 8) ? snapped.y : Math.round(snapped.y / MAT_GRID_MINOR) * MAT_GRID_MINOR;
          e.target.x(sx);
          e.target.y(sy);
          if (sx !== node.x || sy !== node.y) {
            onChange({ x: sx, y: sy });
          }
        }}
        onDragEnd={(e) => {
          // ── Full global wire reroute runs exactly ONCE per drag gesture ──────
          onDragEnd({ x: e.target.x(), y: e.target.y() });
          snapAnchorsRef.current = [];
        }}
        onTransformEnd={() => {
          const n = shapeRef.current;
          if (!n) return;
          const sx = n.scaleX(), sy = n.scaleY();
          n.scaleX(1); n.scaleY(1);
          const nw = Math.max(20, node.width * sx);
          const nh = Math.max(20, node.height * sy);
          const newPins = node.pins?.map(p => ({
            ...p,
            x: p.x * (nw / node.width),
            y: p.y * (nh / node.height)
          }));
          // Transform end is equivalent to drag end — full reroute
          onDragEnd({ x: n.x(), y: n.y(), width: nw, height: nh, pins: newPins, rotation: n.rotation() });
        }}
      >
        {/* Active glow — skipped for LEDs which have their own bloom */}
        {isActive && !node.type.includes('LED') && (
          <Rect x={-4} y={-4} width={node.width + 8} height={node.height + 8}
            cornerRadius={8} fill="rgba(34,197,94,0.15)"
            shadowColor="#22c55e" shadowBlur={16} listening={false}
          />
        )}

        {/* Multi-layered LED bloom effect — perfectDrawEnabled=false + shadowForStrokeEnabled=false
             eliminates the extra canvas clear+redraw pass Konva does for stroked shadows.
             These circles are purely fill-based so there is no visual difference. */}
        {isActive && node.type.includes('LED') && (
          <>
            {/* Outer haze — wide ambient glow */}
            <Circle
              x={node.width / 2} y={node.height / 2 - 10} radius={node.width * 0.9}
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
              x={node.width / 2} y={node.height / 2 - 10} radius={node.width / 2.2}
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
              x={node.width / 2} y={node.height / 2 - 10} radius={node.width / 5}
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
              x={node.width / 2} y={node.height / 2 - 10} radius={node.width / 3}
              fill="#111827" stroke="#ef4444" strokeWidth={2}
              opacity={0.9} shadowColor="#ef4444" shadowBlur={18}
            />
            <Text
              text="BLOWN"
              x={4} y={Math.max(4, node.height / 2 - 7)}
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

        {/* Component image or fallback — perfectDrawEnabled=false avoids a redundant
             canvas clear on every Konva draw cycle for static images. */}
        {image ? (
          <KonvaImage image={image} width={node.width} height={node.height}
            shadowColor="rgba(0,0,0,0.4)" shadowBlur={6} shadowOffsetY={2}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />
        ) : (
          <>
            <Rect width={node.width} height={node.height}
              fill="#1e293b" stroke="#475569" strokeWidth={1.5}
              cornerRadius={6} shadowColor="rgba(0,0,0,0.4)" shadowBlur={6}
            />
            <Text text={node.name} x={6} y={6} fontSize={10} fontFamily="Inter"
              fontStyle="600" fill="white" width={node.width - 12}
            />
            <Text text={node.type.replace(/_/g, ' ')} x={6} y={node.height - 16}
              fontSize={7} fontFamily="Inter" fill="rgba(255,255,255,0.3)"
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
        {(node.type === 'DISPLAY_LCD_I2C' || node.type === 'LCD_16X2') && (() => {
          const line1 = (node.properties?.lcdLine1 as string) || '';
          const line2 = (node.properties?.lcdLine2 as string) || '';
          const hasText = line1.trim() || line2.trim();
          const backlight = node.properties?.lcdBacklight !== false;
          // Screen area coordinates (match the SVG green rect area)
          const isI2C = node.type === 'DISPLAY_LCD_I2C';
          const screenX = isI2C ? 6 : 12;
          const screenY = isI2C ? 6 : 10;
          const screenW = isI2C ? 108 : 146;
          const screenH = isI2C ? 36 : 34;
          // Scale font to fit the screen
          const fontSize = Math.max(7, Math.min(11, screenW / 18));
          const lineH = screenH / 2;

          return (
            <>
              {/* Screen background overlay — changes with backlight */}
              <Rect
                x={screenX} y={screenY}
                width={screenW} height={screenH}
                cornerRadius={2}
                fill={backlight ? '#64d475' : '#2a4d2e'}
                opacity={hasText ? 0.95 : 0.7}
                listening={false}
              />
              {/* Line 1 */}
              <Text
                x={screenX + 3}
                y={screenY + (lineH - fontSize) / 2}
                width={screenW - 6}
                text={line1 || (hasText ? '' : 'LCD 16x2')}
                fontSize={fontSize}
                fontFamily="'JetBrains Mono', 'Courier New', monospace"
                fontStyle="700"
                fill={backlight ? '#004d00' : '#1a331a'}
                listening={false}
              />
              {/* Line 2 */}
              <Text
                x={screenX + 3}
                y={screenY + lineH + (lineH - fontSize) / 2}
                width={screenW - 6}
                text={line2 || ''}
                fontSize={fontSize}
                fontFamily="'JetBrains Mono', 'Courier New', monospace"
                fontStyle="700"
                fill={backlight ? '#004d00' : '#1a331a'}
                listening={false}
              />
            </>
          );
        })()}

        {/* OLED Display — live text overlay */}
        {(node.type === 'DISPLAY_OLED' || node.type === 'OLED_DISPLAY') && (() => {
          const line1 = (node.properties?.lcdLine1 as string) || '';
          const line2 = (node.properties?.lcdLine2 as string) || '';
          const hasText = line1.trim() || line2.trim();
          const screenX = 6;
          const screenY = 6;
          const screenW = 68;
          const screenH = 38;
          const fontSize = Math.max(7, Math.min(9, screenW / 12));
          const lineH = screenH / 2;

          return (
            <>
              {/* Dark OLED screen */}
              <Rect
                x={screenX} y={screenY}
                width={screenW} height={screenH}
                cornerRadius={2}
                fill="#000000"
                opacity={0.95}
                listening={false}
              />
              {/* Line 1 */}
              <Text
                x={screenX + 3}
                y={screenY + (lineH - fontSize) / 2}
                width={screenW - 6}
                text={line1 || (hasText ? '' : 'OLED 128x64')}
                fontSize={fontSize}
                fontFamily="'JetBrains Mono', 'Courier New', monospace"
                fontStyle="700"
                fill="#0ea5e9"
                listening={false}
              />
              {/* Line 2 */}
              <Text
                x={screenX + 3}
                y={screenY + lineH + (lineH - fontSize) / 2}
                width={screenW - 6}
                text={line2 || ''}
                fontSize={fontSize}
                fontFamily="'JetBrains Mono', 'Courier New', monospace"
                fontStyle="700"
                fill="#0ea5e9"
                listening={false}
              />
            </>
          );
        })()}

        {isServo && (
          <Group x={node.width - 15} y={node.height / 2} rotation={Number(node.properties?.servoAngle || 0) - 90} listening={false}>
            <Rect x={-4} y={-22} width={8} height={44} cornerRadius={4} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} />
            <Circle x={0} y={0} radius={5} fill="#334155" />
          </Group>
        )}

        {/* BLDC Motor — animated rotating propeller cross */}
        {node.type === 'MOTOR_BLDC' && (() => {
          const rpm = Number(node.properties?.bldcRpm) || 0;
          const rotation = Number(node.properties?.bldcRotation) || 0;
          const isMotorSpinning = rpm > 0;

          return (
            <>
              {/* Spinning propeller overlay */}
              <Group
                x={node.width / 2}
                y={36}   // Center of the bell in the 80×80 SVG
                rotation={rotation}
                listening={false}
              >
                {/* Four propeller blades */}
                <Rect x={-3} y={-22} width={6} height={18} cornerRadius={3}
                  fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3}
                />
                <Rect x={-3} y={4} width={6} height={18} cornerRadius={3}
                  fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3}
                />
                <Rect x={-22} y={-3} width={18} height={6} cornerRadius={3}
                  fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3}
                />
                <Rect x={4} y={-3} width={18} height={6} cornerRadius={3}
                  fill={isMotorSpinning ? '#f8fafc' : '#6b7280'} opacity={isMotorSpinning ? 0.9 : 0.3}
                />
                {/* Center hub */}
                <Circle x={0} y={0} radius={4} fill="#334155" stroke="#94a3b8" strokeWidth={1} />
              </Group>
              {/* RPM readout */}
              {isMotorSpinning && (
                <Text
                  text={`${rpm} RPM`}
                  x={0}
                  y={node.height - 6}
                  width={node.width}
                  align="center"
                  fontSize={7}
                  fontFamily="JetBrains Mono"
                  fontStyle="700"
                  fill="#22c55e"
                  shadowColor="#22c55e"
                  shadowBlur={6}
                  listening={false}
                />
              )}
              {/* Spin blur ring glow when active */}
              {isMotorSpinning && (
                <Circle
                  x={node.width / 2} y={36} radius={24}
                  fill="transparent"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  opacity={Math.min(0.6, rpm / 12000)}
                  shadowColor="#22c55e"
                  shadowBlur={12}
                  shadowOpacity={0.4}
                  listening={false}
                />
              )}
            </>
          );
        })()}

        {/* ESC Module — throttle percentage overlay */}
        {node.type === 'ESC_MODULE' && (() => {
          const throttle = Number(node.properties?.escThrottle) || 0;
          const rpm = Number(node.properties?.escRpm) || 0;
          const isEscActive = throttle > 0;

          return (
            <>
              {isEscActive && (
                <>
                  {/* Throttle bar background */}
                  <Rect x={14} y={24} width={92} height={6} cornerRadius={3} fill="#0f172a" opacity={0.7} listening={false} />
                  {/* Throttle bar fill */}
                  <Rect
                    x={14} y={24}
                    width={Math.round((throttle / 100) * 92)} height={6}
                    cornerRadius={3}
                    fill={throttle > 80 ? '#ef4444' : throttle > 50 ? '#f59e0b' : '#22c55e'}
                    shadowColor={throttle > 80 ? '#ef4444' : '#22c55e'}
                    shadowBlur={6}
                    listening={false}
                  />
                  {/* Throttle text */}
                  <Text
                    text={`${throttle}% • ${rpm} RPM`}
                    x={14} y={32}
                    width={92}
                    align="center"
                    fontSize={7}
                    fontFamily="JetBrains Mono"
                    fontStyle="700"
                    fill="#e5e7eb"
                    listening={false}
                  />
                </>
              )}
            </>
          );
        })()}

        {/* Pins */}
        {node.pins?.map(pin => (
          <PinDot key={pin.id} pin={pin} nodeId={node.id} node={node}
            isWiring={isWiring} wiringFromNodeId={wiringFromNodeId}
            isDark={isDark}
            startWiring={startWiring} finishWiring={finishWiring}
          />
        ))}


        {/* Lock indicator */}
        {node.properties?.locked && (
          <Text text="🔒" x={node.width - 16} y={2} fontSize={10} listening={false} />
        )}
      </Group>

      {isSelected && !node.properties?.locked && !readOnly && (
        <Transformer ref={trRef} flipEnabled={false} rotateEnabled={true}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          boundBoxFunc={(_, nb) => (nb.width < 20 || nb.height < 20) ? _ : nb}
        />
      )}
    </>
  );
};

// ── Grid Layer (memoized) — professional engineering grid ──
const CanvasMat = ({ width, height, viewport, isDark }: { width: number; height: number; viewport: { x: number; y: number; scale: number }; isDark: boolean }) => {
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
          stroke={isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.055)'} strokeWidth={0.5 / scale} listening={false} />
      );
    }
    for (let y = minY; y <= maxY; y += MAT_GRID_MINOR) {
      if (y % MAT_GRID_MAJOR === 0) continue;
      result.push(
        <Line key={`gm_y_${y}`} points={[minX, y, maxX, y]}
          stroke={isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.055)'} strokeWidth={0.5 / scale} listening={false} />
      );
    }

    // Major grid lines (100px)
    const majorMinX = Math.floor(minX / MAT_GRID_MAJOR) * MAT_GRID_MAJOR;
    const majorMinY = Math.floor(minY / MAT_GRID_MAJOR) * MAT_GRID_MAJOR;
    for (let x = majorMinX; x <= maxX; x += MAT_GRID_MAJOR) {
      result.push(
        <Line key={`gM_x_${x}`} points={[x, minY, x, maxY]}
          stroke={x === 0 ? 'rgba(34,197,94,0.24)' : (isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.11)')}
          strokeWidth={(x === 0 ? 1.4 : 0.8) / scale} listening={false} />
      );
    }
    for (let y = majorMinY; y <= maxY; y += MAT_GRID_MAJOR) {
      result.push(
        <Line key={`gM_y_${y}`} points={[minX, y, maxX, y]}
          stroke={y === 0 ? 'rgba(34,197,94,0.24)' : (isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.11)')}
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
        fill={isDark ? '#06060f' : '#f8fafc'}
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

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 glass rounded-xl px-3 py-2 flex items-center gap-3 border border-surface-200 dark:border-white/10">
      <span className="text-[10px] text-surface-600 font-medium dark:text-surface-400">Wire Color:</span>
      <div className="flex gap-1">
        {WIRE_COLORS.map(c => (
          <button key={c} onClick={() => setWiringColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${wiringColor === c ? 'border-surface-950 scale-125 dark:border-white' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="h-4 w-px bg-surface-200 dark:bg-white/10" />
      <button
        onClick={() => {
          const next = wiringMode === 'straight'
            ? 'orthogonal'
            : wiringMode === 'orthogonal'
              ? 'auto'
              : wiringMode === 'auto'
                ? 'curved'
                : 'straight';
          setWiringMode(next as any);
        }}
        className="text-[10px] px-2 py-1 rounded bg-surface-100 text-surface-700 hover:text-surface-950 hover:bg-white dark:bg-white/5 dark:text-surface-300 dark:hover:text-white dark:hover:bg-white/10">
        {wiringMode === 'straight' ? 'Straight' : wiringMode === 'orthogonal' ? 'Orthogonal' : wiringMode === 'auto' ? 'Smart-route' : 'Curved'}
      </button>
      <span className="text-[9px] text-surface-500 ml-1">Click a pin to connect • ESC to cancel</span>
    </div>
  );
};

// ── Main Canvas ──
const PcbTraceLayer = ({ nodes, wires, isDark }: { nodes: CanvasNode[]; wires: Wire[]; isDark: boolean }) => (
  <Layer listening={false}>
    {wires.map((wire, index) => {
      const points = getWireRenderPoints({ ...wire, routingMode: 'auto' }, nodes, [], wires);
      const isBottom = index % 2 === 1;
      return (
        <Line
          key={`pcb_${wire.id}`}
          points={points}
          stroke={isBottom ? '#38bdf8' : '#f97316'}
          strokeWidth={5}
          opacity={0.62}
          lineCap="round"
          lineJoin="round"
          dash={isBottom ? [12, 6] : undefined}
          shadowColor={isBottom ? '#38bdf8' : '#f97316'}
          shadowBlur={6}
        />
      );
    })}
    {nodes.flatMap(node => node.pins.map(pin => {
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
    }))}
  </Layer>
);

export default function CircuitCanvas({ width, height, viewMode = 'breadboard', collaborators = {}, onComponentInteraction, onCursorMove, readOnly }: Props) {
  const isDark = useThemeStore((state) => state.theme === 'dark');
  const {
    nodes, wires, selectedNodeId, selectedWireId, viewport,
    updateNode, selectNode, selectWire, isWiring, wiringFrom,
    startWiring, finishWiring, cancelWiring, setViewport,
    addBendPoint,
  } = useCanvasStore();
  const stageRef = useRef<any>(null);
  const gridLayerRef = useRef<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [activeNewBendPoint, setActiveNewBendPoint] = useState<{ wireId: string, index: number, x: number, y: number } | null>(null);

  const handleWireDragStart = useCallback((wireId: string, index: number, x: number, y: number) => {
    setActiveNewBendPoint({ wireId, index, x, y });
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const old = viewport.scale;
    const ptr = stage.getPointerPosition();
    const mp = stage.getRelativePointerPosition() || { x: 0, y: 0 };
    const dir = e.evt.deltaY > 0 ? -1 : 1;
    const ns = Math.max(0.15, Math.min(4, dir > 0 ? old * 1.08 : old / 1.08));
    setViewport({ scale: ns, x: (ptr?.x || 0) - mp.x * ns, y: (ptr?.y || 0) - mp.y * ns });
  }, [viewport, setViewport]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { selectNode(null); selectWire(null); cancelWiring(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !readOnly) {
        const state = useCanvasStore.getState();
        if (state.selectedNodeId && !state.nodes.find(n => n.id === state.selectedNodeId)?.properties?.locked) {
          state.removeNode(state.selectedNodeId);
        }
        if (state.selectedWireId) state.removeWire(state.selectedWireId);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectNode, selectWire, cancelWiring]);

  // Get wiring start position
  const getWiringFromPos = () => {
    if (!wiringFrom) return { x: 0, y: 0 };
    const node = nodes.find(n => n.id === wiringFrom.nodeId);
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
      <Stage
        ref={stageRef} width={width} height={height} draggable
        x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}
        onWheel={handleWheel}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            selectNode(null); selectWire(null);
            if (isWiring) cancelWiring();
          }
        }}
        onMouseMove={(e) => {
          const stage = stageRef.current;
          if (!stage) return;
          const pos = stage.getRelativePointerPosition();
          if (!pos) return;
          const x = pos.x;
          const y = pos.y;

          if (isWiring) {
            setMousePos({ x, y });
          } else if (activeNewBendPoint) {
            const anchors = nodes.flatMap(node =>
              node.pins.map(pin => getPinAbsPos(node, pin.id)).filter(Boolean) as { x: number; y: number }[]
            );
            const snapped = snapToRoutingGuides({ x, y }, anchors);
            setActiveNewBendPoint(prev => prev ? { ...prev, x: snapped.x, y: snapped.y } : null);
          } else {
            onCursorMove?.(x, y);
          }
        }}
        onMouseUp={(e) => {
          if (activeNewBendPoint) {
            addBendPoint(activeNewBendPoint.wireId, activeNewBendPoint.index, { x: activeNewBendPoint.x, y: activeNewBendPoint.y });
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
          {nodes.map(node => (
            <ComponentNode
              key={node.id} node={node}
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
            />
          ))}
        </Layer>

        {/* Wire layer (on top — wires should never be hidden under components) */}
        <Layer>
          {wires.map(w => (
            <WireShape key={w.id} wire={w} nodes={nodes} wires={wires}
              isSelected={w.id === selectedWireId}
              isDark={isDark}
              onSelect={() => selectWire(w.id)}
              onWireDragStart={handleWireDragStart}
              activeNewBendPoint={activeNewBendPoint}
            />
          ))}
          {isWiring && wiringFrom && (
            <WiringPreview fromPos={getWiringFromPos()} mousePos={mousePos} />
          )}
        </Layer>

        <Layer listening={false}>
          {Object.values(collaborators).map((user: any) => (
            <Group key={user.userId || user.displayName} x={Number(user.x || 0)} y={Number(user.y || 0)}>
              <Circle radius={5} fill={user.color || '#38bdf8'} shadowColor={user.color || '#38bdf8'} shadowBlur={6} />
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
