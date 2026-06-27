import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export interface VfCollapsibleProps {
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
}

export default function VfCollapsible({
  isOpen,
  onToggle,
  title,
  icon,
  actions,
  children,
  headerClassName = '',
  bodyClassName = '',
}: VfCollapsibleProps) {
  return (
    <div className="flex flex-col border-b border-slate-200/50 dark:border-white/5">
      {/* Header Button */}
      <div className={`flex items-center justify-between px-3 py-2 bg-slate-50/50 dark:bg-surface-900/40 ${headerClassName}`}>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-slate-700 hover:text-slate-955 dark:text-surface-300 dark:hover:text-white transition-colors text-xs font-semibold uppercase tracking-wider select-none outline-none cursor-pointer"
        >
          {icon && <span className="text-volt-500">{icon}</span>}
          <span>{title}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
        </button>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Expandable Body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={`p-3 ${bodyClassName}`}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
