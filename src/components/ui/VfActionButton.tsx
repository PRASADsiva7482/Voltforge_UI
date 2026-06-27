import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export interface VfActionButtonProps {
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  loading?: boolean;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}

export default function VfActionButton({
  onClick,
  children,
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  active = false,
  className = '',
}: VfActionButtonProps) {
  const baseClasses = 'flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer outline-none transition-all duration-205 select-none';

  const variants = {
    primary: 'bg-volt-500/10 text-volt-600 hover:bg-volt-500/20 dark:text-volt-400 border border-volt-500/20 shadow-[0_0_12px_rgba(34,197,94,0.05)]',
    success: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/20',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 border border-slate-200/50 dark:border-white/5',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:text-red-400 border border-red-500/20',
    ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-white',
  };

  return (
    <motion.button
      whileTap={!disabled && !loading ? { scale: 0.96 } : undefined}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseClasses} ${variants[variant]} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${active ? 'ring-2 ring-volt-500/50' : ''} ${className}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </motion.button>
  );
}
