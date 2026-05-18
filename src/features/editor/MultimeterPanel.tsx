import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Gauge } from 'lucide-react';

interface Props { isOpen: boolean; onClose: () => void; voltage?: number; current?: number; resistance?: number; }

type MeterMode = 'V' | 'A' | 'OHM';

export default function MultimeterPanel({ isOpen, onClose, voltage = 0, current = 0, resistance = 0 }: Props) {
  const [mode, setMode] = useState<MeterMode>('V');
  const reading = mode === 'V' ? voltage : mode === 'A' ? current : resistance;
  const unit = mode === 'V' ? 'V' : mode === 'A' ? 'mA' : 'ohm';

  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
      className="absolute top-16 right-4 w-56 glass rounded-2xl overflow-hidden z-30 shadow-2xl border border-surface-200 dark:border-white/10">
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-200/70 bg-surface-50/70 dark:border-white/5 dark:bg-surface-900/60">
        <div className="flex items-center gap-2"><Gauge className="w-4 h-4 text-volt-500 dark:text-volt-400" /><span className="text-xs font-bold text-surface-950 dark:text-white">Multimeter</span></div>
        <button onClick={onClose} className="text-surface-500 hover:text-surface-950 dark:text-surface-400 dark:hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="p-4">
        <div className="bg-[#1a2332] rounded-xl p-4 mb-3 border border-white/5">
          <div className="text-right">
            <span className="text-3xl font-mono font-bold text-volt-400">{reading.toFixed(2)}</span>
            <span className="text-lg text-surface-400 ml-1">{unit}</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="w-2 h-2 rounded-full bg-volt-500 animate-pulse"></span>
            <span className="text-[9px] text-surface-500 uppercase">Auto Range</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(['V', 'A', 'OHM'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? 'bg-volt-500/20 text-volt-600 border border-volt-500/30 dark:text-volt-400' : 'bg-surface-100 text-surface-600 hover:bg-surface-200 hover:text-surface-950 border border-transparent dark:bg-white/5 dark:text-surface-400 dark:hover:text-white'}`}>
              {m === 'OHM' ? 'ohm' : m}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-surface-500 mt-3 text-center">Click two pins on the canvas to measure</p>
      </div>
    </motion.div>
  );
}
