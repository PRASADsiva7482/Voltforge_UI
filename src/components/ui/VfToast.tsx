import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type VfToastType = 'success' | 'error' | 'warning' | 'info';

export interface VfToastProps {
  id: string;
  type: VfToastType;
  message: string;
  onClose: (id: string) => void;
  duration?: number;
  className?: string;
}

const ICON_MAP = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />,
  error: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
  info: <Info className="w-5 h-5 text-sky-500 shrink-0" />,
};

const BG_TINT = {
  success: 'bg-emerald-50/90 dark:bg-emerald-500/[0.06] border-emerald-200/80 dark:border-emerald-500/20',
  error: 'bg-red-50/90 dark:bg-red-500/[0.06] border-red-200/80 dark:border-red-500/20',
  warning: 'bg-amber-50/90 dark:bg-amber-500/[0.06] border-amber-200/80 dark:border-amber-500/20',
  info: 'bg-sky-50/90 dark:bg-sky-500/[0.06] border-sky-200/80 dark:border-sky-500/20',
};

export default function VfToast({
  id,
  type,
  message,
  onClose,
  duration = 4000,
  className = '',
}: VfToastProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!duration) return;
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`pointer-events-auto relative flex items-start gap-3 px-5 py-4 rounded-xl border backdrop-blur-xl shadow-lg shadow-black/[0.06] max-w-sm ${BG_TINT[type]} ${className}`}
    >
      {ICON_MAP[type]}
      <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug flex-1 font-medium font-sans">
        {t(message)}
      </p>
      <button
        onClick={() => onClose(id)}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors shrink-0 p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 outline-none cursor-pointer"
        aria-label={t("Dismiss notification")}
      >
        <X className="w-4 h-4" />
      </button>
      {duration && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-xl overflow-hidden bg-black/[0.04] dark:bg-white/[0.04]">
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: 0 }}
            transition={{ duration: duration / 1000, ease: 'linear' }}
            className={`h-full rounded-b-xl ${
              type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
            }`}
          />
        </div>
      )}
    </motion.div>
  );
}
