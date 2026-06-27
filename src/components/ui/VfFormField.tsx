import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface VfFormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  helperText?: string;
  characterCount?: string; // e.g. "45/50"
  children: ReactNode;
  className?: string;
}

export default function VfFormField({
  label,
  htmlFor,
  error,
  helperText,
  characterCount,
  children,
  className = '',
}: VfFormFieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
        >
          {label}
        </label>
        {characterCount && (
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
            {characterCount}
          </span>
        )}
      </div>

      <div className="relative">
        {children}
      </div>

      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-[10px] text-red-500 font-bold tracking-wide mt-0.5"
          >
            {error}
          </motion.p>
        ) : helperText ? (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {helperText}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
