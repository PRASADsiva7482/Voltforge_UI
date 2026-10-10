import { Activity, ArrowUpRight, Cpu, Layers, Sparkles, Zap } from 'lucide-react'
import { getNavItems } from '../../config/navigation'
import { Badge } from '../ui'

const previewProjects = [
  {
    id: 'proj-1',
    title: 'Automated Plant Irrigation',
    mcu: 'Arduino Uno R3',
    components: 'Soil Moisture · 5V Relay · 16x2 LCD',
    status: 'Simulating',
    statusTone: 'success' as const,
    voltage: '5.0V Active',
    updated: '2 mins ago',
  },
  {
    id: 'proj-2',
    title: 'Digital Logic Analyzer & Scope',
    mcu: 'Raspberry Pi RP2040',
    components: 'SSD1306 OLED · Rotary Encoder · Probe',
    status: 'Verified',
    statusTone: 'info' as const,
    voltage: '3.3V Logic',
    updated: '1 hour ago',
  },
  {
    id: 'proj-3',
    title: 'Quadruped Robot Servo Engine',
    mcu: 'ESP32-WROOM-32',
    components: '8x Servos · PCA9685 Driver · LiPo Sensor',
    status: 'Ready to Ship',
    statusTone: 'warning' as const,
    voltage: '7.4V Battery',
    updated: 'Yesterday',
  },
]

export function MenuPreview() {
  return (
    <div className="menu-preview">
      <div className="menu-preview__rail">
        <div className="menu-preview__rail-title">Navigation</div>
        {getNavItems().map((item, idx) => {
          const Icon = item.icon
          const isActive = idx === 0
          return (
            <span
              key={item.path}
              className={`menu-preview__rail-item ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </span>
          )
        })}
      </div>

      <div className="menu-preview__panel">
        <div className="menu-preview__panel-header">
          <div>
            <div className="menu-preview__badge-wrapper">
              <Badge tone="success" dot>
                Live Workspace Experience
              </Badge>
            </div>
            <h3 className="menu-preview__heading">Pick up where you left off.</h3>
            <p className="menu-preview__subtext">
              Jump straight into recent circuits, test live microcontroller code, or explore community hardware schematics.
            </p>
          </div>
        </div>

        <div className="menu-preview__grid">
          {previewProjects.map((p) => (
            <div className="menu-preview__card" key={p.id}>
              <div className="menu-preview__card-top">
                <div className="menu-preview__card-icon">
                  <Cpu size={18} />
                </div>
                <Badge tone={p.statusTone} dot>
                  {p.status}
                </Badge>
              </div>
              <h4 className="menu-preview__card-title">{p.title}</h4>
              <p className="menu-preview__card-mcu">{p.mcu}</p>
              <p className="menu-preview__card-parts">{p.components}</p>
              <div className="menu-preview__card-footer">
                <span className="menu-preview__card-voltage">
                  <Zap size={12} className="text-teal" />
                  {p.voltage}
                </span>
                <span className="menu-preview__card-updated">{p.updated}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="menu-preview__metrics">
          <div className="menu-preview__metric">
            <Sparkles size={14} className="text-teal" />
            <span>50+ Microcontrollers & Sensors</span>
          </div>
          <div className="menu-preview__metric">
            <Activity size={14} className="text-teal" />
            <span>Cycle-Accurate Transient Simulation</span>
          </div>
          <div className="menu-preview__metric">
            <Layers size={14} className="text-teal" />
            <span>Automated Netlist & BOM Routing</span>
          </div>
        </div>
      </div>
    </div>
  )
}
