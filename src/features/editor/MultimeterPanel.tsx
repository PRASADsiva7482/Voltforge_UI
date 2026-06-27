import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Gauge } from 'lucide-react';
import VfDigitalDisplay from '../../components/ui/VfDigitalDisplay';
import VfPanelHeader from '../../components/ui/VfPanelHeader';

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
      <VfPanelHeader
        title="Multimeter"
        icon={<Gauge className="w-3.5 h-3.5 text-volt-500" />}
        onClose={onClose}
      />
      <div className="p-4">
        <VfDigitalDisplay
          value={reading.toFixed(2)}
          unit={unit}
          label="Auto Range"
          indicator={
            <span className="w-1.5 h-1.5 rounded-full bg-volt-500 animate-pulse" />
          }
          className="mb-3"
        />
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
