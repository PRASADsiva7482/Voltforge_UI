import { useRef, useEffect, useMemo, useState, useCallback, memo } from 'react';
import { Group, Rect, Text, Circle, Image as KonvaImage, Transformer, Line, Arc } from 'react-konva';
import Konva from 'konva';
import { useTranslation } from 'react-i18next';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCanvasStore } from '../../../store/canvasStore';
import { getPinAbsPos, snapToRoutingGuides } from '../../../utils/wireRouting';
import { componentSvgs } from '../componentSvgs';
import PinDot from './PinDot';
import type { CanvasNode } from '../canvasTypes';
import { AudioEngine } from '../../simulator/AudioEngine';
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
  BUZZER_WAVE_RINGS,
  BUZZER_WAVE_MAX_RADIUS,
  BUZZER_WAVE_COLOR,
  BUZZER_WAVE_SPEED,
  BUTTON_PRESS_DEPTH,
  BUTTON_SHADOW_NORMAL,
  BUTTON_SHADOW_PRESSED,
  RELAY_COIL_GLOW_COLOR,
  SENSOR_OVERLAY_FONT,
  SENSOR_OVERLAY_FONT_SIZE,
  SENSOR_OVERLAY_BG,
  SENSOR_OVERLAY_TEXT,
  SENSOR_OVERLAY_LABEL,
  SENSOR_OVERLAY_RADIUS,
  SENSOR_BAR_HEIGHT,
  SENSOR_BAR_BG,
  TEMP_HOT_COLOR,
  TEMP_COLD_COLOR,
  TEMP_WARM_COLOR,
  ULTRASONIC_WAVE_COLOR,
  PIR_ACTIVE_COLOR,
  PIR_IDLE_COLOR,
  LDR_SUN_COLOR,
  SOIL_WET_COLOR,
  SOIL_DRY_COLOR,
  IMU_TILT_COLOR,
  MOTOR_BLUR_RPM_THRESHOLD,
  MOTOR_VIBRATE_PX,
  SERVO_ARC_COLOR,
  SERVO_ANGLE_TEXT_COLOR,
  BOARD_TX_COLOR,
  BOARD_RX_COLOR,
} from '../canvasConstants';

// ── Global SVG image cache ── prevents re-parsing SVG data URIs on every render
const svgImageCache = new Map<string, HTMLImageElement>();

const useImage = (url: string) => {
  const [image, setImage] = useState<HTMLImageElement | undefined>(
    () => svgImageCache.get(url) // initialize from cache synchronously
  );
  useEffect(() => {
    if (!url) return;
    const cached = svgImageCache.get(url);
    if (cached) {
      setImage(cached);
      return;
    }
    const img = new window.Image();
    img.src = url.trim().startsWith('<svg')
      ? `data:image/svg+xml;utf8,${encodeURIComponent(url)}`
      : url;
    img.onload = () => {
      svgImageCache.set(url, img);
      setImage(img);
    };
  }, [url]);
  return image;
};

const getBoardLedPositions = (type: string, width: number, height: number) => {
  if (type.startsWith('ARDUINO_MEGA')) {
    return {
      pwr: { x: 30, y: 20 },
      l: { x: 30, y: 35 }
    };
  }
  if (type.startsWith('ESP32') || type.startsWith('ESP8266')) {
    return {
      pwr: { x: 20, y: 20 },
      l: { x: 20, y: 35 }
    };
  }
  // Default (Uno, Nano, etc.)
  return {
    pwr: { x: 35, y: 30 },
    l: { x: 35, y: 45 }
  };
};

