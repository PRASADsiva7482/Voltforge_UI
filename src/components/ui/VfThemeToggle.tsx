import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

export interface VfThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
  className?: string;
}

export default function VfThemeToggle({ theme, onToggle, className = '' }: VfThemeToggleProps) {
  const isDark = theme === 'dark';

  return (
    <button
      onClick={onToggle}
      className={`p-2.5 rounded-xl border transition-all duration-300 bg-white/70 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-955 hover:border-slate-300 dark:bg-surface-800/50 dark:border-surface-700/50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-surface-700 dark:hover:border-surface-600 flex items-center justify-center overflow-hidden outline-none cursor-pointer ${className}`}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, scale: 0.8, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        exit={{ rotate: 90, scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="flex items-center justify-center"
      >
        {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </motion.div>
    </button>
  );
}
