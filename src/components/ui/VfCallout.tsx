import { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type VfCalloutType = 'success' | 'warning' | 'error' | 'info';

export interface VfCalloutProps {
  type: VfCalloutType;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

const config = {
  success: { icon: CheckCircle, classes: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-400 dark:bg-emerald-500/[0.03]' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-500/5 border-amber-500/20 text-amber-800 dark:text-amber-400 dark:bg-amber-500/[0.03]' },
  error: { icon: AlertTriangle, classes: 'bg-red-500/5 border-red-500/20 text-red-800 dark:text-red-400 dark:bg-red-500/[0.03]' },
  info: { icon: Info, classes: 'bg-sky-500/5 border-sky-500/20 text-sky-800 dark:text-sky-400 dark:bg-sky-500/[0.03]' },
};

export default function VfCallout({
  type,
  title,
  children,
  onClose,
  className = '',
}: VfCalloutProps) {
  const { t } = useTranslation();
  const { icon: Icon, classes } = config[type];
  
  return (
    <div className={`p-3.5 rounded-xl border flex gap-3.5 transition-all duration-200 hover:shadow-sm ${classes} ${className}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <h5 className="text-xs font-bold tracking-tight mb-0.5 uppercase">{title}</h5>}
        <div className="text-[10px] leading-relaxed font-medium opacity-90">{children}</div>
      </div>
      {onClose && (
        <button 
          onClick={onClose} 
          className="p-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100 transition-opacity self-start"
          title={t("Dismiss")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