const BuzzerOverlay = memo(({ isSimulating, isBeeping, frequency, width, height }: {
  isSimulating: boolean;
  isBeeping: boolean;
  frequency: number;
  width: number;
  height: number;
}) => {
  const [animTick, setAnimTick] = useState(0);

  useEffect(() => {
    if (!isSimulating || !isBeeping) return;
    let frameId: number;
    let startTime = performance.now();
    const tick = () => {
      setAnimTick(Math.floor((performance.now() - startTime) / 50));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isSimulating, isBeeping]);

  const cx = width / 2;
  const cy = height / 2;
  const vibrateY = (isSimulating && isBeeping) ? Math.sin(animTick * 0.8) * 1.5 : 0;

  return (
    <Group listening={false}>
      {/* Speaker cone body */}
      <Circle
        x={cx} y={cy + vibrateY}
        radius={8}
        fill={isBeeping ? '#475569' : '#334155'}
        stroke={isBeeping ? '#94a3b8' : '#4b5563'}
        strokeWidth={1}
      />
      <Circle
        x={cx} y={cy + vibrateY}
        radius={3}
        fill={isBeeping ? '#cbd5e1' : '#64748b'}
      />
      {/* Animated expanding sound wave rings */}
      {isSimulating && isBeeping && Array.from({ length: BUZZER_WAVE_RINGS }).map((_, i) => {
        const phase = ((animTick * 3 + i * (BUZZER_WAVE_SPEED / BUZZER_WAVE_RINGS / 50)) % (BUZZER_WAVE_SPEED / 50)) / (BUZZER_WAVE_SPEED / 50);
        const radius = 12 + phase * BUZZER_WAVE_MAX_RADIUS;
        const opacity = Math.max(0, 0.5 * (1 - phase));
        return (
          <Circle
            key={`bz_wave_${i}`}
            x={cx} y={cy}
            radius={radius}
            fill="transparent"
            stroke={BUZZER_WAVE_COLOR}
            strokeWidth={1.2 * (1 - phase * 0.5)}
            opacity={opacity}
          />
        );
      })}
      {/* Frequency display */}
      {isSimulating && isBeeping && (
        <Text
          text={`♪ ${frequency}Hz`}
          x={0} y={height + 2}
          width={width} align="center"
          fontSize={7} fontFamily="JetBrains Mono" fontStyle="700"
          fill={ACTIVE_GLOW_COLOR}
          shadowColor={ACTIVE_GLOW_COLOR} shadowBlur={4}
        />
      )}
    </Group>
  );
});

const UltrasonicOverlay = memo(({ isSimulating, distance, width, height }: {
  isSimulating: boolean;
  distance: number;
  width: number;
  height: number;
}) => {
  const [animTick, setAnimTick] = useState(0);

  useEffect(() => {
    if (!isSimulating) return;
    let frameId: number;
    let startTime = performance.now();
    const tick = () => {
      setAnimTick(Math.floor((performance.now() - startTime) / 50));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isSimulating]);

  const wavePhase = (animTick % 20) / 20;

  return (
    <Group listening={false}>
      {/* Animated wave arcs from transducers */}
      {[0, 1, 2].map(i => {
        const phase = (wavePhase + i * 0.33) % 1;
        const arcR = 8 + phase * 18;
        return (
          <Circle key={`us_wave_${i}`}
            x={width / 2} y={10}
            radius={arcR}
            fill="transparent" stroke={ULTRASONIC_WAVE_COLOR}
            strokeWidth={1.2 * (1 - phase)}
            opacity={0.5 * (1 - phase)}
          />
        );
      })}
      {/* Distance reading overlay */}
      <Rect x={4} y={height - 18} width={width - 8} height={14}
        cornerRadius={SENSOR_OVERLAY_RADIUS} fill={SENSOR_OVERLAY_BG} />
      <Text text={`📏 ${distance.toFixed(0)} cm`}
        x={6} y={height - 16} fontSize={SENSOR_OVERLAY_FONT_SIZE}
        fontFamily={SENSOR_OVERLAY_FONT} fontStyle="700" fill={ULTRASONIC_WAVE_COLOR} />
    </Group>
  );
});

const PirOverlay = memo(({ isSimulating, motionDetected, width, height }: {
  isSimulating: boolean;
  motionDetected: boolean;
  width: number;
  height: number;
}) => {
  const [animTick, setAnimTick] = useState(0);

  useEffect(() => {
    if (!isSimulating) return;
    let frameId: number;
    let startTime = performance.now();
    const tick = () => {
      setAnimTick(Math.floor((performance.now() - startTime) / 50));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isSimulating]);

  const sweepAngle = (animTick * 6) % 360;
  const cx = width / 2;
  const cy = height / 2 - 5;

  return (
    <Group listening={false}>
      {/* Radar sweep line */}
      <Group x={cx} y={cy} rotation={sweepAngle}>
        <Line points={[0, 0, 0, -18]}
          stroke={motionDetected ? PIR_ACTIVE_COLOR : PIR_IDLE_COLOR}
          strokeWidth={1.5} opacity={0.6} />
      </Group>
      {/* Detection range circle */}
      <Circle x={cx} y={cy} radius={18}
        fill="transparent" stroke={motionDetected ? PIR_ACTIVE_COLOR : PIR_IDLE_COLOR}
        strokeWidth={1} opacity={0.3} dash={[3, 3]} />
      {/* Motion alert flash */}
      {motionDetected && (
        <>
          <Circle x={cx} y={cy} radius={22}
            fill={PIR_ACTIVE_COLOR} opacity={0.12 + Math.sin(animTick * 0.4) * 0.08}
            shadowColor={PIR_ACTIVE_COLOR} shadowBlur={12} />
          <Text text="🚨 MOTION"
            x={0} y={height + 2} width={width} align="center"
            fontSize={7} fontFamily={SENSOR_OVERLAY_FONT} fontStyle="700"
            fill={PIR_ACTIVE_COLOR} />
        </>
      )}
    </Group>
  );
});

const DcMotorOverlay = memo(({ isActive, rpm, width, height }: {
  isActive: boolean;
  rpm: number;
  width: number;
  height: number;
}) => {
  const [animTick, setAnimTick] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    let frameId: number;
    let startTime = performance.now();
    const tick = () => {
      setAnimTick(Math.floor((performance.now() - startTime) / 50));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isActive]);

  const isHighRpm = rpm > MOTOR_BLUR_RPM_THRESHOLD;
  const vibrateX = isActive ? Math.sin(animTick * 2.3) * MOTOR_VIBRATE_PX : 0;
  const vibrateY = isActive ? Math.cos(animTick * 3.1) * MOTOR_VIBRATE_PX : 0;

  return (
    <Group listening={false}>
      {/* Motion blur circle at high RPM */}
      {isActive && isHighRpm && (
        <Circle x={30 + vibrateX} y={25 + vibrateY} radius={26}
          fill="rgba(239,68,68,0.08)"
          stroke="rgba(239,68,68,0.15)"
          strokeWidth={1}
          shadowColor="#ef4444" shadowBlur={8}
        />
      )}
      {/* RPM readout */}
      <Rect x={2} y={height - 12} width={width - 4} height={10}
        cornerRadius={2} fill={SENSOR_OVERLAY_BG} />
      <Text text={`⚙ ${rpm} RPM`}
        x={4} y={height - 11} fontSize={6}
        fontFamily={SENSOR_OVERLAY_FONT} fontStyle="700"
        fill={isHighRpm ? '#ef4444' : ACTIVE_GLOW_COLOR} />
    </Group>
  );
});

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
  isProbeMode?: boolean;
  isSimulating?: boolean;
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
  isProbeMode,
  isSimulating,
}: ComponentNodeProps) => {
  const { t } = useTranslation();
  const shapeRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const dcMotorShaftRef = useRef<Konva.Group>(null);
  const bldcPropellerRef = useRef<Konva.Group>(null);
  // Cached snap anchors: computed once on DragStart, reused every onDragMove frame
  const snapAnchorsRef = useRef<{ x: number; y: number }[]>([]);


  // Refs for TX/RX blink — we toggle Konva node opacity directly via refs
  const txLedRef = useRef<Konva.Circle>(null);
  const rxLedRef = useRef<Konva.Circle>(null);
  const txTextRef = useRef<Konva.Text>(null);
  const rxTextRef = useRef<Konva.Text>(null);
  const prevBeepingRef = useRef(false);
  const prevPressedRef = useRef(false);
  const prevClosedRef = useRef<boolean | undefined>(undefined);
  const prevRelayActiveRef = useRef(false);

  const handleDialMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    e.cancelBubble = true; // Stop dragging the component node itself!

    const stage = e.target.getStage();
    if (!stage) return;

    const handleMouseMove = () => {
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      const rad = (node.rotation || 0) * Math.PI / 180;
      const canvasCenterX = node.x + 25 * Math.cos(rad) - 25 * Math.sin(rad);
      const canvasCenterY = node.y + 25 * Math.sin(rad) + 25 * Math.cos(rad);

      const dx = pos.x - canvasCenterX;
      const dy = pos.y - canvasCenterY;

      let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI) - (node.rotation || 0);
      let normAngle = (angleDeg + 360) % 360;
      let pct = 50;

      if (normAngle >= 135) {
        pct = ((normAngle - 135) / 270) * 100;
      } else if (normAngle <= 45) {
        pct = ((normAngle + 225) / 270) * 100;
      } else {
        pct = normAngle <= 90 ? 100 : 0;
      }

      onChange({
        properties: {
          ...node.properties,
          position: Math.round(pct),
        },
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleServoHornMouseDown = (e: KonvaEventObject<any>) => {
    if (readOnly || isSimulating) return;
    e.cancelBubble = true;

    const stage = e.target.getStage();
    if (!stage) return;

    const handleMouseMove = () => {
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      const rad = (node.rotation || 0) * Math.PI / 180;
      const localCenterX = node.width - 15;
      const localCenterY = node.height / 2;

      const canvasCenterX = node.x + localCenterX * Math.cos(rad) - localCenterY * Math.sin(rad);
      const canvasCenterY = node.y + localCenterX * Math.sin(rad) + localCenterY * Math.cos(rad);

      const dx = pos.x - canvasCenterX;
      const dy = pos.y - canvasCenterY;

      let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI) - (node.rotation || 0) + 90;
      let normAngle = (angleDeg + 360) % 360;
      
      let angle = Math.round(normAngle);
      if (angle > 180) {
        angle = angle > 270 ? 0 : 180;
      }

      onChange({
        properties: {
          ...node.properties,
          servoAngle: angle,
        },
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    if (readOnly) return;
    e.cancelBubble = true;
    e.evt.preventDefault();
    const delta = e.evt.deltaY > 0 ? -5 : 5;
    const currentPos = Number(node.properties?.position !== undefined ? node.properties.position : 50);
    const newPos = Math.max(0, Math.min(100, currentPos + delta));
    onChange({
      properties: {
        ...node.properties,
        position: newPos,
      },
    });
  };

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

  const isBlown = Boolean(node.properties?.isBlown);
  const isActive =
    Boolean(isSimulating) &&
    !isBlown &&
    (node.properties?.isLit ||
      node.properties?.isSpinning ||
      node.properties?.isBeeping ||
      node.properties?.isActive);
  const isButton = node.type === 'PUSH_BUTTON' || node.type === 'BUTTON';
  const isSwitch = node.type === 'SWITCH_SPST';
  const isBoard = node.type.startsWith('ARDUINO') || node.type.startsWith('ESP') || node.type.startsWith('RASPBERRY');
  const isServo = node.type === 'SERVO_MOTOR' || node.type === 'MOTOR_SERVO';
  const isDcMotor = node.type === 'MOTOR_DC';
  const isStepper = node.type === 'MOTOR_STEPPER' || node.type === 'STEPPER_MOTOR';
  const is7Seg = node.type === 'DISPLAY_7SEG';
  const isBuzzer = node.type === 'BUZZER';
  const isRelay = node.type === 'RELAY_SINGLE' || node.type === 'RELAY_2CH' || node.type === 'RELAY_4CH' || node.type === 'RELAY_SPDT';
  const isPressed = Boolean(node.properties?.isPressed);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  useEffect(() => {
    if (!isActive) return;
    let animId: number;
    let angle = 0;
    const tickAnim = () => {
      let needsDraw = false;
      if (isDcMotor && dcMotorShaftRef.current) {
        const rpm = Number(node.properties?.rpm) || 3000;
        const delta = (rpm / 60) * 360 * (16.7 / 1000);
        angle = (angle + delta) % 360;
        dcMotorShaftRef.current.rotation(angle);
        needsDraw = true;
      }
      if (node.type === 'MOTOR_BLDC' && bldcPropellerRef.current) {
        const rpm = Number(node.properties?.bldcRpm) || 0;
        const delta = (rpm / 60) * 360 * (16.7 / 1000);
        angle = (angle + delta) % 360;
        bldcPropellerRef.current.rotation(angle);
        needsDraw = true;
      }
      if (needsDraw) {
        shapeRef.current?.getLayer()?.batchDraw();
      }
      animId = requestAnimationFrame(tickAnim);
    };
    animId = requestAnimationFrame(tickAnim);
    return () => cancelAnimationFrame(animId);
  }, [isActive, isDcMotor, node.type, node.properties?.rpm, node.properties?.bldcRpm]);

  // ── Board TX/RX blink simulation (ref-based, no React state) ──
  useEffect(() => {
    if (!isSimulating || !isBoard) return;
    const iv = setInterval(() => {
      if (Math.random() > 0.6) {
        txLedRef.current?.fill(BOARD_TX_COLOR);
        txLedRef.current?.stroke('#fca5a5');
        txLedRef.current?.shadowBlur(6);
        txTextRef.current?.fill(BOARD_TX_COLOR);
        setTimeout(() => {
          txLedRef.current?.fill('#374151');
          txLedRef.current?.stroke('#4b5563');
          txLedRef.current?.shadowBlur(0);
          txTextRef.current?.fill('#4b5563');
          shapeRef.current?.getLayer()?.batchDraw();
        }, 80);
      }
      if (Math.random() > 0.7) {
        rxLedRef.current?.fill(BOARD_RX_COLOR);
        rxLedRef.current?.stroke('#86efac');
        rxLedRef.current?.shadowBlur(6);
        rxTextRef.current?.fill(BOARD_RX_COLOR);
        setTimeout(() => {
          rxLedRef.current?.fill('#374151');
          rxLedRef.current?.stroke('#4b5563');
          rxLedRef.current?.shadowBlur(0);
          rxTextRef.current?.fill('#4b5563');
          shapeRef.current?.getLayer()?.batchDraw();
        }, 80);
      }
      shapeRef.current?.getLayer()?.batchDraw();
    }, 300);
    return () => clearInterval(iv);
  }, [isSimulating, isBoard]);

  // ── Audio triggers for buzzer, buttons, switches, relays ──
  useEffect(() => {
    const currentBeeping = Boolean(isSimulating && node.properties?.isBeeping);
    if (currentBeeping && !prevBeepingRef.current) {
      const freq = Number(node.properties?.frequency) || 1000;
      AudioEngine.playTone(freq, 'square', 0.08);
    } else if (!currentBeeping && prevBeepingRef.current) {
      AudioEngine.stopTone();
    }
    prevBeepingRef.current = currentBeeping;
  }, [isSimulating, node.properties?.isBeeping, node.properties?.frequency]);

  useEffect(() => {
    const currentPressed = Boolean(node.properties?.isPressed);
    if (currentPressed && !prevPressedRef.current && isButton) {
      AudioEngine.playClick('button');
    }
    prevPressedRef.current = currentPressed;
  }, [node.properties?.isPressed, isButton]);

  useEffect(() => {
    const currentClosed = Boolean(node.properties?.isClosed);
    if (isSwitch && prevClosedRef.current !== undefined && currentClosed !== prevClosedRef.current) {
      AudioEngine.playClick('switch');
    }
    prevClosedRef.current = currentClosed;
  }, [node.properties?.isClosed, isSwitch]);

  useEffect(() => {
    const currentActive = Boolean(node.properties?.isActive);
    if (isRelay && currentActive && !prevRelayActiveRef.current) {
      AudioEngine.playClick('relay');
    }
    prevRelayActiveRef.current = currentActive;
  }, [node.properties?.isActive, isRelay]);


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
              text={t("BLOWN")}
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

        {/* Potentiometer dial knob overlay */}
        {node.type === 'POTENTIOMETER' && (() => {
          const position = Number(node.properties?.position !== undefined ? node.properties.position : 50);
          const displayAngle = 135 + (position / 100) * 270;
          return (
            <Group
              x={25}
              y={25}
              onWheel={handleWheel}
              onMouseDown={handleDialMouseDown}
            >
              {/* Dial Background Shadow */}
              <Circle radius={16} fill="rgba(0,0,0,0.15)" y={1} />
              {/* Dial Body - Silver Metallic Circle */}
              <Circle
                radius={15}
                fillLinearGradientStartPoint={{ x: -10, y: -10 }}
                fillLinearGradientEndPoint={{ x: 10, y: 10 }}
                fillLinearGradientColorStops={[
                  0, '#f1f5f9',
                  0.5, '#cbd5e1',
                  1, '#64748b'
                ]}
                stroke="#475569"
                strokeWidth={1.5}
              />
              {/* Inner concentric ring */}
              <Circle radius={11} stroke="#94a3b8" strokeWidth={0.5} dash={[2, 2]} />
              {/* Pointer Tick Line */}
              <Group rotation={displayAngle}>
                <Line points={[0, 0, 13, 0]} stroke="#f97316" strokeWidth={2} lineCap="round" />
                <Circle x={10} y={0} radius={2} fill="#ff9800" />
              </Group>
              {/* Center Screw Cap */}
              <Circle
                radius={4}
                fillLinearGradientStartPoint={{ x: -2, y: -2 }}
                fillLinearGradientEndPoint={{ x: 2, y: 2 }}
                fillLinearGradientColorStops={[
                  0, '#cbd5e1',
                  1, '#475569'
                ]}
              />
            </Group>
          );
        })()}

        {node.type === 'POTENTIOMETER' && (
          <Text
            text={`${Math.round(Number(node.properties?.position !== undefined ? node.properties.position : 50))}%`}
            x={0}
            y={43}
            width={50}
            align="center"
            fontSize={8}
            fontFamily="JetBrains Mono"
            fontStyle="700"
            fill="#f97316"
            listening={false}
          />
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

        {/* Ammeter — current reading overlay */}
        {node.type === 'AMMETER' && (
          <Text
            text={(node.properties?.displayValue as string) || '0.00 mA'}
            x={14}
            y={27}
            width={node.width - 28}
            align="center"
            fontSize={Math.max(12, Math.min(20, node.width / 6))}
            fontFamily="JetBrains Mono"
            fontStyle="700"
            fill="#38bdf8"
            listening={false}
          />
        )}

        {/* Oscilloscope — mini waveform preview and display text */}
        {node.type === 'OSCILLOSCOPE' && (
          <>
            <Text
              text={(node.properties?.displayValue as string) || 'SCOPE'}
              x={14}
              y={12}
              width={node.width - 28}
              align="center"
              fontSize={Math.max(8, Math.min(12, node.width / 10))}
              fontFamily="JetBrains Mono"
              fontStyle="700"
              fill="#22c55e"
              listening={false}
            />
          </>
        )}

        {/* LCD / I2C Display — live text overlay */}
        {(node.type === 'DISPLAY_LCD_I2C' || node.type === 'LCD_16X2') &&
          (() => {
            const line1 = (node.properties?.lcdLine1 as string) || '';
            const line2 = (node.properties?.lcdLine2 as string) || '';
            const hasText = line1.trim() || line2.trim();
            // Check if board is powered
            const boardNode = useCanvasStore.getState().nodes.find(n => n.type.startsWith('ARDUINO') || n.type.startsWith('ESP') || n.type.startsWith('RASPBERRY'));
            const isBoardPwr = boardNode ? Boolean(boardNode.properties?.boardPowered) : false;
            const backlight = isBoardPwr && node.properties?.lcdBacklight !== false;
            const screen = node.type === 'DISPLAY_LCD_I2C' ? LCD_I2C_SCREEN : LCD_16X2_SCREEN;
            const fontSize = Math.max(7, Math.min(11, screen.width / 18));
            const lineH = screen.height / 2;

            const bgFill = backlight ? LCD_BACKLIGHT_ON : '#1e293b';
            const textFill = backlight ? LCD_TEXT_BACKLIGHT_ON : 'transparent';

            return (
              <>
                <Rect
                  x={screen.x}
                  y={screen.y}
                  width={screen.width}
                  height={screen.height}
                  cornerRadius={2}
                  fill={bgFill}
                  stroke={backlight ? '#22c55e' : '#475569'}
                  strokeWidth={0.5}
                  opacity={backlight ? 0.95 : 0.7}
                  listening={false}
                />
                {backlight && (
                  <>
                    <Text
                      x={screen.x + 3}
                      y={screen.y + (lineH - fontSize) / 2}
                      width={screen.width - 6}
                      text={line1 || (hasText ? '' : 'LCD 16x2')}
                      fontSize={fontSize}
                      fontFamily="'JetBrains Mono', 'Courier New', monospace"
                      fontStyle="700"
                      fill={textFill}
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
                      fill={textFill}
                      listening={false}
                    />
                  </>
                )}
              </>
            );
          })()}

        {/* OLED Display — live text overlay */}
        {(node.type === 'DISPLAY_OLED' || node.type === 'OLED_DISPLAY') &&
          (() => {
            const line1 = (node.properties?.lcdLine1 as string) || '';
            const line2 = (node.properties?.lcdLine2 as string) || '';
            const hasText = line1.trim() || line2.trim();
            // Check if board is powered
            const boardNode = useCanvasStore.getState().nodes.find(n => n.type.startsWith('ARDUINO') || n.type.startsWith('ESP') || n.type.startsWith('RASPBERRY'));
            const isBoardPwr = boardNode ? Boolean(boardNode.properties?.boardPowered) : false;
            const backlight = isBoardPwr && node.properties?.lcdBacklight !== false;
            const fontSize = Math.max(7, Math.min(9, OLED_SCREEN.width / 12));
            const lineH = OLED_SCREEN.height / 2;

            const bgFill = backlight ? OLED_BG : '#1e293b';
            const textFill = backlight ? OLED_TEXT_COLOR : 'transparent';

            return (
              <>
                <Rect
                  x={OLED_SCREEN.x}
                  y={OLED_SCREEN.y}
                  width={OLED_SCREEN.width}
                  height={OLED_SCREEN.height}
                  cornerRadius={2}
                  fill={bgFill}
                  opacity={backlight ? 0.95 : 0.7}
                  listening={false}
                />
                {backlight && (
                  <>
                    <Text
                      x={OLED_SCREEN.x + 3}
                      y={OLED_SCREEN.y + (lineH - fontSize) / 2}
                      width={OLED_SCREEN.width - 6}
                      text={line1 || (hasText ? '' : 'OLED 128x64')}
                      fontSize={fontSize}
                      fontFamily="'JetBrains Mono', 'Courier New', monospace"
                      fontStyle="700"
                      fill={textFill}
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
                      fill={textFill}
                      listening={false}
                    />
                  </>
                )}
              </>
            );
          })()}

        {isServo && (
          <Group
            x={node.width - 15}
            y={node.height / 2}
            rotation={Number(node.properties?.servoAngle || 0) - 90}
            listening={!isSimulating && !readOnly}
            onMouseDown={handleServoHornMouseDown}
            onTouchStart={handleServoHornMouseDown}
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
            const isMotorSpinning = Boolean(isSimulating) && rpm > 0;

            return (
              <>
                <Group
                  ref={bldcPropellerRef}
                  x={node.width / 2}
                  y={MOTOR_BELL_CENTER_Y}
                  rotation={rotation}
                  listening={false}
                >
                  {/* Four propeller blades - vibrant orange and white tips */}
                  <Group rotation={0}>
                    <Rect x={-3} y={-22} width={6} height={18} cornerRadius={3}
                      fill={isMotorSpinning ? '#f97316' : '#6b7280'} opacity={isMotorSpinning ? 0.95 : 0.4} />
                    <Rect x={-3} y={-22} width={6} height={4} cornerRadius={1.5} fill="#ffffff" opacity={isMotorSpinning ? 1 : 0.4} />
                  </Group>
                  <Group rotation={90}>
                    <Rect x={-3} y={-22} width={6} height={18} cornerRadius={3}
                      fill={isMotorSpinning ? '#f97316' : '#6b7280'} opacity={isMotorSpinning ? 0.95 : 0.4} />
                    <Rect x={-3} y={-22} width={6} height={4} cornerRadius={1.5} fill="#ffffff" opacity={isMotorSpinning ? 1 : 0.4} />
                  </Group>
                  <Group rotation={180}>
                    <Rect x={-3} y={-22} width={6} height={18} cornerRadius={3}
                      fill={isMotorSpinning ? '#f97316' : '#6b7280'} opacity={isMotorSpinning ? 0.95 : 0.4} />
                    <Rect x={-3} y={-22} width={6} height={4} cornerRadius={1.5} fill="#ffffff" opacity={isMotorSpinning ? 1 : 0.4} />
                  </Group>
                  <Group rotation={270}>
                    <Rect x={-3} y={-22} width={6} height={18} cornerRadius={3}
                      fill={isMotorSpinning ? '#f97316' : '#6b7280'} opacity={isMotorSpinning ? 0.95 : 0.4} />
                    <Rect x={-3} y={-22} width={6} height={4} cornerRadius={1.5} fill="#ffffff" opacity={isMotorSpinning ? 1 : 0.4} />
                  </Group>
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
                  <>
                    <Circle
                      x={node.width / 2} y={MOTOR_BELL_CENTER_Y} radius={MOTOR_SPIN_GLOW_RADIUS}
                      fill="transparent" stroke={ACTIVE_GLOW_COLOR} strokeWidth={1.5}
                      opacity={Math.min(0.6, rpm / 12000)}
                      shadowColor={ACTIVE_GLOW_COLOR} shadowBlur={12} shadowOpacity={0.4} listening={false}
                    />
                    <Circle
                      x={node.width / 2} y={MOTOR_BELL_CENTER_Y} radius={26}
                      stroke="#f97316" strokeWidth={1} opacity={0.5} dash={[6, 10]}
                      listening={false}
                    />
                  </>
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

        {/* DC Motor — animated rotating propeller */}
        {isDcMotor && (() => {
          const tick = Number(node.properties?.motorTick) || 0;
          const isSpinning = isActive;
          return (
            <>
              {isSpinning && (
                <>
                  <Circle
                    x={30} y={25} radius={26}
                    stroke={ACTIVE_GLOW_COLOR} strokeWidth={1.5}
                    opacity={0.4} dash={[8, 12]}
                    listening={false}
                  />
                  <Circle
                    x={30} y={25} radius={20}
                    stroke="rgba(239,68,68,0.25)" strokeWidth={1}
                    opacity={0.3} dash={[4, 6]}
                    listening={false}
                  />
                </>
              )}
              <Group ref={dcMotorShaftRef} x={30} y={25} rotation={tick} listening={false}>
                {/* Blade 1 */}
                <Group rotation={0}>
                  <Rect x={-4} y={-25} width={8} height={25} cornerRadius={3} fill="#ef4444" opacity={isActive ? 1 : 0.4} />
                  {/* White tip */}
                  <Rect x={-4} y={-25} width={8} height={5} cornerRadius={2} fill="#ffffff" opacity={isActive ? 1 : 0.4} />
                  {/* Contrasting stripe */}
                  <Rect x={-4} y={-14} width={8} height={3} fill="#1e293b" opacity={isActive ? 1 : 0.4} />
                  <Circle x={0} y={-8} radius={2} fill="#ffffff" opacity={isActive ? 0.9 : 0.5} />
                </Group>
                {/* Blade 2 */}
                <Group rotation={120}>
                  <Rect x={-4} y={-25} width={8} height={25} cornerRadius={3} fill="#ef4444" opacity={isActive ? 1 : 0.4} />
                  {/* White tip */}
                  <Rect x={-4} y={-25} width={8} height={5} cornerRadius={2} fill="#ffffff" opacity={isActive ? 1 : 0.4} />
                  {/* Contrasting stripe */}
                  <Rect x={-4} y={-14} width={8} height={3} fill="#1e293b" opacity={isActive ? 1 : 0.4} />
                  <Circle x={0} y={-8} radius={2} fill="#ffffff" opacity={isActive ? 0.9 : 0.5} />
                </Group>
                {/* Blade 3 */}
                <Group rotation={240}>
                  <Rect x={-4} y={-25} width={8} height={25} cornerRadius={3} fill="#ef4444" opacity={isActive ? 1 : 0.4} />
                  {/* White tip */}
                  <Rect x={-4} y={-25} width={8} height={5} cornerRadius={2} fill="#ffffff" opacity={isActive ? 1 : 0.4} />
                  {/* Contrasting stripe */}
                  <Rect x={-4} y={-14} width={8} height={3} fill="#1e293b" opacity={isActive ? 1 : 0.4} />
                  <Circle x={0} y={-8} radius={2} fill="#ffffff" opacity={isActive ? 0.9 : 0.5} />
                </Group>
                {/* Center hub */}
                <Circle x={0} y={0} radius={5} fill="#1e293b" stroke="#f8fafc" strokeWidth={1} />
              </Group>
            </>
          );
        })()}

        {/* Stepper Motor — rotation indicator */}
        {isStepper && (() => {
          const rotation = Number(node.properties?.stepperRotation) || 0;
          const spinning = Boolean(node.properties?.isSpinning);
          return (
            <>
              <Group x={35} y={35} rotation={rotation} listening={false}>
                {/* Stepper position indicator line */}
                <Rect x={-1.5} y={-18} width={3} height={18} cornerRadius={1}
                  fill={spinning ? '#22c55e' : '#6b7280'} opacity={spinning ? 0.9 : 0.4} />
                <Circle x={0} y={0} radius={4} fill="#c0c0c0" stroke="#6b7280" strokeWidth={1} />
              </Group>
              {spinning && (
                <Circle x={35} y={35} radius={22} fill="transparent"
                  stroke={ACTIVE_GLOW_COLOR} strokeWidth={1} opacity={0.4}
                  shadowColor={ACTIVE_GLOW_COLOR} shadowBlur={8} listening={false} />
              )}
            </>
          );
        })()}

        {/* 7-Segment Display — lit segments overlay */}
        {is7Seg && (() => {
          const segs = (node.properties?.segments || {}) as Record<string, boolean>;
          const litColor = '#ef4444';
          const dimColor = 'rgba(239,68,68,0.12)';
          // Segment geometry (relative to 50×70 viewBox)
          const segDefs: Record<string, { d: string }> = {
            a: { d: 'M12 8 h26 l-4 4 h-18 Z' },
            b: { d: 'M40 12 l4 4 v18 l-4 4 l-4-4 v-18 Z' },
            c: { d: 'M40 40 l4 4 v18 l-4 4 l-4-4 v-18 Z' },
            d: { d: 'M12 62 h26 l-4-4 h-18 Z' },
            e: { d: 'M10 40 l-4 4 v18 l4 4 l4-4 v-18 Z' },
            f: { d: 'M10 12 l-4 4 v18 l4 4 l4-4 v-18 Z' },
            g: { d: 'M12 35 h26 l-4 4 h-18 Z' },
          };
          // We can't render SVG path in Konva directly, but we use Rects as approximation
          // For a realistic 7-seg, overlay colored rectangles at segment positions
          const segRects: { key: string; x: number; y: number; w: number; h: number; rot?: number }[] = [
            { key: 'a', x: 14, y: 7, w: 22, h: 4 },       // top horizontal
            { key: 'b', x: 36, y: 12, w: 4, h: 20 },      // top-right vertical
            { key: 'c', x: 36, y: 40, w: 4, h: 20 },      // bottom-right vertical
            { key: 'd', x: 14, y: 60, w: 22, h: 4 },      // bottom horizontal
            { key: 'e', x: 8, y: 40, w: 4, h: 20 },       // bottom-left vertical
            { key: 'f', x: 8, y: 12, w: 4, h: 20 },       // top-left vertical
            { key: 'g', x: 14, y: 34, w: 22, h: 4 },      // middle horizontal
          ];
          return (
            <>
              {segRects.map(seg => {
                const isLit = Boolean(isSimulating) && Boolean(segs[seg.key]);
                return (
                  <Rect
                    key={`seg_${seg.key}`}
                    x={seg.x} y={seg.y}
                    width={seg.w} height={seg.h}
                    cornerRadius={1}
                    fill={isLit ? litColor : dimColor}
                    shadowColor={isLit ? litColor : 'transparent'}
                    shadowBlur={isLit ? 8 : 0}
                    opacity={isLit ? 0.95 : 0.3}
                    listening={false}
                  />
                );
              })}
            </>
          );
        })()}

        {/* Push Button — realistic 3D tactile press with depth + shadow */}
        {isButton && (() => {
          const pressed = Boolean(isPressed);
          const offsetY = pressed ? BUTTON_PRESS_DEPTH : 0;
          const shadowBlur = pressed ? BUTTON_SHADOW_PRESSED : BUTTON_SHADOW_NORMAL;
          const capRadius = node.width * 0.225;
          return (
            <>
              {/* Shadow beneath button cap */}
              <Circle
                x={node.width / 2}
                y={node.height / 2 + 2}
                radius={capRadius + 2}
                fill="rgba(0,0,0,0.25)"
                shadowBlur={shadowBlur}
                shadowColor="rgba(0,0,0,0.4)"
                listening={false}
              />
              {/* Button cap — sinks when pressed */}
              <Circle
                x={node.width / 2}
                y={node.height / 2 + offsetY}
                radius={capRadius}
                fill={pressed ? '#991b1b' : '#dc2626'}
                stroke={pressed ? '#7f1d1d' : '#b91c1c'}
                strokeWidth={1.2}
                shadowColor="rgba(0,0,0,0.3)"
                shadowBlur={pressed ? 2 : 6}
                shadowOffsetY={pressed ? 0 : 2}
                listening={true}
                onMouseDown={(e) => {
                  if (readOnly) return;
                  e.cancelBubble = true;
                  onSelect();
                  const buttonType = node.properties?.buttonType || 'Momentary';
                  if (buttonType === 'Latching') {
                    const nextPressed = !pressed;
                    if (onInteraction) onInteraction(node.id, nextPressed ? 'press' : 'release');
                  } else {
                    if (onInteraction) onInteraction(node.id, 'press');
                  }
                }}
                onMouseUp={(e) => {
                  if (readOnly) return;
                  e.cancelBubble = true;
                  const buttonType = node.properties?.buttonType || 'Momentary';
                  if (buttonType !== 'Latching') {
                    if (onInteraction) onInteraction(node.id, 'release');
                  }
                }}
                onMouseLeave={(e) => {
                  if (readOnly) return;
                  e.cancelBubble = true;
                  const buttonType = node.properties?.buttonType || 'Momentary';
                  if (buttonType !== 'Latching' && pressed) {
                    if (onInteraction) onInteraction(node.id, 'release');
                  }
                }}
                onTouchStart={(e) => {
                  if (readOnly) return;
                  e.cancelBubble = true;
                  onSelect();
                  const buttonType = node.properties?.buttonType || 'Momentary';
                  if (buttonType === 'Latching') {
                    const nextPressed = !pressed;
                    if (onInteraction) onInteraction(node.id, nextPressed ? 'press' : 'release');
                  } else {
                    if (onInteraction) onInteraction(node.id, 'press');
                  }
                }}
                onTouchEnd={(e) => {
                  if (readOnly) return;
                  e.cancelBubble = true;
                  const buttonType = node.properties?.buttonType || 'Momentary';
                  if (buttonType !== 'Latching') {
                    if (onInteraction) onInteraction(node.id, 'release');
                  }
                }}
              />
              {/* Highlight dot — specular reflection */}
              <Circle
                x={node.width / 2 - capRadius * 0.25}
                y={node.height / 2 + offsetY - capRadius * 0.25}
                radius={capRadius * 0.15}
                fill="rgba(255,255,255,0.45)"
                listening={false}
              />
              {/* Press state label */}
              <Text
                text={pressed ? 'PRESSED' : ''}
                x={0} y={node.height + 2}
                width={node.width} align="center"
                fontSize={6} fontFamily="JetBrains Mono" fontStyle="700"
                fill="#fca5a5" listening={false}
              />
            </>
          );
        })()}

        {/* Toggle Switch — realistic mechanical toggle with spring animation */}
        {isSwitch && (() => {
          const isClosed = Boolean(node.properties?.isClosed);
          const knobY = isClosed ? node.height / 2 - 5 : node.height / 2 + 5;
          return (
            <>
              <Group
                listening={true}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect();
                  if (readOnly) return;
                  const currentClosed = Boolean(node.properties?.isClosed);
                  useCanvasStore.getState().updateNode(node.id, {
                    properties: {
                      ...node.properties,
                      isClosed: !currentClosed,
                    },
                  });
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  onSelect();
                  if (readOnly) return;
                  const currentClosed = Boolean(node.properties?.isClosed);
                  useCanvasStore.getState().updateNode(node.id, {
                    properties: {
                      ...node.properties,
                      isClosed: !currentClosed,
                    },
                  });
                }}
              >
                {/* Track body */}
                <Rect
                  x={node.width / 2 - 7} y={node.height / 2 - 11}
                  width={14} height={22}
                  cornerRadius={7}
                  fill={isClosed ? '#15803d' : '#1f2937'}
                  stroke={isClosed ? '#16a34a' : '#6b7280'}
                  strokeWidth={1.5}
                  shadowColor={isClosed ? '#22c55e' : 'transparent'}
                  shadowBlur={isClosed ? 8 : 0}
                  listening={false}
                />
                {/* Track inner highlight */}
                <Rect
                  x={node.width / 2 - 4} y={node.height / 2 - 8}
                  width={8} height={16}
                  cornerRadius={4}
                  fill={isClosed ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.03)'}
                  listening={false}
                />
                {/* Knob — slides between positions */}
                <Circle
                  x={node.width / 2} y={knobY}
                  radius={5}
                  fill="#f8fafc"
                  stroke={isClosed ? '#86efac' : '#94a3b8'}
                  strokeWidth={1}
                  shadowColor="rgba(0,0,0,0.3)"
                  shadowBlur={3}
                  shadowOffsetY={1}
                  listening={false}
                />
                {/* Specular dot on knob */}
                <Circle
                  x={node.width / 2 - 1} y={knobY - 1}
                  radius={1.5}
                  fill="rgba(255,255,255,0.6)"
                  listening={false}
                />
              </Group>
              {/* State label */}
              <Text
                text={isClosed ? 'ON' : 'OFF'}
                x={0} y={node.height + 2}
                width={node.width} align="center"
                fontSize={7} fontFamily="JetBrains Mono" fontStyle="700"
                fill={isClosed ? '#22c55e' : '#6b7280'}
                listening={false}
              />
            </>
          );
        })()}

        {/* Buzzer — animated expanding sound wave rings + speaker cone vibration */}
        {isBuzzer && (
          <BuzzerOverlay
            isSimulating={Boolean(isSimulating)}
            isBeeping={Boolean(node.properties?.isBeeping)}
            frequency={Number(node.properties?.frequency) || 1000}
            width={node.width}
            height={node.height}
          />
        )}

        {/* Relay — per-channel LED indicators + armature contact bar + coil glow */}
        {isRelay && (() => {
          const channelCount = node.type === 'RELAY_4CH' ? 4 : node.type === 'RELAY_2CH' ? 2 : 1;
          const spacing = node.width / (channelCount + 1);
          const anyActive = Boolean(isSimulating) && Boolean(node.properties?.isActive);

          return (
            <>
              {/* Coil energize glow */}
              {anyActive && (
                <Rect
                  x={2} y={node.height * 0.3}
                  width={node.width * 0.3} height={node.height * 0.4}
                  cornerRadius={3}
                  fill="transparent"
                  stroke={RELAY_COIL_GLOW_COLOR}
                  strokeWidth={1.5}
                  opacity={0.6}
                  shadowColor={RELAY_COIL_GLOW_COLOR}
                  shadowBlur={8}
                  listening={false}
                />
              )}
              {/* Channel LED indicators */}
              {Array.from({ length: channelCount }, (_, i) => {
                const chKey = channelCount === 1 ? 'isSwitched' : `isSwitched_${i + 1}`;
                const isSwitched = Boolean(isSimulating) && Boolean(node.properties?.[chKey]);
                return (
                  <Group key={`relay_ch_${i}`}>
                    {/* Status LED */}
                    <Circle
                      x={spacing * (i + 1)}
                      y={6}
                      radius={3}
                      fill={isSwitched ? '#22c55e' : '#374151'}
                      stroke={isSwitched ? '#16a34a' : '#555'}
                      strokeWidth={0.8}
                      shadowColor={isSwitched ? '#22c55e' : 'transparent'}
                      shadowBlur={isSwitched ? 6 : 0}
                      listening={false}
                    />
                    {/* Contact state label */}
                    <Text
                      text={isSwitched ? 'NO→' : 'NC→'}
                      x={spacing * (i + 1) - 10}
                      y={node.height - 8}
                      width={20} align="center"
                      fontSize={5} fontFamily="JetBrains Mono" fontStyle="700"
                      fill={isSwitched ? '#22c55e' : '#6b7280'}
                      listening={false}
                    />
                  </Group>
                );
              })}
            </>
          );
        })()}

        {/* Board LED indicators + TX/RX blink LEDs */}
        {isBoard && (() => {
          const isPwrOn = Boolean(isSimulating) && Boolean(node.properties?.boardPowered);
          const isLOn = isPwrOn && Boolean(node.properties?.builtInLedLit);
          const leds = getBoardLedPositions(node.type, node.width, node.height);
          
          return (
            <>
              {/* Power LED */}
              <Circle
                x={leds.pwr.x}
                y={leds.pwr.y}
                radius={4}
                fill={isPwrOn ? '#22c55e' : '#ef4444'}
                stroke={isPwrOn ? '#86efac' : '#991b1b'}
                strokeWidth={1}
                shadowColor={isPwrOn ? '#22c55e' : '#ef4444'}
                shadowBlur={isPwrOn ? 10 : 0}
                opacity={1}
                listening={false}
              />
              <Text
                text={isPwrOn ? 'ON' : 'OFF'}
                x={leds.pwr.x + 8}
                y={leds.pwr.y - 4}
                fontSize={8}
                fontFamily="Inter"
                fontStyle="700"
                fill={isPwrOn ? '#86efac' : '#ef4444'}
                listening={false}
              />

              {/* Built-in Pin 13/L LED */}
              <Circle
                x={leds.l.x}
                y={leds.l.y}
                radius={4}
                fill={isLOn ? '#eab308' : '#374151'}
                stroke={isLOn ? '#fde047' : '#4b5563'}
                strokeWidth={1}
                shadowColor="#eab308"
                shadowBlur={isLOn ? 10 : 0}
                opacity={isLOn ? 1 : 0.6}
                listening={false}
              />
              <Text
                text="L"
                x={leds.l.x + 8}
                y={leds.l.y - 4}
                fontSize={8}
                fontFamily="Inter"
                fontStyle="700"
                fill={isLOn ? '#fde047' : '#4b5563'}
                listening={false}
              />

              {/* TX LED — blinks red when serial data transmits */}
              {isPwrOn && (
                <>
                  <Circle
                    ref={txLedRef}
                    x={leds.l.x} y={leds.l.y + 14}
                    radius={3}
                    fill="#374151"
                    stroke="#4b5563"
                    strokeWidth={0.8}
                    shadowColor={BOARD_TX_COLOR}
                    shadowBlur={0}
                    listening={false}
                  />
                  <Text ref={txTextRef} text="TX" x={leds.l.x + 6} y={leds.l.y + 11}
                    fontSize={6} fontFamily="Inter" fontStyle="700"
                    fill="#4b5563" listening={false}
                  />
                  {/* RX LED — blinks green when serial data receives */}
                  <Circle
                    ref={rxLedRef}
                    x={leds.l.x} y={leds.l.y + 25}
                    radius={3}
                    fill="#374151"
                    stroke="#4b5563"
                    strokeWidth={0.8}
                    shadowColor={BOARD_RX_COLOR}
                    shadowBlur={0}
                    listening={false}
                  />
                  <Text ref={rxTextRef} text="RX" x={leds.l.x + 6} y={leds.l.y + 22}
                    fontSize={6} fontFamily="Inter" fontStyle="700"
                    fill="#4b5563" listening={false}
                  />
                </>
              )}
            </>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SENSOR LIVE DATA OVERLAYS — show readings ON the component    */}
        {/* ═══════════════════════════════════════════════════════════════ */}

        {/* DHT Temperature + Humidity Sensor — live thermometer + reading */}
        {(node.type === 'TEMP_SENSOR' || node.type === 'SENSOR_DHT11' || node.type === 'SENSOR_DHT22') && isSimulating && (() => {
          const temp = Number(node.properties?.temperature ?? 25);
          const hum = Number(node.properties?.humidity ?? 60);
          const tempPct = Math.max(0, Math.min(1, (temp + 40) / 120)); // -40 to 80
          const tempColor = temp > 35 ? TEMP_HOT_COLOR : temp < 10 ? TEMP_COLD_COLOR : TEMP_WARM_COLOR;
          const barW = node.width - 12;
          return (
            <Group listening={false}>
              <Rect x={4} y={4} width={node.width - 8} height={28}
                cornerRadius={SENSOR_OVERLAY_RADIUS} fill={SENSOR_OVERLAY_BG} />
              {/* Thermometer bar */}
              <Rect x={6} y={22} width={barW} height={SENSOR_BAR_HEIGHT}
                cornerRadius={2} fill={SENSOR_BAR_BG} />
              <Rect x={6} y={22} width={barW * tempPct} height={SENSOR_BAR_HEIGHT}
                cornerRadius={2} fill={tempColor}
                shadowColor={tempColor} shadowBlur={4} />
              <Text text={`${temp.toFixed(1)}°C`}
                x={6} y={7} fontSize={SENSOR_OVERLAY_FONT_SIZE} fontFamily={SENSOR_OVERLAY_FONT}
                fontStyle="700" fill={SENSOR_OVERLAY_TEXT} />
              <Text text={`${hum.toFixed(0)}%💧`}
                x={node.width - 36} y={7} fontSize={SENSOR_OVERLAY_FONT_SIZE - 1} fontFamily={SENSOR_OVERLAY_FONT}
                fill={SENSOR_OVERLAY_LABEL} />
            </Group>
          );
        })()}

        {/* Ultrasonic Sensor — distance + animated wave pulses */}
        {(node.type === 'ULTRASONIC_SENSOR' || node.type === 'SENSOR_ULTRASONIC') && isSimulating && (
          <UltrasonicOverlay
            isSimulating={Boolean(isSimulating)}
            distance={Number(node.properties?.distance ?? 100)}
            width={node.width}
            height={node.height}
          />
        )}

        {/* PIR Motion Sensor — radar sweep + motion flash */}
        {(node.type === 'PIR_SENSOR' || node.type === 'SENSOR_PIR') && isSimulating && (
          <PirOverlay
            isSimulating={Boolean(isSimulating)}
            motionDetected={Boolean(node.properties?.motionDetected)}
            width={node.width}
            height={node.height}
          />
        )}

        {/* LDR Light Sensor — brightness indicator */}
        {(node.type === 'LDR' || node.type === 'SENSOR_LDR') && isSimulating && (() => {
          const light = Number(node.properties?.lightLevel ?? 50);
          const lightPct = light / 100;
          const barW = node.width - 12;
          const fillColor = light > 50 ? LDR_SUN_COLOR : '#6366f1';
          return (
            <Group listening={false}>
              <Rect x={4} y={4} width={node.width - 8} height={20}
                cornerRadius={SENSOR_OVERLAY_RADIUS} fill={SENSOR_OVERLAY_BG} />
              <Text text={light > 50 ? '☀' : '🌙'}
                x={6} y={6} fontSize={10} />
              <Text text={`${light}%`}
                x={18} y={7} fontSize={SENSOR_OVERLAY_FONT_SIZE}
                fontFamily={SENSOR_OVERLAY_FONT} fontStyle="700" fill={fillColor} />
              <Rect x={6} y={17} width={barW} height={SENSOR_BAR_HEIGHT}
                cornerRadius={2} fill={SENSOR_BAR_BG} />
              <Rect x={6} y={17} width={barW * lightPct} height={SENSOR_BAR_HEIGHT}
                cornerRadius={2} fill={fillColor}
                shadowColor={fillColor} shadowBlur={3} />
            </Group>
          );
        })()}

        {/* Soil Moisture Sensor — moisture bar */}
        {node.type === 'SOIL_MOISTURE' && isSimulating && (() => {
          const moisture = Number(node.properties?.moistureLevel ?? 50);
          const moistPct = moisture / 100;
          const barW = node.width - 12;
          const fillColor = moisture > 60 ? SOIL_WET_COLOR : SOIL_DRY_COLOR;
          return (
            <Group listening={false}>
              <Rect x={4} y={4} width={node.width - 8} height={18}
                cornerRadius={SENSOR_OVERLAY_RADIUS} fill={SENSOR_OVERLAY_BG} />
              <Text text={`💧${moisture}%`}
                x={6} y={6} fontSize={SENSOR_OVERLAY_FONT_SIZE}
                fontFamily={SENSOR_OVERLAY_FONT} fontStyle="700" fill={fillColor} />
              <Rect x={6} y={16} width={barW} height={SENSOR_BAR_HEIGHT - 1}
                cornerRadius={2} fill={SENSOR_BAR_BG} />
              <Rect x={6} y={16} width={barW * moistPct} height={SENSOR_BAR_HEIGHT - 1}
                cornerRadius={2} fill={fillColor} />
            </Group>
          );
        })()}

        {/* IMU Sensor — tilt indicator + acceleration values */}
        {node.type === 'SENSOR_IMU' && isSimulating && (() => {
          const ax = Number(node.properties?.accelerationX ?? 0);
          const ay = Number(node.properties?.accelerationY ?? 0);
          const tiltAngle = Math.atan2(ay, ax) * (180 / Math.PI);
          const cx = node.width / 2;
          const cy = node.height / 2 - 5;
          return (
            <Group listening={false}>
              {/* Tilt circle */}
              <Circle x={cx} y={cy} radius={14}
                fill="transparent" stroke={IMU_TILT_COLOR}
                strokeWidth={1} opacity={0.4} />
              {/* Tilt indicator */}
              <Group x={cx} y={cy} rotation={tiltAngle}>
                <Circle x={10} y={0} radius={3}
                  fill={IMU_TILT_COLOR} opacity={0.8}
                  shadowColor={IMU_TILT_COLOR} shadowBlur={4} />
              </Group>
              <Circle x={cx} y={cy} radius={2}
                fill="#cbd5e1" />
              {/* Values */}
              <Rect x={2} y={node.height - 14} width={node.width - 4} height={12}
                cornerRadius={2} fill={SENSOR_OVERLAY_BG} />
              <Text text={`X:${ax.toFixed(1)} Y:${ay.toFixed(1)}`}
                x={4} y={node.height - 12} fontSize={6}
                fontFamily={SENSOR_OVERLAY_FONT} fontStyle="700" fill={IMU_TILT_COLOR} />
            </Group>
          );
        })()}

        {/* Servo Motor — tick marks arc + angle readout */}
        {isServo && isSimulating && (() => {
          const angle = Number(node.properties?.servoAngle || 0);
          return (
            <Group listening={false}>
              {/* Sweep arc background */}
              <Group x={node.width - 15} y={node.height / 2}>
                {/* Tick marks every 22.5° */}
                {Array.from({ length: 9 }).map((_, i) => {
                  const tickAngle = (i * 22.5 - 90) * (Math.PI / 180);
                  const r1 = 24;
                  const r2 = 28;
                  return (
                    <Line key={`servo_tick_${i}`}
                      points={[
                        Math.cos(tickAngle) * r1, Math.sin(tickAngle) * r1,
                        Math.cos(tickAngle) * r2, Math.sin(tickAngle) * r2,
                      ]}
                      stroke={SERVO_ARC_COLOR} strokeWidth={1} />
                  );
                })}
              </Group>
              {/* Angle readout */}
              <Rect x={2} y={2} width={28} height={12}
                cornerRadius={2} fill={SENSOR_OVERLAY_BG} />
              <Text text={`${angle}°`}
                x={4} y={3} fontSize={8}
                fontFamily={SENSOR_OVERLAY_FONT} fontStyle="700"
                fill={SERVO_ANGLE_TEXT_COLOR} />
            </Group>
          );
        })()}

        {/* DC Motor — vibration + motion blur at high RPM */}
        {isDcMotor && isActive && (
          <DcMotorOverlay
            isActive={Boolean(isActive)}
            rpm={Number(node.properties?.rpm) || 3000}
            width={node.width}
            height={node.height}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* INTERACTIVE PHYSICS TARGETS FOR SENSORS (SIMULATION MODE)      */}
        {/* ═══════════════════════════════════════════════════════════════ */}

        {/* LDR Sensor Flashlight Target */}
        {(node.type === 'LDR' || node.type === 'SENSOR_LDR') && isSimulating && (() => {
          const light = Number(node.properties?.lightLevel ?? 50);
          const minD = 20;
          const maxD = 120;
          const dist = maxD - (light / 100) * (maxD - minD);
          const cx = node.width / 2;
          const cy = node.height / 2;

          return (
            <Group listening={true}>
              <Line
                points={[cx, cy, cx + dist, cy]}
                stroke="#eab308"
                strokeWidth={1.5}
                dash={[3, 3]}
                opacity={0.6}
              />
              <Group
                x={cx + dist}
                y={cy}
                draggable={!readOnly}
                dragBoundFunc={(pos) => {
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = pos.x - node.x;
                  const dy = pos.y - node.y;
                  const localX = dx * cos + dy * sin;
                  const d = Math.max(minD, Math.min(maxD, localX - cx));
                  return {
                    x: node.x + (cx + d) * cos - cy * sin,
                    y: node.y + (cx + d) * sin + cy * cos,
                  };
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = e.target.x() - node.x;
                  const dy = e.target.y() - node.y;
                  const localX = dx * cos + dy * sin;
                  const d = Math.max(minD, Math.min(maxD, localX - cx));
                  const newLight = Math.round(100 * (1 - (d - minD) / (maxD - minD)));
                  onChange({
                    properties: {
                      ...node.properties,
                      lightLevel: newLight,
                    },
                  });
                }}
              >
                <Circle radius={14} fill="#eab308" opacity={0.25} shadowColor="#eab308" shadowBlur={10} />
                <Circle radius={7} fill="#fde047" stroke="#eab308" strokeWidth={1} />
                <Circle x={-2} y={-2} radius={2} fill="white" opacity={0.8} />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                  const rRad = (angle * Math.PI) / 180;
                  return (
                    <Line
                      key={`ray_${angle}`}
                      points={[Math.cos(rRad) * 8, Math.sin(rRad) * 8, Math.cos(rRad) * 12, Math.sin(rRad) * 12]}
                      stroke="#fde047"
                      strokeWidth={1}
                    />
                  );
                })}
              </Group>
            </Group>
          );
        })()}

        {/* Ultrasonic Sonar Obstacle Target */}
        {(node.type === 'ULTRASONIC_SENSOR' || node.type === 'SENSOR_ULTRASONIC') && isSimulating && (() => {
          const dist = Number(node.properties?.distance ?? 100);
          const maxPx = 150;
          const minPx = 30;
          const distPx = minPx + ((dist - 2) / (400 - 2)) * (maxPx - minPx);

          return (
            <Group x={node.width} y={node.height / 2} listening={true}>
              <Line
                points={[0, 0, distPx, 0]}
                stroke="#0ea5e9"
                strokeWidth={1.5}
                dash={[4, 4]}
                opacity={0.7}
              />
              <Arc
                x={distPx / 2}
                y={0}
                angle={30}
                innerRadius={Math.max(0, distPx / 2 - 5)}
                outerRadius={distPx / 2 + 5}
                fill="rgba(14,165,233,0.15)"
                rotation={-15}
              />
              <Group
                x={distPx}
                y={0}
                draggable={!readOnly}
                dragBoundFunc={(pos) => {
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = pos.x - node.x;
                  const dy = pos.y - node.y;
                  const localX = dx * cos + dy * sin;
                  const clampedX = Math.max(node.width + minPx, Math.min(node.width + maxPx, localX));
                  return {
                    x: node.x + clampedX * cos - (node.height / 2) * sin,
                    y: node.y + clampedX * sin + (node.height / 2) * cos,
                  };
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = e.target.x() - node.x;
                  const dy = e.target.y() - node.y;
                  const localX = dx * cos + dy * sin;
                  const clampedX = Math.max(minPx, Math.min(maxPx, localX - node.width));
                  const newDist = 2 + ((clampedX - minPx) / (maxPx - minPx)) * (400 - 2);
                  onChange({
                    properties: {
                      ...node.properties,
                      distance: Math.round(newDist),
                    },
                  });
                }}
              >
                <Rect
                  x={-6}
                  y={-12}
                  width={12}
                  height={24}
                  fill="#64748b"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  cornerRadius={3}
                  shadowColor="black"
                  shadowBlur={4}
                />
                <Text
                  text="|||"
                  x={-6}
                  y={-8}
                  width={12}
                  align="center"
                  fontSize={8}
                  fontStyle="bold"
                  fill="#cbd5e1"
                />
              </Group>
            </Group>
          );
        })()}

        {/* PIR Motion Sensor Intruder Target */}
        {(node.type === 'PIR_SENSOR' || node.type === 'SENSOR_PIR') && isSimulating && (() => {
          const motionDetected = Boolean(node.properties?.motionDetected);
          const intX = Number(node.properties?.intruderX !== undefined ? node.properties.intruderX : 100);
          const intY = Number(node.properties?.intruderY !== undefined ? node.properties.intruderY : 0);
          const cx = node.width / 2;
          const cy = node.height / 2;

          return (
            <Group listening={true}>
              <Arc
                x={cx}
                y={cy}
                angle={90}
                innerRadius={0}
                outerRadius={80}
                rotation={-45}
                fill="rgba(239,68,68,0.04)"
                stroke="#ef4444"
                strokeWidth={1}
                dash={[3, 3]}
                opacity={0.4}
              />
              <Group
                x={cx + intX}
                y={cy + intY}
                draggable={!readOnly}
                dragBoundFunc={(pos) => {
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = pos.x - node.x;
                  const dy = pos.y - node.y;
                  const localX = dx * cos + dy * sin;
                  const localY = -dx * sin + dy * cos;
                  const clampedX = Math.max(-130, Math.min(130, localX - cx));
                  const clampedY = Math.max(-130, Math.min(130, localY - cy));
                  return {
                    x: node.x + (cx + clampedX) * cos - (cy + clampedY) * sin,
                    y: node.y + (cx + clampedX) * sin + (cy + clampedY) * cos,
                  };
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = e.target.x() - node.x;
                  const dy = e.target.y() - node.y;
                  const localX = dx * cos + dy * sin;
                  const localY = -dx * sin + dy * cos;
                  const curX = localX - cx;
                  const curY = localY - cy;

                  const distance = Math.sqrt(curX * curX + curY * curY);
                  const angle = Math.atan2(curY, curX) * (180 / Math.PI);
                  const inCone = distance <= 80 && Math.abs(angle) <= 45;

                  onChange({
                    properties: {
                      ...node.properties,
                      intruderX: Math.round(curX),
                      intruderY: Math.round(curY),
                      motionDetected: inCone,
                    },
                  });
                }}
              >
                <Circle radius={10} fill={motionDetected ? '#ef4444' : '#6b7280'} opacity={0.8} />
                <Circle radius={4} fill="white" />
                <Text
                  text="🚶"
                  x={-6}
                  y={-6}
                  fontSize={10}
                  align="center"
                  listening={false}
                />
              </Group>
            </Group>
          );
        })()}

        {/* Soil Moisture Water Droplet Target */}
        {node.type === 'SOIL_MOISTURE' && isSimulating && (() => {
          const moisture = Number(node.properties?.moistureLevel ?? 50);
          const minD = 20;
          const maxD = 120;
          const dist = maxD - (moisture / 100) * (maxD - minD);
          const cx = node.width / 2;
          const cy = node.height / 2;

          return (
            <Group listening={true}>
              <Line
                points={[cx, cy, cx + dist, cy]}
                stroke="#3b82f6"
                strokeWidth={1.5}
                dash={[3, 3]}
                opacity={0.6}
              />
              <Group
                x={cx + dist}
                y={cy}
                draggable={!readOnly}
                dragBoundFunc={(pos) => {
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = pos.x - node.x;
                  const dy = pos.y - node.y;
                  const localX = dx * cos + dy * sin;
                  const d = Math.max(minD, Math.min(maxD, localX - cx));
                  return {
                    x: node.x + (cx + d) * cos - cy * sin,
                    y: node.y + (cx + d) * sin + cy * cos,
                  };
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = e.target.x() - node.x;
                  const dy = e.target.y() - node.y;
                  const localX = dx * cos + dy * sin;
                  const d = Math.max(minD, Math.min(maxD, localX - cx));
                  const newMoist = Math.round(100 * (1 - (d - minD) / (maxD - minD)));
                  onChange({
                    properties: {
                      ...node.properties,
                      moistureLevel: newMoist,
                    },
                  });
                }}
              >
                <Circle radius={12} fill="#3b82f6" opacity={0.25} />
                <Text
                  text="💧"
                  x={-6}
                  y={-7}
                  fontSize={11}
                  listening={false}
                />
              </Group>
            </Group>
          );
        })()}

        {/* IMU Sensor Joystick Tilt Target */}
        {node.type === 'SENSOR_IMU' && isSimulating && (() => {
          const ax = Number(node.properties?.accelerationX ?? 0);
          const ay = Number(node.properties?.accelerationY ?? 0);
          const maxVal = 16;
          const maxPx = 14;
          const jx = (ax / maxVal) * maxPx;
          const jy = (ay / maxVal) * maxPx;
          const cx = node.width / 2;
          const cy = node.height / 2 - 5;

          return (
            <Group listening={true}>
              <Circle
                x={cx}
                y={cy}
                radius={maxPx + 2}
                fill="rgba(15,23,42,0.4)"
                stroke="#a855f7"
                strokeWidth={1}
                dash={[2, 2]}
              />
              <Circle
                x={cx + jx}
                y={cy + jy}
                radius={4}
                fill="#ffffff"
                stroke="#a855f7"
                strokeWidth={1.5}
                shadowColor="black"
                shadowBlur={2}
                draggable={!readOnly}
                dragBoundFunc={(pos) => {
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = pos.x - node.x;
                  const dy = pos.y - node.y;
                  const localX = dx * cos + dy * sin;
                  const localY = -dx * sin + dy * cos;
                  
                  const vx = localX - cx;
                  const vy = localY - cy;
                  const dist = Math.sqrt(vx * vx + vy * vy);
                  
                  let clampedX = vx;
                  let clampedY = vy;
                  if (dist > maxPx) {
                    clampedX = (vx / dist) * maxPx;
                    clampedY = (vy / dist) * maxPx;
                  }
                  
                  return {
                    x: node.x + (cx + clampedX) * cos - (cy + clampedY) * sin,
                    y: node.y + (cx + clampedX) * sin + (cy + clampedY) * cos,
                  };
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  const rad = (node.rotation || 0) * Math.PI / 180;
                  const cos = Math.cos(rad);
                  const sin = Math.sin(rad);
                  const dx = e.target.x() - node.x;
                  const dy = e.target.y() - node.y;
                  const localX = dx * cos + dy * sin;
                  const localY = -dx * sin + dy * cos;
                  
                  const vx = localX - cx;
                  const vy = localY - cy;
                  
                  const newAx = (vx / maxPx) * maxVal;
                  const newAy = (vy / maxPx) * maxVal;
                  
                  onChange({
                    properties: {
                      ...node.properties,
                      accelerationX: Math.round(newAx * 10) / 10,
                      accelerationY: Math.round(newAy * 10) / 10,
                    },
                  });
                }}
              />
            </Group>
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
            isProbeMode={isProbeMode}
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

export default memo(ComponentNode);
