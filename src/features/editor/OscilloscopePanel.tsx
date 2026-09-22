import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useSimulationStore } from '../../store/simulationStore'
import { OscilloscopeScreen } from '../../components/ui/OscilloscopeScreen'
import { SelectField } from '../../components/ui/Field'
import { SIMULATION_MODELS } from '../simulator/simulationModels'
import { analyzeProtocols } from '../simulator/logic/protocolAnalyzers'

interface Props {
  className?: string
  onPause?: () => void
  onResume?: () => void
  onStep?: () => void
  simulationPaused?: boolean
}

type ScopeMode = 'oscilloscope' | 'logic_analyzer' | 'dual'

export default function OscilloscopePanel({ className = '', onPause, onResume, onStep, simulationPaused }: Props) {
  const oscilloscopeData = useSimulationStore((s) => s.oscilloscopeData)
  const logicCapture = useSimulationStore((s) => s.logicCapture)
  const oscilloscopeSamplePeriodMs = useSimulationStore((s) => s.oscilloscopeSamplePeriodMs)
  const timePerDiv = useSimulationStore((s) => s.oscilloscopeTimePerDivMs)
  const setTimePerDiv = useSimulationStore((s) => s.setOscilloscopeTimePerDiv)
  const baudRate = useSimulationStore((s) => s.baudRate)
  const oscilloscopePanelOpen = useSimulationStore((s) => s.oscilloscopePanelOpen)
  const setOscilloscopePanelOpen = useSimulationStore((s) => s.setOscilloscopePanelOpen)

  const [mode, setMode] = useState<ScopeMode>('oscilloscope')
  const [expanded, setExpanded] = useState(false)
  const [paused, setPaused] = useState(false)
  const [voltsPerDiv, setVoltsPerDiv] = useState(1.0)
  const [pausedData, setPausedData] = useState<Record<string, number[]>>({})
  const [pausedLogicCapture, setPausedLogicCapture] = useState<typeof logicCapture>([])
  const [audioEnabled, setAudioEnabled] = useState(false)
  const volume = SIMULATION_MODELS.audio.maxVolume

  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscNodeRef = useRef<OscillatorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

  const effectivePaused = simulationPaused ?? paused

  const deriveTone = useCallback((samples: number[]) => {
    if (samples.length < 4 || !Number.isFinite(oscilloscopeSamplePeriodMs) || oscilloscopeSamplePeriodMs <= 0) return null
    const recent = samples.slice(-512)
    const mean = recent.reduce((sum, sample) => sum + sample, 0) / recent.length
    const centered = recent.map((sample) => sample - mean)
    const rms = Math.sqrt(centered.reduce((sum, sample) => sum + sample * sample, 0) / centered.length)
    let crossings = 0
    for (let index = 1; index < centered.length; index += 1) {
      if (centered[index - 1] <= 0 && centered[index] > 0) crossings += 1
    }
    const durationSeconds = (centered.length - 1) * oscilloscopeSamplePeriodMs / 1000
    const frequency = durationSeconds > 0 ? crossings / durationSeconds : 0
    return {
      frequency: Math.max(20, Math.min(SIMULATION_MODELS.audio.maxFrequencyHz, frequency)),
      gain: Math.max(0, Math.min(volume, rms / Math.max(1, voltsPerDiv * 4) * volume)),
    }
  }, [oscilloscopeSamplePeriodMs, voltsPerDiv, volume])

  const toggleAudio = useCallback(() => {
    if (audioEnabled) {
      gainNodeRef.current?.gain.setValueAtTime(0, audioCtxRef.current?.currentTime || 0)
      setAudioEnabled(false)
    } else {
      const tone = deriveTone(Object.values(oscilloscopeData)[0] || [])
      if (!tone) return
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(tone.frequency, ctx.currentTime)
        gain.gain.setValueAtTime(tone.gain, ctx.currentTime)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        audioCtxRef.current = ctx
        oscNodeRef.current = osc
        gainNodeRef.current = gain
      } else {
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume()
        }
        gainNodeRef.current?.gain.setValueAtTime(volume, audioCtxRef.current.currentTime)
      }
      setAudioEnabled(true)
    }
  }, [audioEnabled, deriveTone, oscilloscopeData, volume])

  useEffect(() => {
    if (!audioEnabled || !audioCtxRef.current || !oscNodeRef.current || !gainNodeRef.current) return
    const tone = deriveTone(Object.values(oscilloscopeData)[0] || [])
    const now = audioCtxRef.current.currentTime
    if (!tone) {
      gainNodeRef.current.gain.setTargetAtTime(0, now, 0.03)
      return
    }
    oscNodeRef.current.frequency.setTargetAtTime(tone.frequency, now, 0.03)
    gainNodeRef.current.gain.setTargetAtTime(tone.gain, now, 0.03)
  }, [audioEnabled, deriveTone, oscilloscopeData, oscilloscopeSamplePeriodMs])

  useEffect(() => {
    if (effectivePaused && !paused) {
      setPausedData({ ...oscilloscopeData })
      setPausedLogicCapture([...logicCapture])
    }
  }, [effectivePaused, paused, oscilloscopeData, logicCapture])

  const handlePauseToggle = useCallback(() => {
    if (!effectivePaused) {
      setPausedData({ ...oscilloscopeData })
      setPausedLogicCapture([...logicCapture])
      onPause?.()
    } else {
      onResume?.()
    }
    setPaused(!effectivePaused)
  }, [effectivePaused, logicCapture, onPause, onResume, oscilloscopeData])

  const channels = effectivePaused ? pausedData : oscilloscopeData
  const activeLogicCapture = effectivePaused ? pausedLogicCapture : logicCapture
  const channelKeys = useMemo(() => Object.keys(channels), [channels])
  const logicChannelKeys = useMemo(() => {
    const keys = new Set<string>(Object.keys(activeLogicCapture[activeLogicCapture.length - 1]?.channels || {}))
    channelKeys.forEach((key) => keys.add(key))
    return Array.from(keys).slice(0, 8)
  }, [activeLogicCapture, channelKeys])
  const protocolAnalysis = useMemo(
    () => analyzeProtocols(activeLogicCapture, logicChannelKeys, baudRate),
    [activeLogicCapture, logicChannelKeys, baudRate],
  )

  if (!oscilloscopePanelOpen) return null

  const panelHeight = expanded ? '380px' : '220px'

  return (
    <div
      className={`vf-oscilloscope-panel ${className}`}
      style={{ height: panelHeight }}
    >
      {/* Header */}
      <header className="vf-panel-header">
        <div className="vf-panel-header__left">
          <Activity size={14} className="vf-pulse-dot" />
          <span className="vf-panel-header__title">Logic & Scope Analyzer</span>
          
          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '12px' }}>
            <button
              type="button"
              className={`vf-panel-tab-btn ${mode === 'oscilloscope' ? 'active' : ''}`}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: mode === 'oscilloscope' ? '#334155' : 'transparent',
                color: mode === 'oscilloscope' ? '#38bdf8' : '#94a3b8',
                border: 'none',
                cursor: 'pointer'
              }}
              onClick={() => setMode('oscilloscope')}
            >
              Analog Scope
            </button>
            <button
              type="button"
              className={`vf-panel-tab-btn ${mode === 'logic_analyzer' ? 'active' : ''}`}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: mode === 'logic_analyzer' ? '#334155' : 'transparent',
                color: mode === 'logic_analyzer' ? '#22c55e' : '#94a3b8',
                border: 'none',
                cursor: 'pointer'
              }}
              onClick={() => setMode('logic_analyzer')}
            >
              Digital Logic
            </button>
          </div>
        </div>

        <div className="vf-panel-header__actions">
          {/* WebAudio Simulation Sound Synthesizer */}
          <button
            type="button"
            onClick={toggleAudio}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: audioEnabled ? '#10b981' : '#334155',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
            title={audioEnabled ? 'Mute simulated circuit audio' : 'Enable live WebAudio SPICE tone synthesizer'}
          >
            {audioEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {audioEnabled ? 'Audio: ON' : 'Audio: OFF'}
          </button>


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
              onChange={(e) => {
                setTimePerDiv(Number(e.target.value))
                if (effectivePaused) {
                  setPausedData({})
                  setPausedLogicCapture([])
                }
              }}
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
            title={effectivePaused ? 'Resume' : 'Pause'}
            type="button"
          >
            {effectivePaused ? (
              <Play size={12} style={{ color: '#22c55e' }} />
            ) : (
              <Pause size={12} />
            )}
          </button>
          <button
            onClick={onStep}
            className="vf-panel-header__btn"
            title="Advance one simulation step"
            type="button"
            disabled={!effectivePaused}
          >
            <Activity size={12} />
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
        {mode === 'oscilloscope' ? (
          <OscilloscopeScreen
            data={channels}
            voltsPerDiv={voltsPerDiv}
            timePerDiv={timePerDiv}
            samplePeriodMs={oscilloscopeSamplePeriodMs}
            paused={effectivePaused}
          />
        ) : (
          /* Digital Logic Analyzer Multi-Channel View */
          <div style={{ padding: '8px 12px', background: '#0a0f1e', height: '100%', overflowY: 'auto' }}>
            {logicChannelKeys.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '11px' }}>
                Connect up to eight oscilloscope inputs to capture digital traffic.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {logicChannelKeys.map((ch) => {
                    const captured = activeLogicCapture
                      .map((frame) => frame.channels[ch])
                      .filter((value): value is number => Number.isFinite(value))
                      .slice(-240)
                    const latest = captured[captured.length - 1] ?? channels[ch]?.[channels[ch].length - 1] ?? 0
                    const isHigh = latest >= 2.5
                    return (
                      <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '112px', fontSize: '10px', fontWeight: 600, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ch}
                        </div>
                        <div style={{ width: '37px', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, textAlign: 'center', background: isHigh ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)', color: isHigh ? '#22c55e' : '#64748b' }}>
                          {isHigh ? 'HIGH' : 'LOW'}
                        </div>
                        <div style={{ flex: 1, height: '14px', background: '#1e293b', borderRadius: '2px', display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
                          {(captured.length > 0 ? captured : [latest]).map((value, index) => (
                            <span key={`${ch}-${index}`} style={{ flex: '1 1 0', minWidth: '1px', background: value >= 2.5 ? '#22c55e' : '#334155' }} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #1e293b', color: '#94a3b8', fontSize: '10px' }}>
                  Capture: {activeLogicCapture.length} samples · {activeLogicCapture.length > 1 ? `${((activeLogicCapture[activeLogicCapture.length - 1].timestamp_s - activeLogicCapture[0].timestamp_s) * 1e6).toFixed(0)} µs` : '0 µs'}
                </div>
                <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
                  <div><b style={{ color: '#38bdf8' }}>I²C</b> {protocolAnalysis.i2c.filter((event) => event.kind === 'BYTE').slice(-3).map((event) => `0x${(event.value || 0).toString(16).padStart(2, '0')}${event.ack ? ' ✓' : ' ✕'}`).join(' ') || '—'}</div>
                  <div><b style={{ color: '#f59e0b' }}>SPI</b> {protocolAnalysis.spi.slice(-2).map((frame) => `M${frame.mosi.toString(16).padStart(2, '0')} R${frame.miso.toString(16).padStart(2, '0')}`).join(' ') || '—'}</div>
                  <div><b style={{ color: '#a855f7' }}>UART</b> {protocolAnalysis.uart.slice(-8).map((frame) => frame.text === '.' ? `0x${frame.value.toString(16).padStart(2, '0')}` : frame.text).join('') || '—'}</div>
                </div>
              </>
            )}
          </div>
        )}

        {channelKeys.length === 0 && mode === 'oscilloscope' && (
          <div className="vf-oscilloscope-empty">
            <span>Connect an on-canvas oscilloscope CH1 or CH2 probe to view local solver data</span>
          </div>
        )}
        {effectivePaused && (
          <div className="vf-oscilloscope-paused-badge">
            PAUSED
          </div>
        )}
      </div>
    </div>
  )
}
export { OscilloscopePanel }
