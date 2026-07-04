export interface AvatarProps {
  className?: string
  color?: string
  name: string
  size?: 'sm' | 'md' | 'lg'
  src?: string
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'vf-avatar--sm',
  md: 'vf-avatar--md',
  lg: 'vf-avatar--lg',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function Avatar({ className = '', color, name, size = 'md', src }: AvatarProps) {
  return (
    <div
      className={`vf-avatar ${SIZE_CLASS[size] ?? ''} ${className}`}
      style={color ? { backgroundColor: color } : undefined}
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="vf-avatar__img" />
      ) : (
        <span className="vf-avatar__initials">{initials(name)}</span>
      )}
    </div>
  )
}

export interface AvatarGroupProps {
  className?: string
  max?: number
  users: { color?: string; name: string; src?: string }[]
}

export function AvatarGroup({ className = '', max = 4, users }: AvatarGroupProps) {
  const visible = users.slice(0, max)
  const overflow = users.length - max

  return (
    <div className={`vf-avatar-group ${className}`}>
      {visible.map((u) => (
        <Avatar key={u.name} name={u.name} src={u.src} color={u.color} size="sm" />
      ))}
      {overflow > 0 && (
        <div className="vf-avatar vf-avatar--sm vf-avatar--overflow">
          <span className="vf-avatar__initials">+{overflow}</span>
        </div>
      )}
    </div>
  )
}
