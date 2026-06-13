// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Oscilloscope Panel
// Full-size waveform viewer similar to the Serial Monitor panel.
// Uses HTML Canvas 2D for performant waveform rendering.
// ═══════════════════════════════════════════════════════════════════════════

import { useRef, useEffect, useCallback, useState } from 'react';
import { X, Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';

const GRID_COLS = 10;
const GRID_ROWS = 8;

const COLORS = {
  background: '#0a0f1e',
  grid: 'rgba(34, 197, 94, 0.12)',
  gridMajor: 'rgba(34, 197, 94, 0.25)',
  axis: 'rgba(34, 197, 94, 0.5)',
  ch1: '#22c55e',
  ch2: '#38bdf8',
  text: '#94a3b8',
  textBright: '#e5e7eb',
  border: '#334155',
};

interface OscilloscopePanelProps {
  className?: string;
}

export default function OscilloscopePanel({ className = '' }: OscilloscopePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const {
    oscilloscopeData,
    oscilloscopePanelOpen,
    setOscilloscopePanelOpen,
  } = useSimulationStore();

  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voltsPerDiv, setVoltsPerDiv] = useState(1.0);
  const [timePerDiv, setTimePerDiv] = useState(1.0); // ms
  const [pausedData, setPausedData] = useState<Record<string, number[]>>({});

  // Get channel data
  const channels = paused ? pausedData : oscilloscopeData;
  const channelKeys = Object.keys(channels);

  const handlePauseToggle = useCallback(() => {
    if (!paused) {
      // Capture current data
      setPausedData({ ...oscilloscopeData });
    }
    setPaused(!paused);
  }, [paused, oscilloscopeData]);

  // Draw waveform
  useEffect(() => {
    if (!oscilloscopePanelOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      const dpr = window.devicePixelRatio || 1;

      // Set canvas display size
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;

      // Background
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, w, h);

      // Draw grid
      const cellW = w / GRID_COLS;
      const cellH = h / GRID_ROWS;

      // Minor grid
      ctx.strokeStyle = COLORS.grid;
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

      // Major grid (center cross)
      ctx.strokeStyle = COLORS.gridMajor;
      ctx.lineWidth = 1;
      // Vertical center
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      // Horizontal center
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Axis ticks
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 0.5;
      const tickSize = 4;
      // X-axis ticks on center line
      for (let i = 0; i <= GRID_COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, h / 2 - tickSize);
        ctx.lineTo(i * cellW, h / 2 + tickSize);
        ctx.stroke();
      }
      // Y-axis ticks on center line
      for (let i = 0; i <= GRID_ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 - tickSize, i * cellH);
        ctx.lineTo(w / 2 + tickSize, i * cellH);
        ctx.stroke();
      }

      // Draw waveform traces
      const traceColors = [COLORS.ch1, COLORS.ch2];
      let chIdx = 0;

      for (const key of channelKeys) {
        const samples = channels[key];
        if (!samples || samples.length < 2) continue;

        const color = traceColors[chIdx % traceColors.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;

        // Scale: volts/div controls vertical scaling
        // Center at 2.5V (middle of 0-5V range)
        const centerVoltage = 2.5;
        const totalVolts = voltsPerDiv * GRID_ROWS;

        // How many samples to show based on timePerDiv
        const samplesPerDiv = Math.max(10, Math.floor(100 / timePerDiv));
        const totalSamples = samplesPerDiv * GRID_COLS;
        const startIdx = Math.max(0, samples.length - totalSamples);
        const visibleSamples = samples.slice(startIdx);

        if (visibleSamples.length < 2) {
          chIdx++;
          continue;
        }

        ctx.beginPath();
        for (let i = 0; i < visibleSamples.length; i++) {
          const x = (i / visibleSamples.length) * w;
          const volts = visibleSamples[i];
          // Map voltage to y: center = h/2, each div = cellH
          const y = h / 2 - ((volts - centerVoltage) / totalVolts) * h;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Channel label
        ctx.fillStyle = color;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`CH${chIdx + 1}: ${key}`, 8, 14 + chIdx * 14);

        chIdx++;
      }

      // Draw scale labels
      ctx.fillStyle = COLORS.text;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`${voltsPerDiv.toFixed(1)} V/div`, w - 70, h - 24);
      ctx.fillText(`${timePerDiv.toFixed(1)} ms/div`, w - 72, h - 10);

      if (!paused) {
        animFrameRef.current = requestAnimationFrame(draw);
      }
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [oscilloscopePanelOpen, channels, channelKeys, voltsPerDiv, timePerDiv, paused]);

  if (!oscilloscopePanelOpen) return null;

  const panelHeight = expanded ? 'h-80' : 'h-48';

  return (
    <div className={`flex flex-col border-t border-surface-200 dark:border-white/10 bg-[#0a0f1e] ${panelHeight} ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-50 dark:bg-surface-900/50 border-b border-surface-200 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#22c55e] tracking-wider">⏚ OSCILLOSCOPE</span>

          {/* V/div control */}
          <div className="flex items-center gap-1 ml-3">
            <span className="text-[9px] text-surface-400">V/div:</span>
            <select
              value={voltsPerDiv}
              onChange={(e) => setVoltsPerDiv(Number(e.target.value))}
              className="text-[9px] bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 rounded px-1 py-0.5 border border-surface-200 dark:border-white/10"
            >
              <option value={0.1}>0.1V</option>
              <option value={0.5}>0.5V</option>
              <option value={1.0}>1.0V</option>
              <option value={2.0}>2.0V</option>
              <option value={5.0}>5.0V</option>
            </select>
          </div>

          {/* T/div control */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-surface-400">T/div:</span>
            <select
              value={timePerDiv}
              onChange={(e) => setTimePerDiv(Number(e.target.value))}
              className="text-[9px] bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 rounded px-1 py-0.5 border border-surface-200 dark:border-white/10"
            >
              <option value={0.1}>0.1ms</option>
              <option value={0.5}>0.5ms</option>
              <option value={1.0}>1ms</option>
              <option value={5.0}>5ms</option>
              <option value={10.0}>10ms</option>
              <option value={50.0}>50ms</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Pause / Resume */}
          <button
            onClick={handlePauseToggle}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-white/10"
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? (
              <Play className="w-3 h-3 text-[#22c55e]" />
            ) : (
              <Pause className="w-3 h-3 text-surface-400" />
            )}
          </button>

          {/* Expand / Collapse */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-white/10"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <Minimize2 className="w-3 h-3 text-surface-400" />
            ) : (
              <Maximize2 className="w-3 h-3 text-surface-400" />
            )}
          </button>

          {/* Close */}
          <button
            onClick={() => setOscilloscopePanelOpen(false)}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-white/10"
            title="Close oscilloscope"
          >
            <X className="w-3 h-3 text-surface-400" />
          </button>
        </div>
      </div>

      {/* Waveform canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ imageRendering: 'auto' }}
        />
        {channelKeys.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-surface-500 font-mono">
              No oscilloscope probes connected
            </span>
          </div>
        )}
        {paused && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-yellow-500/20 rounded text-[9px] text-yellow-400 font-mono font-bold">
            PAUSED
          </div>
        )}
      </div>
    </div>
  );
}
