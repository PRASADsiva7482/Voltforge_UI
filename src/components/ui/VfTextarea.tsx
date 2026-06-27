import { forwardRef, TextareaHTMLAttributes } from 'react';

export interface VfTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const VfTextarea = forwardRef<HTMLTextAreaElement, VfTextareaProps>(
  ({ error = false, className = '', rows = 3, ...rest }, ref) => {
    const baseStyles = [
      'w-full px-4 py-3 bg-white/80 border',
      error ? 'border-red-500/50 focus:ring-red-500/30' : 'border-slate-200 focus:ring-volt-500/40 focus:border-volt-500/40',
      'text-sm text-slate-950 placeholder-slate-400 rounded-xl',
      'focus:outline-none focus:ring-2',
      'transition-all duration-200 ease-out resize-none',
      'dark:bg-white/[0.04] dark:border-white/10 dark:text-white dark:placeholder-slate-500',
      'dark:focus:ring-volt-500/30 dark:focus:border-volt-500/30',
      'custom-scrollbar',
    ].join(' ');

    return (
      <textarea
        ref={ref}
        rows={rows}
        className={`${baseStyles} ${className}`}
        {...rest}
      />
    );
  }
);

VfTextarea.displayName = 'VfTextarea';

export default VfTextarea;
