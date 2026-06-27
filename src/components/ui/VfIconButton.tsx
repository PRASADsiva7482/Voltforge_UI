import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

export interface VfIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  active?: boolean;
  variant?: 'idle' | 'active' | 'bloom';
  title?: string;
}

const VfIconButton = forwardRef<HTMLButtonElement, VfIconButtonProps>(
  ({ icon, active = false, variant = 'idle', title, className = '', ...rest }, ref) => {
    const baseClass = 'p-2.5 rounded-xl border transition-all duration-200 outline-none flex items-center justify-center cursor-pointer';

    const variantStyles = {
      idle: 'bg-white/70 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-955 hover:border-slate-300 dark:bg-surface-800/50 dark:border-surface-700/50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-surface-700 dark:hover:border-surface-600',
      active: 'bg-white border-volt-500/30 text-slate-955 dark:bg-surface-700 dark:border-surface-600 dark:text-white shadow-[0_0_12px_rgba(34,197,94,0.15)]',
      bloom: 'p-2.5 rounded-xl border transition-all bloom-hover bg-white/70 border-slate-200 text-slate-600 hover:shadow-[0_0_16px_rgba(34,197,94,0.2),0_0_40px_rgba(34,197,94,0.1)] hover:border-volt-500/25 hover:translate-y-[-1px] dark:bg-surface-800/50 dark:border-surface-700/50 dark:text-slate-300 dark:hover:text-white',
    };

    const finalStyle = active ? variantStyles.active : variantStyles[variant];

    return (
      <button
        ref={ref}
        className={`${baseClass} ${finalStyle} ${className}`}
        title={title}
        {...rest}
      >
        <span className="w-4 h-4 shrink-0 flex items-center justify-center">{icon}</span>
      </button>
    );
  }
);

VfIconButton.displayName = 'VfIconButton';

export default VfIconButton;
