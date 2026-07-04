export interface ColorSelectorProps {
  className?: string
  colors: string[]
  onChange: (color: string) => void
  value: string
}

export function ColorSelector({ className = '', colors, onChange, value }: ColorSelectorProps) {
  return (
    <div className={`vf-color-selector ${className}`}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={`vf-color-selector__swatch ${value === color ? 'is-active' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          title={color}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  )
}
