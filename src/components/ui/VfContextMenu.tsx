import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface VfContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

export interface VfContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  x: number;
  y: number;
  items: VfContextMenuItem[];
}

export default function VfContextMenu({
  isOpen,
  onClose,
  x,
  y,
  items,
}: VfContextMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Click layer */}
          <div className="fixed inset-0 z-45" onClick={onClose} />
          
          {/* Popup Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ top: y, left: x }}
            className="fixed z-50 min-w-44 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl py-1 backdrop-blur-md overflow-hidden"
          >
            {items.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-white/5 ${
                  item.destructive 
                    ? 'text-red-500 hover:bg-red-500/10' 
                    : 'text-slate-700 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {item.icon && <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
