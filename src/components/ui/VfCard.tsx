import { ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface VfCardProps {
  children: ReactNode;
  className?: string;
  animate?: boolean;
  hoverGlow?: 'volt' | 'forge' | 'none';
  onClick?: () => void;
}

export default function VfCard({
  children,
  className = '',
  animate = false,
  hoverGlow = 'none',
  onClick,
}: VfCardProps) {
  const glowStyles = {
    volt: 'hover:glow-volt hover:border-volt-500/20',
    forge: 'hover:glow-forge hover:border-forge-500/20',
    none: 'hover:border-slate-300 dark:hover:border-white/10',
  };

  const baseStyles = [
    'glass rounded-2xl p-8 border border-slate-200 dark:border-white/5',
    'bg-white/70 dark:bg-slate-900/40 backdrop-blur-md shadow-sm',
    'transition-all duration-300',
    onClick ? 'cursor-pointer hover:shadow-xl' : '',
    hoverGlow !== 'none' ? glowStyles[hoverGlow] : '',
    className,
  ].join(' ');

  if (animate) {
    return (
      <motion.div
        whileHover={onClick ? { y: -4, scale: 1.005 } : undefined}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        onClick={onClick}
        className={baseStyles}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div onClick={onClick} className={baseStyles}>
      {children}
    </div>
  );
}
