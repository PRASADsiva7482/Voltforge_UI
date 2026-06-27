import { ReactNode } from 'react';
import { Terminal } from 'lucide-react';
import VfCopyButton from './VfCopyButton';

export interface VfCodeBlockProps {
  code: string;
  language?: string;
  actions?: ReactNode;
  className?: string;
}

export default function VfCodeBlock({
  code,
  language = 'cpp',
  actions,
  className = '',
}: VfCodeBlockProps) {
  return (
    <div className={`rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#06060c] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900/50 select-none">
        <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
          <Terminal className="w-3.5 h-3.5" />
          <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">{language}</span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <VfCopyButton text={code} className="border-none bg-transparent hover:bg-slate-100 dark:bg-transparent dark:hover:bg-white/5" />
        </div>
      </div>
      {/* Code Area */}
      <pre className="p-4 text-xs font-mono overflow-x-auto whitespace-pre custom-scrollbar text-slate-700 dark:text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}
