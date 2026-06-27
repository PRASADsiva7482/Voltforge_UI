import { motion } from 'framer-motion';

export interface VfTabOption<T> {
  value: T;
  label: string;
}

export interface VfTabsProps<T> {
  options: VfTabOption<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}

export default function VfTabs({
  options,
  value,
  onChange,
  className = '',
}: VfTabsProps<any>) {
  return (
    <div className={`flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900/80 rounded-lg p-0.5 border border-slate-200/50 dark:border-white/5 relative ${className}`}>
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative px-3 py-1.5 rounded-md text-[11px] font-bold select-none cursor-pointer outline-none transition-colors duration-200 ${
              isActive
                ? 'text-volt-600 dark:text-volt-400 z-10'
                : 'text-slate-500 hover:text-slate-955 dark:hover:text-white'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="tabs-active-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/30 dark:border-white/5 rounded-md z-0"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
