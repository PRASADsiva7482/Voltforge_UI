import { ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface VfSelectableCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  iconGradient?: string;
  className?: string;
}

export default function VfSelectableCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  iconGradient = 'from-blue-500 to-cyan-500',
  className = '',
}: VfSelectableCardProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`p-5 rounded-2xl text-left transition-all duration-300 border w-full cursor-pointer outline-none ${
        selected
          ? 'glass border-volt-500/40 bg-volt-500/[0.02] shadow-[0_0_20px_rgba(34,197,94,0.15)] dark:bg-volt-500/[0.04]'
          : 'glass bg-white/70 hover:bg-slate-50 border-slate-200 hover:border-slate-300 dark:bg-slate-900/40 dark:border-white/5 dark:hover:bg-slate-800/40'
      } ${className}`}
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center flex-shrink-0 text-white shadow-md ${selected ? 'opacity-100 scale-105' : 'opacity-70'} transition-all`}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-955 dark:text-white truncate">{title}</h3>
          {description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">
              {description}
            </p>
          )}
        </div>
      </div>
    </motion.button>
  );
}
