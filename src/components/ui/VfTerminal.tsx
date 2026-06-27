import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

export interface VfTerminalLine {
  text: string;
  type?: 'info' | 'error' | 'warning' | 'success';
}

export interface VfTerminalProps {
  lines: VfTerminalLine[];
  height?: string;
  emptyMessage?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export default function VfTerminal({
  lines,
  height = 'h-56',
  emptyMessage = 'No terminal output...',
  showLineNumbers = true,
  className = '',
}: VfTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  const typeColorClasses = {
    info: 'text-slate-300 dark:text-slate-300',
    error: 'text-red-400 font-bold',
    warning: 'text-amber-400',
    success: 'text-volt-400 font-bold',
  };

  return (
    <div className={`flex flex-col bg-[#05050c] border border-white/5 rounded-xl overflow-hidden font-mono text-[11px] leading-relaxed ${height} ${className}`}>
      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {lines.length === 0 ? (
          <div className="text-slate-500 italic select-none py-2 flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 opacity-60" /> {emptyMessage}
          </div>
        ) : (
          lines.map((line, index) => (
            <div key={index} className="flex gap-3 hover:bg-white/[0.02] px-1 rounded transition-colors">
              {showLineNumbers && (
                <span className="text-slate-600 select-none text-right w-6 flex-shrink-0 font-sans text-[10px]">
                  {index + 1}
                </span>
              )}
              <span className={`whitespace-pre-wrap break-words flex-1 ${typeColorClasses[line.type || 'info']}`}>
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
