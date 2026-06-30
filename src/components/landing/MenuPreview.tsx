import { getNavItems } from '../../config/navigation'
import { Badge } from '../ui'

export function MenuPreview() {
  return (
    <div className="menu-preview">
      <div className="menu-preview__rail">
        {getNavItems('ADMIN').map((item) => {
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
        <h3>Legacy menus, cleaner shell.</h3>
        <p>Dashboard, projects, explore, settings, and admin stay familiar while UI2 gets a sharper system.</p>
      </div>
    </div>
  )
}
