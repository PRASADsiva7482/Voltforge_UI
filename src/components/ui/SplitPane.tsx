import { type ReactNode, useState, useEffect, useRef } from 'react'

export interface SplitPaneProps {
  className?: string
  initialRatio?: number
  left: ReactNode
  maxRatio?: number
  minRatio?: number
  right: ReactNode
}

export function SplitPane({
  className = '',
  initialRatio = 50,
  left,
  maxRatio = 80,
  minRatio = 20,
  right,
}: SplitPaneProps) {
  const [ratio, setRatio] = useState(initialRatio)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const startDrag = (e: React.MouseEvent) => {
    isDragging.current = true
    e.preventDefault()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let newRatio = ((e.clientX - rect.left) / rect.width) * 100
      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio))
      setRatio(newRatio)
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minRatio, maxRatio])

  return (
    <div ref={containerRef} className={`vf-split-pane ${className}`}>
      <div className="vf-split-pane__left" style={{ width: `${ratio}%` }}>
        {left}
      </div>
      <div className="vf-split-pane__handle" onMouseDown={startDrag} />
      <div className="vf-split-pane__right" style={{ width: `${100 - ratio}%` }}>
        {right}
      </div>
    </div>
  )
}
