import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import VfInput from './VfInput';

export interface VfSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  hotkey?: string; // e.g. "/" or "k"
  className?: string;
}

export default function VfSearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  hotkey = '/',
  className = '',
}: VfSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hotkey) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === hotkey && document.activeElement !== inputRef.current) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hotkey]);

  return (
    <div className={`relative w-full ${className}`}>
      <VfInput
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        iconLeft={<Search className="w-4 h-4 text-slate-400" />}
        className="pr-12"
      />
      <div className="absolute right-3.5 inset-y-0 flex items-center gap-1.5 pointer-events-none">
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="pointer-events-auto p-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          hotkey && (
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-1.5 font-mono text-[9px] font-medium text-slate-400">
              <span>{hotkey}</span>
            </kbd>
          )
        )}
      </div>
    </div>
  );
}
