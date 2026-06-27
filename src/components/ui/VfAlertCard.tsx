import { Check, X, Info, HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   VfAlertCard — Premium alert/card component matching the design in Image 3
   ═══════════════════════════════════════════════════════════════════════════ */

export type VfAlertCardType = 'success' | 'error' | 'warning' | 'info';

interface VfAlertCardProps {
  type: VfAlertCardType;
  message: ReactNode;
  className?: string;
}

const config = {
  success: {
    icon: <Check className="w-7 h-7 stroke-[3]" />,
    iconClass: 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/15 shadow-[0_0_24px_rgba(16,185,129,0.25)]',
    borderClass: 'border-emerald-500/20 dark:border-emerald-500/10',
  },
  error: {
    icon: <X className="w-7 h-7 stroke-[3]" />,
    iconClass: 'bg-red-500/10 text-red-500 dark:bg-red-500/15 shadow-[0_0_24px_rgba(239,68,68,0.25)]',
    borderClass: 'border-red-500/20 dark:border-red-500/10',
  },
  warning: {
    icon: <Info className="w-7 h-7 stroke-[3]" />,
    iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:bg-amber-500/15 shadow-[0_0_24px_rgba(245,158,11,0.25)]',
    borderClass: 'border-amber-500/20 dark:border-amber-500/10',
  },
  info: {
    icon: <HelpCircle className="w-7 h-7 stroke-[3]" />,
    iconClass: 'bg-sky-500/10 text-sky-500 dark:bg-sky-500/15 shadow-[0_0_24px_rgba(14,165,233,0.25)]',
    borderClass: 'border-sky-500/20 dark:border-sky-500/10',
  },
};

export default function VfAlertCard({ type, message, className = '' }: VfAlertCardProps) {
  const current = config[type];

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 rounded-[28px] border text-center transition-all duration-300
        bg-white dark:bg-slate-900/60 shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)]
        hover:shadow-xl dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]
        ${current.borderClass} ${className}`}
    >
      {/* Icon Circle */}
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-transform duration-300 hover:scale-105 ${current.iconClass}`}>
        {current.icon}
      </div>

      {/* Message */}
      <div className="text-[14px] font-bold text-slate-800 dark:text-slate-200 leading-relaxed max-w-[220px]">
        {message}
      </div>
    </div>
  );
}
