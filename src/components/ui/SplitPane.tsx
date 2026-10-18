import { type ReactNode, useState, useEffect, useRef } from 'react'

export interface SplitPaneProps {
  className?: string
  initialRatio?: number
  left: ReactNode
  maxRatio?: number
  minRatio?: number
  right: ReactNode
}

export function SplitPane({ className = '', initialRatio = 50, left, maxRatio = 80, minRatio = 20, right }: SplitPaneProps) {
  const [ratio, setRatio] = useState(initialRatio)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const stacked = size.width < 560
  const extent = Math.max(1, (stacked ? size.height : size.width) - 6)
  const minimum = Math.min(45, Math.max(minRatio, (stacked ? 100 : 240) / extent * 100))
  const maximum = Math.max(55, Math.min(maxRatio, 100 - (stacked ? 100 : 240) / extent * 100))
  const clamp = (value: number) => Math.max(minimum, Math.min(maximum, value))
  const effective = clamp(ratio)
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setRatio(clamp(((stacked ? event.clientY - rect.top : event.clientX - rect.left) / extent) * 100))
  }
  return <div ref={containerRef} className={`vf-split-pane ${stacked ? 'is-stacked' : ''} ${className}`}>
    <div className="vf-split-pane__left" style={{ flex: `${effective} 1 0` }}>{left}</div>
    <div className="vf-split-pane__handle" role="separator" tabIndex={0} aria-label="Resize panels" aria-orientation={stacked ? 'horizontal' : 'vertical'} aria-valuenow={Math.round(effective)} aria-valuemin={Math.round(minimum)} aria-valuemax={Math.round(maximum)}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }} onPointerMove={resize}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={event => { const keys = stacked ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']; if (keys.includes(event.key)) { event.preventDefault(); setRatio(clamp(effective + (event.key === keys[0] ? -5 : 5))) } }} />
    <div className="vf-split-pane__right" style={{ flex: `${100 - effective} 1 0` }}>{right}</div>
  </div>
}
