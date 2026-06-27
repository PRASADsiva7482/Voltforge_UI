import { forwardRef, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export interface VfSelectOption {
  value: string | number;
  label: string;
}

export interface VfSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: VfSelectOption[];
  error?: boolean;
}

const VfSelect = forwardRef<HTMLSelectElement, VfSelectProps>(
  ({ options, error = false, className = '', ...rest }, ref) => {
    const baseStyles = [
      'w-full pl-4 pr-10 py-2.5 bg-white/80 border',
      error ? 'border-red-500/50 focus:ring-red-500/30' : 'border-slate-200 focus:ring-volt-500/40 focus:border-volt-500/40',
      'text-sm text-slate-950 rounded-xl appearance-none cursor-pointer',
      'focus:outline-none focus:ring-2',
      'transition-all duration-200 ease-out',
      'dark:bg-white/[0.04] dark:border-white/10 dark:text-white',
      'dark:focus:ring-volt-500/30 dark:focus:border-volt-500/30',
    ].join(' ');

    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={`${baseStyles} ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
    );
  }
);

VfSelect.displayName = 'VfSelect';

export default VfSelect;
