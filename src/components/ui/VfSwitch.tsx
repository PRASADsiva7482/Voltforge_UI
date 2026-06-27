import { motion } from 'framer-motion';

export interface VfSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export default function VfSwitch({ checked, onChange, label, description }: VfSwitchProps) {
  return (
    <div className="flex items-start gap-3 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-volt-500/50 ${
          checked ? 'bg-volt-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md"
          style={{ x: checked ? '16px' : '0px' }}
        />
      </button>

      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="text-sm font-medium text-slate-800 dark:text-slate-300">{label}</span>}
          {description && <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</span>}
        </div>
      )}
    </div>
  );
}
