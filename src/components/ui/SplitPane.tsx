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

  const startTouchDrag = (e: React.TouchEvent) => {
    isDragging.current = true
    if (e.touches.length > 0) {
      updateRatio(e.touches[0].clientX)
    }
  }

  const updateRatio = (clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    let newRatio = ((clientX - rect.left) / rect.width) * 100
    newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio))
    setRatio(newRatio)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      updateRatio(e.clientX)
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length === 0) return
      updateRatio(e.touches[0].clientX)
    }

    const handleTouchEnd = () => {
      isDragging.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', handleTouchEnd)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [minRatio, maxRatio])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      setRatio((prev) => Math.max(minRatio, prev - 5))
    } else if (e.key === 'ArrowRight') {
      setRatio((prev) => Math.min(maxRatio, prev + 5))
    }
  }

  return (
    <div ref={containerRef} className={`vf-split-pane ${className}`}>
      <div className="vf-split-pane__left" style={{ width: `${ratio}%` }}>
        {left}
      </div>
      <div
        className="vf-split-pane__handle"
        onMouseDown={startDrag}
        onTouchStart={startTouchDrag}
        onKeyDown={handleKeyDown}
        role="separator"
        tabIndex={0}
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={minRatio}
        aria-valuemax={maxRatio}
        aria-orientation="vertical"
        aria-label="Resize panels"
      />
      <div className="vf-split-pane__right" style={{ width: `${100 - ratio}%` }}>
        {right}
      </div>
    </div>
  )
}
