import { ReactNode, useState, useEffect, useRef } from 'react';

export interface VfSplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  initialRatio?: number; // percentage
  minRatio?: number;
  maxRatio?: number;
  className?: string;
}

export default function VfSplitPane({
  left,
  right,
  initialRatio = 50,
  minRatio = 20,
  maxRatio = 80,
  className = '',
}: VfSplitPaneProps) {
  const [ratio, setRatio] = useState(initialRatio);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.MouseEvent) => {
    isDragging.current = true;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      let newRatio = (mouseX / containerRect.width) * 100;
      
      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));
      setRatio(newRatio);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minRatio, maxRatio]);

  return (
    <div ref={containerRef} className={`flex w-full h-full overflow-hidden ${className}`}>
      {/* Left Section */}
      <div style={{ width: `${ratio}%` }} className="h-full min-w-0">
        {left}
      </div>

      {/* Resize Handle Splitter */}
      <div
        onMouseDown={startDrag}
        className="w-1.5 bg-slate-200 hover:bg-volt-500/50 active:bg-volt-500 cursor-col-resize border-x border-slate-300/60 dark:bg-slate-900 dark:border-white/5 flex-shrink-0 z-10 transition-colors"
      />

      {/* Right Section */}
      <div style={{ width: `${100 - ratio}%` }} className="h-full min-w-0">
        {right}
      </div>
    </div>
  );
}
