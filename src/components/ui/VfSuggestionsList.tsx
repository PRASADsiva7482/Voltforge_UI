import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export interface VfSuggestionsListProps {
  suggestions: string[];
  onSelect: (val: string) => void;
  className?: string;
}

export default function VfSuggestionsList({
  suggestions,
  onSelect,
  className = '',
}: VfSuggestionsListProps) {
  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {suggestions.map((s) => (
        <motion.button
          key={s}
          onClick={() => onSelect(s)}
          whileHover={{ scale: 1.01, x: 2 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 hover:border-volt-500/30 hover:bg-slate-50/50 dark:bg-white/[0.03] dark:border-white/5 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:border-volt-500/20 hover:text-slate-955 dark:hover:text-white flex items-center gap-2.5 transition-colors outline-none cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 animate-pulse" />
          <span className="truncate">{s}</span>
        </motion.button>
      ))}
    </div>
  );
}
