import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Group, Text, Circle, Line, Image as KonvaImage, Transformer } from 'react-konva';
import { Download } from 'lucide-react';
import { useCanvasStore, WIRE_COLORS } from '../../store/canvasStore';
import type { CanvasNode, Wire, PinPosition, WireBendPoint } from '../../types';
import { componentSvgs } from './componentSvgs';
import { getPinAbsPos, distToSegment } from '../../utils/wireRouting';

interface Props { width: number; height: number; onComponentInteraction?: (nodeId: string, event: 'press' | 'release') => void; }

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

// ── SVG Image loader hook ──
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

// ── Helper: get absolute pin position ──
// ── Wire rendering with multi-segment support ──
const WireShape = ({ wire, nodes, isSelected, onSelect, onWireDragStart, activeNewBendPoint }: {
  wire: Wire; nodes: CanvasNode[]; isSelected: boolean;
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

  // Calculate path points based on routing mode
  let allPoints: number[] = [];

  if (wire.routingMode === 'orthogonal') {
    const pts = [startPos, ...currentBendPoints, endPos];
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      allPoints.push(p1.x, p1.y);
      if (Math.abs(p1.x - p2.x) > 2 && Math.abs(p1.y - p2.y) > 2) {
        // Consistent H-then-V to avoid jitter
        allPoints.push(p2.x, p1.y);
      }
    }
    allPoints.push(endPos.x, endPos.y);
  } else {
    allPoints.push(startPos.x, startPos.y);
    for (const bp of currentBendPoints) {
      allPoints.push(bp.x, bp.y);
    }
    allPoints.push(endPos.x, endPos.y);
  }

  const handleMouseDown = (e: any) => {
    e.cancelBubble = true;
    onSelect();
    if (wire.routingMode === 'auto') return;

    // Use true distance-to-segment for accurate bend point insertion
    const stage = e.target.getStage();
    const ptr = stage.getPointerPosition();
    const viewport = useCanvasStore.getState().viewport;
    const x = (ptr.x - viewport.x) / viewport.scale;
    const y = (ptr.y - viewport.y) / viewport.scale;

    const allPts = [startPos, ...(wire.bendPoints || []), endPos];
    let bestIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < allPts.length - 1; i++) {
      const d = distToSegment(x, y, allPts[i], allPts[i + 1]);
      if (d < minD) { minD = d; bestIdx = i; }
    }
    onWireDragStart(wire.id, bestIdx, snap(x), snap(y));
  };

  return (
    <>
      {/* Main wire line */}
      <Line
        points={allPoints}
        stroke={isSelected ? '#ffffff' : wire.color}
        strokeWidth={isSelected ? 3 : 2.5}
        tension={wire.routingMode === 'curved' ? 0.4 : 0}
        lineCap="round"
        lineJoin="round"
        shadowColor={wire.color}
        shadowBlur={isSelected ? 10 : 3}
        shadowOpacity={0.5}
        hitStrokeWidth={16}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onMouseEnter={(e) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'crosshair';
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
          fill="rgba(255,255,255,0.6)"
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
        const newX = snap(e.target.x());
        const newY = snap(e.target.y());
        updateBendPoint(wireId, index, { x: newX, y: newY });
      }}
      onDragEnd={(e) => {
        e.target.x(snap(e.target.x()));
        e.target.y(snap(e.target.y()));
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
    points={[fromPos.x, fromPos.y, mousePos.x, mousePos.y]}
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

// ── Pin component ──
const PinDot = ({ pin, nodeId, isWiring, wiringFromNodeId, startWiring, finishWiring }: {
  pin: PinPosition; nodeId: string; isWiring: boolean; wiringFromNodeId: string | null;
  startWiring: (n: string, p: string) => void;
  finishWiring: (n: string, p: string) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const isValidTarget = isWiring && wiringFromNodeId !== nodeId;
  const pinColor = pin.type === 'power' ? '#ef4444'
    : pin.type === 'ground' ? '#555555'
      : '#cbd5e1';

  return (
    <Group>
      {/* Valid target highlight ring */}
      {isValidTarget && hovered && (
        <Circle x={pin.x} y={pin.y} radius={10} fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth={1.5} />
      )}
      {/* Pin dot */}
      <Circle
        x={pin.x} y={pin.y} radius={4}
        fill={hovered ? (isValidTarget ? '#22c55e' : '#60a5fa') : pinColor}
        stroke={hovered ? (isValidTarget ? '#22c55e' : '#60a5fa') : 'rgba(255,255,255,0.2)'}
        strokeWidth={1}
        hitStrokeWidth={16}
        onClick={(e) => {
          e.cancelBubble = true;
          if (isWiring) {
            if (wiringFromNodeId === nodeId) return; // Prevent self-connect
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
      {/* Pin label */}
      <Text text={pin.name} x={pin.x + 7} y={pin.y - 5} fontSize={7}
        fill="rgba(255,255,255,0.6)" fontFamily="JetBrains Mono"
        shadowColor="black" shadowBlur={3} listening={false}
      />
    </Group>
  );
};

// ── Component Node ──
const ComponentNode = ({ node, isSelected, onSelect, onChange, isWiring, wiringFromNodeId, startWiring, finishWiring, onInteraction }: {
  node: CanvasNode; isSelected: boolean; onSelect: () => void;
  onChange: (a: Partial<CanvasNode>) => void;
  isWiring: boolean; wiringFromNodeId: string | null;
  startWiring: (n: string, p: string) => void;
  finishWiring: (n: string, p: string) => void;
  onInteraction?: (nodeId: string, event: 'press' | 'release') => void;
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

  const isBlown = Boolean(node.properties?.isBlown);
  const isActive = !isBlown && (node.properties?.isLit || node.properties?.isSpinning || node.properties?.isBeeping);
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
        draggable={!node.properties?.locked}
        onClick={(e) => { e.cancelBubble = true; onSelect(); }}
        onTap={(e) => { e.cancelBubble = true; onSelect(); }}
        onMouseDown={() => { if (isButton && onInteraction) onInteraction(node.id, 'press'); }}
        onMouseUp={() => { if (isButton && onInteraction) onInteraction(node.id, 'release'); }}
        onMouseLeave={() => { if (isButton && onInteraction) onInteraction(node.id, 'release'); }}
        onTouchStart={() => { if (isButton && onInteraction) onInteraction(node.id, 'press'); }}
        onTouchEnd={() => { if (isButton && onInteraction) onInteraction(node.id, 'release'); }}
        onDragMove={(e) => {
          const sx = snap(e.target.x());
          const sy = snap(e.target.y());
          e.target.x(sx);
          e.target.y(sy);
          if (sx !== node.x || sy !== node.y) {
            onChange({ x: sx, y: sy });
          }
        }}
        onDragEnd={(e) => {
          onChange({ x: snap(e.target.x()), y: snap(e.target.y()) });
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
          onChange({ x: n.x(), y: n.y(), width: nw, height: nh, pins: newPins, rotation: n.rotation() });
        }}
      >
        {/* Active glow */}
        {isActive && (
          <Rect x={-4} y={-4} width={node.width + 8} height={node.height + 8}
            cornerRadius={8} fill="rgba(34,197,94,0.15)"
            shadowColor="#22c55e" shadowBlur={16} listening={false}
          />
        )}

        {/* Dynamic color for LEDs */}
        {isActive && node.type.includes('LED') && (
          <Circle
            x={node.width / 2} y={node.height / 2 - 10} radius={node.width / 3}
            fill={(node.properties?.ledColor as string) || '#ef4444'}
            opacity={0.8} shadowColor={(node.properties?.ledColor as string) || '#ef4444'} shadowBlur={15}
          />
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

        {/* Component image or fallback */}
        {image ? (
          <KonvaImage image={image} width={node.width} height={node.height}
            shadowColor="rgba(0,0,0,0.4)" shadowBlur={6} shadowOffsetY={2}
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

        {isServo && (
          <Group x={node.width - 15} y={node.height / 2} rotation={Number(node.properties?.servoAngle || 0) - 90} listening={false}>
            <Rect x={-4} y={-22} width={8} height={44} cornerRadius={4} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} />
            <Circle x={0} y={0} radius={5} fill="#334155" />
          </Group>
        )}

        {/* Pins */}
        {node.pins?.map(pin => (
          <PinDot key={pin.id} pin={pin} nodeId={node.id}
            isWiring={isWiring} wiringFromNodeId={wiringFromNodeId}
            startWiring={startWiring} finishWiring={finishWiring}
          />
        ))}

        {/* Lock indicator */}
        {node.properties?.locked && (
          <Text text="🔒" x={node.width - 16} y={2} fontSize={10} listening={false} />
        )}
      </Group>

      {isSelected && !node.properties?.locked && (
        <Transformer ref={trRef} flipEnabled={false} rotateEnabled={true}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          boundBoxFunc={(_, nb) => (nb.width < 20 || nb.height < 20) ? _ : nb}
        />
      )}
    </>
  );
};

// ── Grid Layer (memoized) ──
const GridDots = ({ width, height, scale }: { width: number; height: number; scale: number }) => {
  const dots = useMemo(() => {
    const result: React.ReactNode[] = [];
    const cols = Math.ceil(width / scale / GRID) + 20;
    const rows = Math.ceil(height / scale / GRID) + 20;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        result.push(
          <Circle key={`g${i}_${j}`} x={i * GRID} y={j * GRID}
            radius={0.6} fill="rgba(255,255,255,0.06)" listening={false}
          />
        );
      }
    }
    return result;
  }, [Math.ceil(width / scale / GRID), Math.ceil(height / scale / GRID)]);
  return <>{dots}</>;
};

// ── Wire Color Picker Toolbar ──
const WireToolbar = () => {
  const { wiringColor, setWiringColor, wiringMode, setWiringMode, isWiring } = useCanvasStore();

  if (!isWiring) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 glass rounded-xl px-3 py-2 flex items-center gap-3 border border-white/10">
      <span className="text-[10px] text-surface-400 font-medium">Wire Color:</span>
      <div className="flex gap-1">
        {WIRE_COLORS.map(c => (
          <button key={c} onClick={() => setWiringColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${wiringColor === c ? 'border-white scale-125' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="h-4 w-px bg-white/10" />
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
        className="text-[10px] px-2 py-1 rounded bg-white/5 text-surface-300 hover:text-white hover:bg-white/10">
        {wiringMode === 'straight' ? 'Straight' : wiringMode === 'orthogonal' ? 'Orthogonal' : wiringMode === 'auto' ? 'Auto-route' : 'Curved'}
      </button>
      <span className="text-[9px] text-surface-500 ml-1">Click a pin to connect • ESC to cancel</span>
    </div>
  );
};

// ── Main Canvas ──
export default function CircuitCanvas({ width, height, onComponentInteraction }: Props) {
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
    const mp = { x: (ptr.x - viewport.x) / old, y: (ptr.y - viewport.y) / old };
    const dir = e.evt.deltaY > 0 ? -1 : 1;
    const ns = Math.max(0.15, Math.min(4, dir > 0 ? old * 1.08 : old / 1.08));
    setViewport({ scale: ns, x: ptr.x - mp.x * ns, y: ptr.y - mp.y * ns });
  }, [viewport, setViewport]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { selectNode(null); selectWire(null); cancelWiring(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey) {
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
          const ptr = stage.getPointerPosition();
          if (!ptr) return;
          const x = (ptr.x - viewport.x) / viewport.scale;
          const y = (ptr.y - viewport.y) / viewport.scale;

          if (isWiring) {
            setMousePos({ x, y });
          } else if (activeNewBendPoint) {
            setActiveNewBendPoint(prev => prev ? { ...prev, x: snap(x), y: snap(y) } : null);
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
          <GridDots width={width} height={height} scale={viewport.scale} />
        </Layer>

        {/* Component layer (below wires) */}
        <Layer>
          {nodes.map(node => (
            <ComponentNode
              key={node.id} node={node}
              isSelected={node.id === selectedNodeId}
              onSelect={() => selectNode(node.id)}
              onChange={(a) => updateNode(node.id, a)}
              isWiring={isWiring}
              wiringFromNodeId={wiringFrom?.nodeId || null}
              startWiring={startWiring} finishWiring={finishWiring}
              onInteraction={onComponentInteraction}
            />
          ))}
        </Layer>

        {/* Wire layer (on top — wires should never be hidden under components) */}
        <Layer>
          {wires.map(w => (
            <WireShape key={w.id} wire={w} nodes={nodes}
              isSelected={w.id === selectedWireId}
              onSelect={() => selectWire(w.id)}
              onWireDragStart={handleWireDragStart}
              activeNewBendPoint={activeNewBendPoint}
            />
          ))}
          {isWiring && wiringFrom && (
            <WiringPreview fromPos={getWiringFromPos()} mousePos={mousePos} />
          )}
        </Layer>
      </Stage>

      {/* Wire toolbar overlay (HTML, not canvas) */}
      <WireToolbar />

      <button
        onClick={handleExportImage}
        className="absolute top-3 left-3 z-20 glass px-2.5 py-1.5 rounded-lg text-[10px] text-surface-300 hover:text-white border border-white/10 flex items-center gap-1.5"
        title="Export circuit PNG"
      >
        <Download className="w-3.5 h-3.5" />
        PNG
      </button>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 z-20 glass px-2 py-1 rounded-lg text-[9px] text-surface-400 font-mono">
        {Math.round(viewport.scale * 100)}%
      </div>
    </div>
  );
}
