import { type ReactNode, useEffect, useRef, useState } from 'react'

export interface DropdownItem {
  destructive?: boolean
  icon?: ReactNode
  label: string
  onClick: () => void
}

export interface DropdownProps {
  items: DropdownItem[]
  trigger: ReactNode
}

export function Dropdown({ items, trigger }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  return (
    <div ref={ref} className="vf-dropdown">
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div className="vf-dropdown__menu">
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className={`vf-dropdown__item ${item.destructive ? 'is-destructive' : ''}`}
              onClick={() => {
                item.onClick()
                setIsOpen(false)
              }}
            >
              {item.icon && <span className="vf-dropdown__icon">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
