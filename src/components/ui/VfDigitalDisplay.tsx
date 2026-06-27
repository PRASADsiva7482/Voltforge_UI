import { ReactNode } from 'react';

export interface VfDigitalDisplayProps {
  value: string | number;
  unit?: string;
  label?: string;
  indicator?: ReactNode;
  variant?: 'green' | 'amber' | 'cyan';
  className?: string;
}

const themeClasses = {
  green: 'text-volt-500 shadow-[0_0_15px_rgba(34,197,94,0.06)] bg-emerald-955/20 border-emerald-500/15',
  amber: 'text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.06)] bg-amber-955/20 border-amber-500/15',
  cyan: 'text-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.06)] bg-cyan-955/20 border-cyan-500/15',
};

export default function VfDigitalDisplay({
  value,
  unit,
  label,
  indicator,
  variant = 'green',
  className = '',
}: VfDigitalDisplayProps) {
  return (
    <div className={`rounded-2xl p-4 border flex flex-col justify-between backdrop-blur-sm ${themeClasses[variant]} ${className}`}>
      <div className="flex justify-between items-center mb-1.5 select-none">
        {label && <span className="text-[8px] font-extrabold uppercase tracking-widest opacity-60">{label}</span>}
        {indicator && <div className="flex items-center gap-1.5">{indicator}</div>}
      </div>
      <div className="text-right font-mono tracking-tight flex items-baseline justify-end">
        <span className="text-3xl font-black">{value}</span>
        {unit && <span className="text-xs font-bold opacity-70 ml-1.5 select-none uppercase">{unit}</span>}
      </div>
    </div>
  );
}
