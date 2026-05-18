import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, X, Pause, Play } from 'lucide-react';

interface Props { isOpen: boolean; onClose: () => void; signalData?: number[]; }

export default function OscilloscopePanel({ isOpen, onClose, signalData = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [timeDiv, setTimeDiv] = useState(10); // ms/div
  const bufferRef = useRef<number[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!paused && signalData.length > 0) {
      bufferRef.current = [...bufferRef.current.slice(-200), ...signalData];
    }
  }, [signalData, paused]);

  // Generate demo signal when no real data
  useEffect(() => {
    if (!isOpen) return;
    let t = 0;
    const interval = setInterval(() => {
      if (paused) return;
      t += 0.1;
      const val = Math.sin(t * 2) * 2.5 + 2.5; // 0-5V sine wave
      bufferRef.current = [...bufferRef.current.slice(-300), val];
    }, 16);
    return () => clearInterval(interval);
  }, [isOpen, paused]);

  // Draw waveform
  useEffect(() => {
    if (!isOpen) return;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;

      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(34,197,94,0.1)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * h / 8); ctx.lineTo(w, i * h / 8); ctx.stroke();
      }

      // Center line
      ctx.strokeStyle = 'rgba(34,197,94,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

      // Signal
      const data = bufferRef.current;
      if (data.length < 2) { animRef.current = requestAnimationFrame(draw); return; }

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const step = w / Math.min(data.length, 300);
      const start = Math.max(0, data.length - 300);
      for (let i = start; i < data.length; i++) {
        const x = (i - start) * step;
        const y = h - (data[i] / 5) * h; // 0-5V range mapped to canvas height
        if (i === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-64 right-4 w-80 glass rounded-2xl overflow-hidden z-30 shadow-2xl border border-surface-200 dark:border-white/10">
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-200/70 bg-surface-50/70 dark:border-white/5 dark:bg-surface-900/60">
        <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-volt-500 dark:text-volt-400" /><span className="text-xs font-bold text-surface-950 dark:text-white">Oscilloscope</span></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPaused(!paused)} className="text-surface-500 hover:text-surface-950 dark:text-surface-400 dark:hover:text-white">
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-950 dark:text-surface-400 dark:hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="p-2">
        <canvas ref={canvasRef} width={300} height={160} className="w-full rounded-lg" />
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-surface-500 dark:text-surface-500">Time/div:</span>
            <select value={timeDiv} onChange={e => setTimeDiv(Number(e.target.value))}
              className="bg-white text-[10px] text-surface-950 rounded px-1 py-0.5 border border-surface-200 dark:bg-white/5 dark:text-white dark:border-white/10">
              <option value={1}>1ms</option><option value={5}>5ms</option><option value={10}>10ms</option><option value={50}>50ms</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-volt-500"></span>
            <span className="text-[9px] text-surface-500 dark:text-surface-400">CH1: 0-5V</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
