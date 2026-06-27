import { ReactNode } from 'react';

export interface VfTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface VfTableProps<T> {
  data: T[];
  columns: VfTableColumn<T>[];
  keyExtractor: (row: T, index: number) => string;
  emptyState?: ReactNode;
  className?: string;
}

export default function VfTable({
  data,
  columns,
  keyExtractor,
  emptyState,
  className = '',
}: VfTableProps<any>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={`w-full overflow-x-auto rounded-xl border border-slate-200/60 dark:border-white/5 bg-white/30 dark:bg-slate-900/10 backdrop-blur-sm ${className}`}>
      <table className="w-full text-xs text-left border-collapse">
        <thead className="bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200/60 dark:border-white/5 text-[9px] text-slate-500 font-bold uppercase tracking-wider select-none">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`px-4 py-2.5 font-bold ${
                  col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
          {data.map((row, i) => (
            <tr
              key={keyExtractor(row, i)}
              className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2 text-slate-700 dark:text-slate-300 ${
                    col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.render ? col.render(row, i) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
