import VfCopyButton from './VfCopyButton';

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
              <VfCopyButton
                text={String(item.value)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded border-none bg-transparent hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent transition-all ml-2"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
