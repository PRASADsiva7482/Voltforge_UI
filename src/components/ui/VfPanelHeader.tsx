import { ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface VfPanelHeaderProps {
  title: string;
  icon?: ReactNode;
  isOpen?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  actions?: ReactNode;
  className?: string;
}

export default function VfPanelHeader({
  title,
  icon,
  isOpen = true,
  onToggleCollapse,
  onClose,
  actions,
  className = '',
}: VfPanelHeaderProps) {
  return (
    <div className={`h-9 flex items-center justify-between px-3 bg-slate-50 border-b border-slate-200 dark:bg-surface-900/50 dark:border-white/5 shrink-0 select-none ${className}`}>
      <div className="flex items-center gap-2">
        {onToggleCollapse ? (
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-slate-700 hover:text-slate-955 dark:text-surface-300 dark:hover:text-white transition-colors outline-none focus:outline-none"
          >
            {icon && <span className="text-volt-500 shrink-0">{icon}</span>}
            <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            {icon && <span className="text-volt-500 shrink-0">{icon}</span>}
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-surface-300">{title}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/5 dark:hover:text-white text-slate-500 transition-colors outline-none"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
