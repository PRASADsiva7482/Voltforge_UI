import { motion } from 'framer-motion';

export interface Option<T> {
  value: T;
  label: string;
}

export interface VfSegmentedControlProps<T> {
  options: Option<T>[];
  selected: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function VfSegmentedControl<T extends string | number>({
  options,
  selected,
  onChange,
  className = ''
}: VfSegmentedControlProps<T>) {
  return (
    <div className={`flex p-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/5 rounded-xl gap-1 relative ${className}`}>
      {options.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative px-4 py-2 text-xs font-semibold rounded-lg select-none flex-1 transition-colors duration-200 outline-none cursor-pointer ${
              isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="segmented-pill"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="absolute inset-0 bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-200/30 dark:border-white/5 rounded-lg z-0"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
