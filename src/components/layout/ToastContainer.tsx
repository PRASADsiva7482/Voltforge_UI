import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { useToastStore, type ToastType } from '../../store/useToastStore';

/* ═══════════════════════════════════════════════════════════════════════════
   Toast — Redesigned with:
   • Larger icons (20px) for quick recognition
   • Subtle background tint per type
   • Auto-dismiss progress bar
   • Positioned below navbar to avoid overlap
   ═══════════════════════════════════════════════════════════════════════════ */

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />,
  error: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
  info: <Info className="w-5 h-5 text-sky-500 shrink-0" />,
};

const BG_TINT: Record<ToastType, string> = {
  success: 'bg-emerald-50/90 dark:bg-emerald-500/[0.06]',
  error: 'bg-red-50/90 dark:bg-red-500/[0.06]',
  warning: 'bg-amber-50/90 dark:bg-amber-500/[0.06]',
  info: 'bg-sky-50/90 dark:bg-sky-500/[0.06]',
};

const BORDER_COLOR: Record<ToastType, string> = {
  success: 'border-emerald-200/80 dark:border-emerald-500/20',
  error: 'border-red-200/80 dark:border-red-500/20',
  warning: 'border-amber-200/80 dark:border-amber-500/20',
  info: 'border-sky-200/80 dark:border-sky-500/20',
};

const PROGRESS_COLOR: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

const TOAST_DURATION = 4000; // ms

function ProgressBar({ type, duration }: { type: ToastType; duration: number }) {
  const [width, setWidth] = useState(100);

  useEffect(() => {
    // Trigger CSS transition on next frame
    const raf = requestAnimationFrame(() => setWidth(0));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-xl overflow-hidden bg-black/[0.04] dark:bg-white/[0.04]">
      <div
        className={`h-full ${PROGRESS_COLOR[type]} rounded-b-xl transition-all ease-linear`}
        style={{ width: `${width}%`, transitionDuration: `${duration}ms` }}
      />
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-20 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-auto relative flex items-start gap-3 px-5 py-4 rounded-xl border
              backdrop-blur-xl shadow-lg shadow-black/[0.06]
              max-w-sm ${BG_TINT[toast.type]} ${BORDER_COLOR[toast.type]}`}
          >
            {ICON_MAP[toast.type]}
            <p className="text-sm text-surface-800 dark:text-surface-200 leading-snug flex-1 font-medium">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-surface-400 hover:text-surface-700 dark:hover:text-white transition-colors shrink-0 p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
            <ProgressBar type={toast.type} duration={TOAST_DURATION} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
