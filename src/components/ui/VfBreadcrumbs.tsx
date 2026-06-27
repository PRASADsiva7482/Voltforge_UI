import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface VfBreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface VfBreadcrumbsProps {
  items: VfBreadcrumbItem[];
  icon?: ReactNode;
}

export default function VfBreadcrumbs({ items, icon }: VfBreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium select-none">
      {icon && <span className="text-volt-500 mr-0.5">{icon}</span>}
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={item.label} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
            {isLast ? (
              <span className="text-slate-955 dark:text-white font-bold tracking-tight">
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className="hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer outline-none"
              >
                {item.label}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
