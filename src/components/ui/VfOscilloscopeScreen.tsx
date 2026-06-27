import { useRef, useEffect } from 'react';

const GRID_COLS = 10;
const GRID_ROWS = 8;

export interface VfOscilloscopeScreenProps {
  data: Record<string, number[]>;
  voltsPerDiv: number;
  timePerDiv: number;
  paused: boolean;
  colors?: {
    background?: string;
    grid?: string;
    gridMajor?: string;
    axis?: string;
    ch1?: string;
    ch2?: string;
  };
}

export default function VfOscilloscopeScreen({
  data,
  voltsPerDiv,
  timePerDiv,
  paused,
  colors = {}
}: VfOscilloscopeScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const fullColors = {
    background: '#0a0f1e',
    grid: 'rgba(34, 197, 94, 0.12)',
    gridMajor: 'rgba(34, 197, 94, 0.25)',
    axis: 'rgba(34, 197, 94, 0.5)',
    ch1: '#22c55e',
    ch2: '#38bdf8',
    ...colors
  };

  const channelKeys = Object.keys(data);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Update canvas dimensions dynamically to prevent layout blurring
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      
      ctx.save();
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;

      // Draw Background
      ctx.fillStyle = fullColors.background;
      ctx.fillRect(0, 0, w, h);

      // Draw Grid
      const cellW = w / GRID_COLS;
      const cellH = h / GRID_ROWS;

      // Minor grid
      ctx.strokeStyle = fullColors.grid;
      ctx.lineWidth = 0.5;
      for (let i = 1; i < GRID_COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, 0);
        ctx.lineTo(i * cellW, h);
        ctx.stroke();
      }
      for (let i = 1; i < GRID_ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellH);
        ctx.lineTo(w, i * cellH);
        ctx.stroke();
      }

      // Major grid (center axes)
      ctx.strokeStyle = fullColors.gridMajor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Axis ticks
      ctx.strokeStyle = fullColors.axis;
      ctx.lineWidth = 0.5;
      const tickSize = 4;
      for (let i = 0; i <= GRID_COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, h / 2 - tickSize);
        ctx.lineTo(i * cellW, h / 2 + tickSize);
        ctx.stroke();
      }
      for (let i = 0; i <= GRID_ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 - tickSize, i * cellH);
        ctx.lineTo(w / 2 + tickSize, i * cellH);
        ctx.stroke();
      }

      // Draw Traces
      const traceColors = [fullColors.ch1, fullColors.ch2];
      channelKeys.forEach((key, chIdx) => {
        const samples = data[key];
        if (!samples || samples.length < 2) return;

        const color = traceColors[chIdx % traceColors.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4; // Glow shadow

        const centerVoltage = 2.5;
        const totalVolts = voltsPerDiv * GRID_ROWS;
        const samplesPerDiv = Math.max(10, Math.floor(100 / timePerDiv));
        const totalSamples = samplesPerDiv * GRID_COLS;
        const startIdx = Math.max(0, samples.length - totalSamples);
        const visibleSamples = samples.slice(startIdx);

        if (visibleSamples.length >= 2) {
          ctx.beginPath();
          for (let i = 0; i < visibleSamples.length; i++) {
            const x = (i / (visibleSamples.length - 1)) * w;
            const volts = visibleSamples[i];
            const y = h / 2 - ((volts - centerVoltage) / totalVolts) * h;
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }

        ctx.shadowBlur = 0;

        // Channel Label Overlay
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText(`CH${chIdx + 1}: ${key}`, 8, 14 + chIdx * 14);
      });

      // Scale Labels Overlay
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(`${voltsPerDiv.toFixed(1)} V/div`, w - 70, h - 24);
      ctx.fillText(`${timePerDiv.toFixed(1)} ms/div`, w - 72, h - 10);

      ctx.restore();

      if (!paused) {
        animFrameRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [data, voltsPerDiv, timePerDiv, paused]);

  return (
    <canvas ref={canvasRef} className="w-full h-full block" />
  );
}
