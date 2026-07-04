export interface LoadingSpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'vf-spinner--sm',
  md: 'vf-spinner--md',
  lg: 'vf-spinner--lg',
}

export function LoadingSpinner({ className = '', size = 'md' }: LoadingSpinnerProps) {
  return (
    <div className={`vf-spinner ${SIZE_CLASS[size] ?? ''} ${className}`} role="status" aria-label="Loading">
      <svg viewBox="0 0 24 24" fill="none" className="vf-spinner__svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
