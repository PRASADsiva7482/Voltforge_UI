import { useRef, useState, type ReactNode } from 'react'

/** A flow-layout dock: resizing never remounts the editor or its conversation. */
export function EditorDock({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(360)
  const start = useRef({ x: 0, width: 360 })
  const clamp = (value: number) => Math.max(320, Math.min(520, value))
  return <aside className="vf-editor__ai-dock" aria-label="AI workspace panel" style={{ width }}>
    <div className="vf-editor__dock-handle" role="separator" aria-label="Resize AI panel" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={520} aria-valuenow={width} tabIndex={0}
      onPointerDown={event => { start.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(clamp(start.current.width + start.current.x - event.clientX)) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(value => clamp(value + (event.key === 'ArrowLeft' ? 24 : -24))) } }} />
    {children}
  </aside>
}
