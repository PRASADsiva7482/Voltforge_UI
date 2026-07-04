import { useCallback, useState } from 'react'
import { Activity, Maximize2, Minimize2, Pause, Play } from 'lucide-react'
import { useSimulationStore } from '../../store/simulationStore'
import { OscilloscopeScreen } from '../../components/ui/OscilloscopeScreen'
import { SelectField } from '../../components/ui/Field'

interface Props {
  className?: string
}

export default function OscilloscopePanel({ className = '' }: Props) {
  const {
    oscilloscopeData,
    oscilloscopePanelOpen,
    setOscilloscopePanelOpen,
  } = useSimulationStore()

  const [expanded, setExpanded] = useState(false)
  const [paused, setPaused] = useState(false)
  const [voltsPerDiv, setVoltsPerDiv] = useState(1.0)
  const [timePerDiv, setTimePerDiv] = useState(1.0) // ms
  const [pausedData, setPausedData] = useState<Record<string, number[]>>({})

  const handlePauseToggle = useCallback(() => {
    if (!paused) {
      setPausedData({ ...oscilloscopeData })
    }
    setPaused(!paused)
  }, [paused, oscilloscopeData])

  if (!oscilloscopePanelOpen) return null

  const channels = paused ? pausedData : oscilloscopeData
  const channelKeys = Object.keys(channels)
  const panelHeight = expanded ? '320px' : '192px'

  return (
    <div
      className={`vf-oscilloscope-panel ${className}`}
      style={{ height: panelHeight }}
    >
      {/* Header */}
      <header className="vf-panel-header">
        <div className="vf-panel-header__left">
          <Activity size={14} className="vf-pulse-dot" />
          <span className="vf-panel-header__title">Oscilloscope</span>
        </div>
        <div className="vf-panel-header__actions">
          {/* V/div control */}
          <div className="vf-scope-control">
            <span className="vf-scope-control__label">V/div:</span>
            <SelectField
              value={voltsPerDiv}
              onChange={(e) => setVoltsPerDiv(Number(e.target.value))}
              className="vf-select-inline"
            >
              <option value={0.1}>0.1V</option>
              <option value={0.5}>0.5V</option>
              <option value={1.0}>1.0V</option>
              <option value={2.0}>2.0V</option>
              <option value={5.0}>5.0V</option>
            </SelectField>
          </div>

          {/* T/div control */}
          <div className="vf-scope-control">
            <span className="vf-scope-control__label">T/div:</span>
            <SelectField
              value={timePerDiv}
              onChange={(e) => setTimePerDiv(Number(e.target.value))}
              className="vf-select-inline"
            >
              <option value={0.1}>0.1ms</option>
              <option value={0.5}>0.5ms</option>
              <option value={1.0}>1ms</option>
              <option value={5.0}>5ms</option>
              <option value={10.0}>10ms</option>
              <option value={50.0}>50ms</option>
            </SelectField>
          </div>

          {/* Pause / Play */}
          <button
            onClick={handlePauseToggle}
            className="vf-panel-header__btn"
            title={paused ? 'Resume' : 'Pause'}
            type="button"
          >
            {paused ? (
              <Play size={12} style={{ color: '#22c55e' }} />
            ) : (
              <Pause size={12} />
            )}
          </button>

          {/* Expand / Collapse */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="vf-panel-header__btn"
            title={expanded ? 'Collapse' : 'Expand'}
            type="button"
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>

          {/* Close */}
          <button
            onClick={() => setOscilloscopePanelOpen(false)}
            className="vf-panel-header__btn"
            title="Close"
            type="button"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </header>

      {/* Screen area */}
      <div className="vf-oscilloscope-body">
        <OscilloscopeScreen
          data={channels}
          voltsPerDiv={voltsPerDiv}
          timePerDiv={timePerDiv}
          paused={paused}
        />
        {channelKeys.length === 0 && (
          <div className="vf-oscilloscope-empty">
            <span>No oscilloscope probes connected</span>
          </div>
        )}
        {paused && (
          <div className="vf-oscilloscope-paused-badge">
            PAUSED
          </div>
        )}
      </div>
    </div>
  )
}
export { OscilloscopePanel }
