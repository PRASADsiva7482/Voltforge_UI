export interface SkeletonProps {
  className?: string
  height?: string | number
  variant?: 'rect' | 'circle' | 'text'
  width?: string | number
}

const VARIANT_CLASS: Record<string, string> = {
  rect: 'vf-skeleton--rect',
  circle: 'vf-skeleton--circle',
  text: 'vf-skeleton--text',
}

export function Skeleton({
  className = '',
  height,
  variant = 'rect',
  width,
}: SkeletonProps) {
  return (
    <div
      className={`vf-skeleton ${VARIANT_CLASS[variant] ?? ''} ${className}`}
      style={{ width, height }}
    />
  )
}

export interface CardSkeletonProps {
  className?: string
}

/** Full-card placeholder skeleton with header + body lines */
export function CardSkeleton({ className = '' }: CardSkeletonProps) {
  return (
    <div className={`vf-card-skeleton ${className}`}>
      <Skeleton variant="rect" height={120} />
      <div className="vf-card-skeleton__body">
        <Skeleton variant="text" width="60%" height={14} />
        <Skeleton variant="text" width="80%" height={10} />
        <Skeleton variant="text" width="40%" height={10} />
      </div>
    </div>
  )
}
