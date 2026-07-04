import { type ReactNode, useEffect, useRef } from 'react'

export interface ContextMenuItem {
  destructive?: boolean
  icon?: ReactNode
  label: string
  onClick: () => void
}

export interface ContextMenuProps {
  isOpen: boolean
  items: ContextMenuItem[]
  onClose: () => void
  x: number
  y: number
}

export function ContextMenu({ isOpen, items, onClose, x, y }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div className="vf-context-menu-backdrop" onClick={onClose} />
      <div
        ref={menuRef}
        className="vf-context-menu"
        style={{ top: y, left: x }}
      >
        {items.map((item, idx) => (
          <button
            key={idx}
            type="button"
            className={`vf-context-menu__item ${item.destructive ? 'is-destructive' : ''}`}
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            {item.icon && <span className="vf-context-menu__icon">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
