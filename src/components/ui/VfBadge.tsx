import { ReactNode } from 'react';

export type VfBadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';

export interface VfBadgeProps {
  children: ReactNode;
  variant?: VfBadgeVariant;
  icon?: ReactNode;
  className?: string;
}

const variantStyles: Record<VfBadgeVariant, string> = {
  primary: 'bg-volt-500/10 text-volt-600 border-volt-500/20 dark:text-volt-400',
  secondary: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  info: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
};

export default function VfBadge({
  children,
  variant = 'secondary',
  icon,
  className = '',
}: VfBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
