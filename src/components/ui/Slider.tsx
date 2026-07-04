export interface SliderProps {
  className?: string
  max?: number
  min?: number
  onChange: (value: number) => void
  step?: number
  value: number
}

export function Slider({
  className = '',
  max = 100,
  min = 0,
  onChange,
  step = 1,
  value,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className={`vf-slider ${className}`}>
      <input
        type="range"
        className="vf-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--vf-slider-pct': `${pct}%` } as React.CSSProperties}
      />
    </div>
  )
}
