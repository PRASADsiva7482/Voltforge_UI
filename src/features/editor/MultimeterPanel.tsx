import { useState, useEffect, useRef } from 'react'
import { Gauge, Volume2, VolumeX, Disc, RefreshCw } from 'lucide-react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { DigitalDisplay } from '../../components/ui/DigitalDisplay'
import { Tabs } from '../../components/ui/Tabs'

interface Props {
  current?: number
  isOpen: boolean
  onClose: () => void
  resistance?: number
  voltage?: number
  redProbePin?: string
  blackProbePin?: string
}

type MeterMode = 'V_DC' | 'V_AC' | 'mA' | 'OHM' | 'CONT'

export default function MultimeterPanel({
  current = 0,
  isOpen,
  onClose,
  resistance = 0,
  voltage = 0,
  redProbePin = 'Probe (+)',
  blackProbePin = 'Probe (-)',
}: Props) {
  const [mode, setMode] = useState<MeterMode>('V_DC')
  const [isHold, setIsHold] = useState(false)
  const [holdValue, setHoldValue] = useState<number | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioContextRef = useRef<AudioContext | null>(null)

  const isContinuityShort = mode === 'CONT' && resistance < 5.0 && resistance >= 0

  // Handle continuity buzzer sound
  useEffect(() => {
    if (isContinuityShort && soundEnabled && isOpen) {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
        }
        const ctx = audioContextRef.current
        if (ctx.state === 'suspended') ctx.resume()

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(2400, ctx.currentTime) // 2.4kHz DMM beep
        gain.gain.setValueAtTime(0.1, ctx.currentTime)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.1)
      } catch {}
    }
  }, [isContinuityShort, soundEnabled, isOpen])

  if (!isOpen) return null

  let rawReading = 0
  let unit = 'V'

  if (mode === 'V_DC') {
    rawReading = voltage
    unit = 'V DC'
  } else if (mode === 'V_AC') {
    rawReading = Math.abs(voltage * 0.707) // RMS approximation
    unit = 'V AC'
  } else if (mode === 'mA') {
    rawReading = current
    unit = 'mA'
  } else if (mode === 'OHM') {
    rawReading = resistance
    unit = resistance >= 1000 ? 'kΩ' : 'Ω'
    if (resistance >= 1000) rawReading /= 1000
  } else if (mode === 'CONT') {
    rawReading = resistance
    unit = 'Ω'
  }

  const displayReading = isHold && holdValue !== null ? holdValue : rawReading
  const displayString = mode === 'CONT'
    ? (isContinuityShort ? '0.00 BEEP' : 'OPEN')
    : displayReading.toFixed(2)

  const tabItems = [
    { id: 'V_DC', label: 'V⎓' },
    { id: 'V_AC', label: 'V~' },
    { id: 'mA', label: 'mA' },
    { id: 'OHM', label: 'Ω' },
    { id: 'CONT', label: '🔊' },
  ]

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Digital Multimeter (DMM)"
      icon={<Gauge size={14} className="vf-pulse-dot" />}
      width="280px"
    >
      <div className="vf-multimeter-content" style={{ padding: '8px' }}>
        {/* Top controls: Hold & Sound */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              if (isHold) {
                setIsHold(false)
                setHoldValue(null)
              } else {
                setIsHold(true)
                setHoldValue(rawReading)
              }
            }}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              background: isHold ? '#f59e0b' : '#334155',
              color: isHold ? '#000' : '#e2e8f0',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {isHold ? 'HOLD ACTIVE' : 'DATA HOLD'}
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: 'transparent',
              border: 'none',
              color: soundEnabled ? '#22c55e' : '#64748b',
              cursor: 'pointer'
            }}
            title={soundEnabled ? 'Buzzer Sound On' : 'Buzzer Sound Muted'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>

        {/* Digital LCD Display with Backlight */}
        <div style={{
          background: isContinuityShort ? 'rgba(34, 197, 94, 0.15)' : '#0f172a',
          border: isContinuityShort ? '1px solid #22c55e' : '1px solid #334155',
          borderRadius: '6px',
          padding: '10px',
          textAlign: 'right',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          transition: 'all 0.15s ease'
        }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
            <span>AUTO RANGE</span>
            <span>{unit}</span>
          </div>
          <div style={{
            fontSize: '28px',
            fontFamily: 'monospace',
            fontWeight: 700,
            color: isContinuityShort ? '#22c55e' : '#38bdf8',
            letterSpacing: '1px',
            marginTop: '4px'
          }}>
            {displayString}
          </div>
        </div>

        {/* Rotary Function Selector Tabs */}
        <div style={{ marginTop: '10px' }}>
          <Tabs
            items={tabItems}
            value={mode}
            onChange={(id) => {
              setMode(id as MeterMode)
              setIsHold(false)
            }}
            className="vf-multimeter-tabs"
          />
        </div>

        {/* Probe Attachment Indicators */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '12px',
          padding: '6px 8px',
          background: '#1e293b',
          borderRadius: '4px',
          fontSize: '11px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
            <span>{redProbePin}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#000000', border: '1px solid #64748b' }} />
            <span>{blackProbePin}</span>
          </div>
        </div>

        <p className="vf-multimeter-hint" style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', marginTop: '6px' }}>
          Attach probe clips to pins on the canvas to measure
        </p>
      </div>
    </FloatingPanel>
  )
}
export { MultimeterPanel }
