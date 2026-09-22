import { getNavItems } from '../../config/navigation'
import { Badge } from '../ui'

export function MenuPreview() {
  return (
    <div className="menu-preview">
      <div className="menu-preview__rail">
        {getNavItems().map((item) => {
          const Icon = item.icon
          return (
            <span key={item.path}>
              <Icon size={17} />
              {item.label}
            </span>
          )
        })}
      </div>
      <div className="menu-preview__panel">
        <Badge tone="success">After login</Badge>
        <h3>Pick up where you left off.</h3>
        <p>Open recent projects, find a starting point in Explore, or build your skills in Challenge Labs.</p>
      </div>
    </div>
  )
}
