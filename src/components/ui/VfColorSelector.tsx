import { Check } from 'lucide-react';

export interface VfColorOption {
  value: string;
  label: string;
}

export interface VfColorSelectorProps {
  value: string;
  onChange: (val: string) => void;
  options: VfColorOption[];
  className?: string;
}

export default function VfColorSelector({
  value,
  onChange,
  options,
  className = '',
}: VfColorSelectorProps) {
  return (
    <div className={`flex flex-wrap gap-2.5 ${className}`}>
      {options.map((opt) => {
        const isSelected = value.toLowerCase() === opt.value.toLowerCase();
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{ backgroundColor: opt.value }}
            className={`w-6 h-6 rounded-full relative flex items-center justify-center border hover:scale-110 active:scale-95 transition-all shadow-sm ${
              isSelected 
                ? 'border-white ring-2 ring-volt-500/50 scale-105 shadow-md' 
                : 'border-slate-200/80 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/20'
            }`}
            title={opt.label}
          >
            {isSelected && (
              <Check className="w-3.5 h-3.5 text-white mix-blend-difference drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
