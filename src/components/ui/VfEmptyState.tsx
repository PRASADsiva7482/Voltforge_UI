import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import VfButton from './VfButton';

export interface VfEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onActionClick?: () => void;
  actionIcon?: ReactNode;
}

export default function VfEmptyState({
  icon,
  title,
  description,
  actionText,
  onActionClick,
  actionIcon,
}: VfEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-16 flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-white/10 text-center max-w-2xl mx-auto"
    >
      <div className="relative mb-5 flex items-center justify-center">
        {/* Glow backdrop behind the icon */}
        <div className="absolute inset-0 w-16 h-16 bg-volt-500/10 rounded-full blur-xl animate-pulse" />
        <div className="text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-white/[0.03] rounded-2xl relative z-10 border border-slate-200/50 dark:border-white/5">
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {actionText && onActionClick && (
        <VfButton variant="primary" size="md" onClick={onActionClick} icon={actionIcon}>
          {actionText}
        </VfButton>
      )}
    </motion.div>
  );
}
