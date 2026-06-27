import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   VfInput — Project-wide reusable input component
   ═══════════════════════════════════════════════════════════════════════════
   Sizes:  sm | md | lg
   ═══════════════════════════════════════════════════════════════════════════ */

export type VfInputSize = 'sm' | 'md' | 'lg';

interface VfInputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: VfInputSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Use for textarea-like inputs — renders a taller single-line input */
  fullWidth?: boolean;
}

const sizeStyles: Record<VfInputSize, string> = {
  sm: 'h-8 text-xs rounded-lg',
  md: 'h-10 text-sm rounded-xl',
  lg: 'h-12 text-sm rounded-xl',
};

const paddingStyles: Record<VfInputSize, { base: string; withIconLeft: string }> = {
  sm: { base: 'px-3', withIconLeft: 'pl-9 pr-3' },
  md: { base: 'px-4', withIconLeft: 'pl-10 pr-4' },
  lg: { base: 'px-5', withIconLeft: 'pl-12 pr-5' },
};

const iconSizes: Record<VfInputSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const iconLeftPositions: Record<VfInputSize, string> = {
  sm: 'left-3',
  md: 'left-3.5',
  lg: 'left-4',
};

/* ── Component ───────────────────────────────────────────────────────────── */

const VfInput = forwardRef<HTMLInputElement, VfInputProps>(
  (
    {
      inputSize = 'md',
      iconLeft,
      iconRight,
      fullWidth = true,
      className = '',
      ...rest
    },
    ref
  ) => {
    const baseStyles = [
      'bg-white/80 border border-surface-200',
      'text-surface-950 placeholder-surface-500',
      'font-sans',
      'focus:outline-none focus:ring-2 focus:ring-volt-500/40 focus:border-volt-500/40',
      'transition-all duration-200',
      'dark:bg-white/[0.04] dark:border-white/10 dark:text-white dark:placeholder-surface-500',
      'dark:focus:ring-volt-500/30 dark:focus:border-volt-500/30',
    ].join(' ');

    const padding = iconLeft
      ? paddingStyles[inputSize].withIconLeft
      : paddingStyles[inputSize].base;

    const classes = [
      baseStyles,
      sizeStyles[inputSize],
      padding,
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={`relative ${fullWidth ? 'w-full' : 'inline-flex'}`}>
        {iconLeft && (
          <div className={`absolute inset-y-0 ${iconLeftPositions[inputSize]} flex items-center pointer-events-none text-surface-400`}>
            <span className={iconSizes[inputSize]}>{iconLeft}</span>
          </div>
        )}
        <input ref={ref} className={classes} {...rest} />
        {iconRight && (
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-surface-400">
            <span className={iconSizes[inputSize]}>{iconRight}</span>
          </div>
        )}
      </div>
    );
  }
);

VfInput.displayName = 'VfInput';

export default VfInput;
