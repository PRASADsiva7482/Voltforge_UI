import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface VfDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  width?: string;
  align?: 'left' | 'right';
  className?: string;
}

export default function VfDropdown({
  isOpen,
  onClose,
  trigger,
  children,
  width = 'w-48',
  align = 'right',
  className = ''
}: VfDropdownProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <div onClick={(e) => { e.stopPropagation(); }} className="cursor-pointer">
        {trigger}
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Click-outside backing */}
            <div className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 ${width} bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50`}
            >
              <div onClick={() => onClose()}>{children}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
