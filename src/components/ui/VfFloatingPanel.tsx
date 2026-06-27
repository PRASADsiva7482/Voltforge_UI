import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VfPanelHeader from './VfPanelHeader';

export interface VfFloatingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  width?: string; // e.g. 'w-72', 'w-80', etc.
  children: ReactNode;
  footer?: ReactNode;
}

export default function VfFloatingPanel({
  isOpen,
  onClose,
  title,
  icon,
  width = 'w-80',
  children,
  footer
}: VfFloatingPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className={`absolute top-16 right-4 ${width} glass rounded-2xl overflow-hidden z-30 shadow-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl flex flex-col max-h-[80vh]`}
        >
          {/* Header */}
          <VfPanelHeader
            title={title}
            icon={icon}
            onClose={onClose}
          />

          {/* Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="p-3 border-t border-slate-200/70 dark:border-white/5 flex-shrink-0 bg-slate-50/30 dark:bg-slate-950/20">
              {footer}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
