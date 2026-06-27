import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   VfButton — Project-wide reusable button component
   ═══════════════════════════════════════════════════════════════════════════
   Variants:  primary | secondary | ghost | danger | toolbar
   Sizes:     xs | sm | md | lg
   ═══════════════════════════════════════════════════════════════════════════ */

export type VfButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'toolbar';
export type VfButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface VfButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: VfButtonVariant;
  size?: VfButtonSize;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
}

/* ── Style Maps ──────────────────────────────────────────────────────────── */

const variantStyles: Record<VfButtonVariant, string> = {
  primary: [
    'bg-gradient-to-b from-volt-500 to-volt-600 text-white border-volt-500/30',
    'hover:from-volt-400 hover:to-volt-500',
    'hover:shadow-[0_0_20px_rgba(34,197,94,0.25),0_4px_12px_rgba(34,197,94,0.15)]',
    'hover:-translate-y-[1px]',
    'active:translate-y-0 active:shadow-none',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:hover:from-volt-500 disabled:hover:to-volt-600',
  ].join(' '),

  secondary: [
    'bg-white text-slate-700 border-slate-200',
    'hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300',
    'hover:shadow-sm hover:-translate-y-[1px]',
    'active:translate-y-0',
    'dark:bg-white/[0.05] dark:text-slate-300 dark:border-white/10',
    'dark:hover:bg-white/[0.08] dark:hover:text-white dark:hover:border-white/20',
    'disabled:opacity-40 disabled:cursor-not-allowed',
  ].join(' '),

  ghost: [
    'bg-transparent text-slate-600 border-transparent',
    'hover:bg-slate-100 hover:text-slate-900',
    'active:bg-slate-200',
    'dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white',
    'dark:active:bg-white/[0.1]',
    'disabled:opacity-40 disabled:cursor-not-allowed',
  ].join(' '),

  danger: [
    'bg-red-500/10 text-red-600 border-red-500/20',
    'hover:bg-red-500/20 hover:text-red-700 hover:border-red-500/30',
    'active:bg-red-500/25',
    'dark:text-red-400 dark:hover:text-red-300',
    'disabled:opacity-40 disabled:cursor-not-allowed',
  ].join(' '),

  toolbar: [
    'bg-transparent text-slate-500 border-transparent',
    'hover:bg-slate-100 hover:text-slate-900',
    'active:bg-slate-200',
    'dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white',
    'dark:active:bg-white/[0.1]',
    'disabled:opacity-30 disabled:cursor-not-allowed',
  ].join(' '),
};

const sizeStyles: Record<VfButtonSize, string> = {
  xs: 'h-8 px-4 text-[11px] font-medium gap-2 rounded-full',
  sm: 'h-9.5 px-5 text-xs font-semibold gap-2.5 rounded-full',
  md: 'h-11 px-7 text-sm font-semibold gap-3 rounded-full',
  lg: 'h-13 px-9 text-sm font-bold gap-3 rounded-full',
  xl: 'h-15 px-10 text-base font-bold gap-3.5 rounded-full',
};

const iconOnlySizes: Record<VfButtonSize, string> = {
  xs: 'h-8 w-8 rounded-full',
  sm: 'h-9.5 w-9.5 rounded-full',
  md: 'h-11 w-11 rounded-full',
  lg: 'h-13 w-13 rounded-full',
  xl: 'h-15 w-15 rounded-full',
};

/* ── Component ───────────────────────────────────────────────────────────── */

const VfButton = forwardRef<HTMLButtonElement, VfButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon,
      iconPosition = 'left',
      loading = false,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const isIconOnly = icon && !children;

    const baseStyles = [
      'inline-flex items-center justify-center',
      'border',
      'font-sans',
      'transition-all duration-200 ease-out',
      'select-none',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500/50 focus-visible:ring-offset-1',
      'dark:focus-visible:ring-offset-surface-950',
    ].join(' ');

    const classes = [
      baseStyles,
      variantStyles[variant],
      isIconOnly ? iconOnlySizes[size] : sizeStyles[size],
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} disabled={isDisabled} className={classes} {...rest}>
        {loading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>
        )}
        {children}
        {!loading && icon && iconPosition === 'right' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

VfButton.displayName = 'VfButton';

export default VfButton;
