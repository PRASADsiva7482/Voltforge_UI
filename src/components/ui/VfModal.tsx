import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface VfModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const sizeWidths = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[94vw] h-[90vh]',
};

export default function VfModal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  size = 'md',
}: VfModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-955/60 backdrop-blur-md dark:bg-black/60"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 26 }}
            className={`relative w-full ${sizeWidths[size]} glass rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/70 bg-slate-50/70 dark:border-white/5 dark:bg-slate-900/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                {icon && <span className="text-volt-500">{icon}</span>}
                <h2 className="text-base font-bold text-slate-950 dark:text-white">{title}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-950 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 border-t border-slate-200/70 dark:border-white/5 flex-shrink-0 bg-slate-50/30 dark:bg-slate-950/20 flex justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
