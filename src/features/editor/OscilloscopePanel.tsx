import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, X, Pause, Play } from 'lucide-react';
import VfOscilloscopeScreen from '../../components/ui/VfOscilloscopeScreen';
import VfSelect from '../../components/ui/VfSelect';
import VfPanelHeader from '../../components/ui/VfPanelHeader';

interface Props { isOpen: boolean; onClose: () => void; signalData?: number[]; }

export default function OscilloscopePanel({ isOpen, onClose, signalData = [] }: Props) {
  const [paused, setPaused] = useState(false);
  const [timeDiv, setTimeDiv] = useState(10); // ms/div
  const [buffer, setBuffer] = useState<number[]>([]);

  useEffect(() => {
    if (!paused && signalData.length > 0) {
      setBuffer(prev => [...prev.slice(-200), ...signalData]);
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
      setBuffer(prev => [...prev.slice(-300), val]);
    }, 20);
    return () => clearInterval(interval);
  }, [isOpen, paused]);

  if (!isOpen) return null;

  const waveData = {
    'CH1': buffer
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-64 right-4 w-80 glass rounded-2xl overflow-hidden z-30 shadow-2xl border border-surface-200 dark:border-white/10">
      <VfPanelHeader
        title="Oscilloscope"
        icon={<Activity className="w-3.5 h-3.5 text-volt-500" />}
        onClose={onClose}
        actions={
          <button onClick={() => setPaused(!paused)} className="text-surface-500 hover:text-surface-955 dark:text-surface-400 dark:hover:text-white cursor-pointer mr-1">
            {paused ? <Play className="w-3.5 h-3.5 text-[#22c55e]" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        }
      />
      <div className="p-2 h-44">
        <VfOscilloscopeScreen data={waveData} voltsPerDiv={1.0} timePerDiv={timeDiv} paused={paused} />
      </div>
      <div className="p-2 border-t border-surface-200/70 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-surface-500 dark:text-surface-500">Time/div:</span>
          <div className="w-[70px]">
            <VfSelect
              value={timeDiv}
              onChange={e => setTimeDiv(Number(e.target.value))}
              options={[
                { value: 1, label: '1ms' },
                { value: 5, label: '5ms' },
                { value: 10, label: '10ms' },
                { value: 50, label: '50ms' }
              ]}
              className="h-6 py-0 pl-1.5 pr-5 bg-white text-[10px] text-surface-955 rounded border border-surface-200 dark:bg-white/5 dark:text-white dark:border-white/10"
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-volt-500"></span>
          <span className="text-[9px] text-surface-500 dark:text-surface-400">CH1: 0-5V</span>
        </div>
      </div>
    </motion.div>
  );
}
