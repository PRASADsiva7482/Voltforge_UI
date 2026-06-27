export interface VfSliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (val: number) => void;
  className?: string;
  showTicks?: boolean;
}

export default function VfSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  className = '',
  showTicks = false,
}: VfSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
      <div className="relative w-full h-5 flex items-center">
        {/* Track backdrop */}
        <div className="absolute inset-y-2 left-0 right-0 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-volt-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        {/* Thumb button */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer accent-volt-500"
        />
        
        <div
          className="absolute w-4 h-4 rounded-full bg-white dark:bg-slate-100 border-2 border-volt-500 shadow-md pointer-events-none hover:scale-110 active:scale-95 transition-transform"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>

      {showTicks && (
        <div className="flex justify-between text-[9px] text-slate-500 dark:text-slate-500 px-0.5 mt-0.5 font-medium select-none">
          <span>{min}</span>
          <span className="text-volt-500 dark:text-volt-400 font-bold">{value}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}
