import { motion } from 'framer-motion';

export interface VfStatusIndicatorProps {
  status: 'running' | 'paused' | 'stopped' | 'error';
  label?: string;
  pulse?: boolean;
  className?: string;
}

const statusConfig = {
  running: { color: 'bg-emerald-500', shadow: 'shadow-emerald-500/50', text: 'text-emerald-500 dark:text-emerald-400' },
  paused: { color: 'bg-amber-500', shadow: 'shadow-amber-500/50', text: 'text-amber-500 dark:text-amber-400' },
  stopped: { color: 'bg-slate-400', shadow: 'shadow-slate-400/50', text: 'text-slate-500 dark:text-slate-400' },
  error: { color: 'bg-red-500', shadow: 'shadow-red-500/50', text: 'text-red-500 dark:text-red-400' }
};

export default function VfStatusIndicator({
  status,
  label,
  pulse = true,
  className = ''
}: VfStatusIndicatorProps) {
  const config = statusConfig[status];
  
  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <div className="relative flex items-center justify-center w-3 h-3">
        {pulse && status !== 'stopped' && (
          <motion.span
            animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className={`absolute inline-flex h-2.5 w-2.5 rounded-full ${config.color} opacity-75`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.color} shadow-[0_0_8px_rgba(0,0,0,0.2)]`} />
      </div>
      {label && (
        <span className={`text-[10px] font-extrabold uppercase tracking-widest ${config.text}`}>
          {label}
        </span>
      )}
    </div>
  );
}
