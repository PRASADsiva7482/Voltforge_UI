import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { DigitalDisplay } from '../../components/ui/DigitalDisplay'
import { Tabs } from '../../components/ui/Tabs'

interface Props {
  current?: number
  isOpen: boolean
  onClose: () => void
  resistance?: number
  voltage?: number
}

type MeterMode = 'V' | 'A' | 'OHM'

export default function MultimeterPanel({
  current = 0,
  isOpen,
  onClose,
  resistance = 0,
  voltage = 0,
}: Props) {
  const [mode, setMode] = useState<MeterMode>('V')

  if (!isOpen) return null

  const reading = mode === 'V' ? voltage : mode === 'A' ? current : resistance
  const unit = mode === 'V' ? 'V' : mode === 'A' ? 'mA' : 'ohm'
  const displayValue = reading.toFixed(2)

  const tabItems = [
    { id: 'V', label: 'V' },
    { id: 'A', label: 'A' },
    { id: 'OHM', label: 'Ω' },
  ]

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Multimeter"
      icon={<Gauge size={14} className="vf-pulse-dot" />}
      width="240px"
    >
      <div className="vf-multimeter-content">
        <DigitalDisplay
          value={displayValue}
          unit={unit}
          label="Auto Range"
          indicator={<span className="vf-pulse-dot" />}
          className="vf-multimeter-display"
        />
        <Tabs
          items={tabItems}
          value={mode}
          onChange={(id) => setMode(id as MeterMode)}
          className="vf-multimeter-tabs"
        />
        <p className="vf-multimeter-hint">
          Click two pins on the canvas to measure
        </p>
      </div>
    </FloatingPanel>
  )
}
export { MultimeterPanel }
