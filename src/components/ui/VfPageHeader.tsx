import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

export interface VfPageHeaderProps {
  title: string;
  description?: string | ReactNode;
  icon?: ReactNode;
  iconGradient?: string;
  backText?: string;
  onBackClick?: () => void;
  actions?: ReactNode;
}

export default function VfPageHeader({
  title,
  description,
  icon,
  iconGradient = 'from-volt-500 to-forge-500',
  backText = 'Back',
  onBackClick,
  actions
}: VfPageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col md:flex-row md:items-center md:justify-between mb-10 gap-4"
    >
      <div>
        {onBackClick && (
          <button
            onClick={onBackClick}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors mb-6 text-sm dark:text-slate-400 dark:hover:text-white font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> {backText}
          </button>
        )}

        <div className="flex items-center gap-3">
          {icon && (
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center flex-shrink-0 text-white shadow-md shadow-volt-500/10`}>
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-slate-950 dark:text-white tracking-tight">
              {title}
            </h1>
            {description && (
              <div className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                {description}
              </div>
            )}
          </div>
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
          {actions}
        </div>
      )}
    </motion.div>
  );
}
