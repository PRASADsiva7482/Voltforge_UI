import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export interface VfPropertyItem {
  key: string;
  label: string;
  value: string | number;
  mono?: boolean;
  copyable?: boolean;
}

export interface VfPropertyGridProps {
  items: VfPropertyItem[];
  className?: string;
}

export default function VfPropertyGrid({ items, className = '' }: VfPropertyGridProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, val: string | number) => {
    navigator.clipboard.writeText(String(val));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs ${className}`}>
      {items.map((item) => (
        <div key={item.key} className="contents group">
          {/* Label */}
          <span className="text-slate-500 dark:text-slate-400 font-semibold truncate py-1 text-[10px] uppercase tracking-wider self-center">
            {item.label}
          </span>
          
          {/* Value Box */}
          <div className="flex items-center justify-between py-1 bg-transparent hover:bg-slate-100/50 dark:hover:bg-white/[0.02] px-2 rounded-lg transition-colors min-w-0">
            <span className={`text-slate-800 dark:text-slate-200 truncate ${item.mono ? 'font-mono text-[11px]' : 'font-medium'}`}>
              {item.value}
            </span>
            {item.copyable && (
              <button
                type="button"
                onClick={() => handleCopy(item.key, item.value)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all ml-2"
                title="Copy Value"
              >
                {copiedKey === item.key ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
