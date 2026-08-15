import { useCallback, useState, useEffect, useRef } from 'react'
import { Activity, Maximize2, Minimize2, Pause, Play, Radio, Cpu, Sliders, Volume2, VolumeX } from 'lucide-react'
import { useSimulationStore } from '../../store/simulationStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { OscilloscopeScreen } from '../../components/ui/OscilloscopeScreen'
import { SelectField } from '../../components/ui/Field'

interface Props {
  className?: string
}

type ScopeMode = 'oscilloscope' | 'logic_analyzer' | 'dual'

export default function OscilloscopePanel({ className = '' }: Props) {
  const {
    oscilloscopeData,
    oscilloscopePanelOpen,
    setOscilloscopePanelOpen,
    appendOscilloscopeData,
  } = useSimulationStore()
  const { nodes, wires } = useCanvasStore()
  const currentProject = useProjectStore((s) => s.currentProject)
  const boardType = currentProject?.boardType || 'ARDUINO_UNO'

  const [mode, setMode] = useState<ScopeMode>('oscilloscope')
  const [expanded, setExpanded] = useState(false)
  const [paused, setPaused] = useState(false)
  const [voltsPerDiv, setVoltsPerDiv] = useState(1.0)
  const [timePerDiv, setTimePerDiv] = useState(1.0) // ms
  const [isStreaming, setIsStreaming] = useState(false)
  const [pausedData, setPausedData] = useState<Record<string, number[]>>({})
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [volume, setVolume] = useState(0.15)

  const abortControllerRef = useRef<AbortController | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscNodeRef = useRef<OscillatorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

  const toggleAudio = useCallback(() => {
    if (audioEnabled) {
      gainNodeRef.current?.gain.setValueAtTime(0, audioCtxRef.current?.currentTime || 0)
      setAudioEnabled(false)
    } else {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        gain.gain.setValueAtTime(volume, ctx.currentTime)
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
  }, [audioEnabled, volume])

  const handlePauseToggle = useCallback(() => {

    if (!paused) {
      setPausedData({ ...oscilloscopeData })
    }
    setPaused(!paused)
  }, [paused, oscilloscopeData])

  // Live stream from Voltforge AI /simulation/stream
  const startLiveAiStream = async () => {
    if (isStreaming) {
      abortControllerRef.current?.abort()
      setIsStreaming(false)
      return
    }

    try {
      setIsStreaming(true)
      abortControllerRef.current = new AbortController()

      const response = await fetch('http://localhost:2002/voltForge-ai/api/v1/model/simulation/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardType: boardType,
          components: nodes.map(n => ({ id: n.id, type: n.type })),
          wires: wires.map(w => ({ from: w.fromPinId, to: w.toPinId })),
          probes: ['VCC', 'D13_LED', 'ANALOG_A0', 'PWM_D9'],
          durationMs: 5000,
          sampleRateHz: 100
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.body) return
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.signals) {
                for (const [key, val] of Object.entries(data.signals)) {
                  appendOscilloscopeData(key, Number(val))
                }
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('[Oscilloscope] Stream interrupted or AI service offline')
      }
    } finally {
      setIsStreaming(false)
    }
  }


  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  if (!oscilloscopePanelOpen) return null

  const channels = paused ? pausedData : oscilloscopeData
  const channelKeys = Object.keys(channels)
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
          {/* AI Stream trigger button */}
          <button
            type="button"
            onClick={startLiveAiStream}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: isStreaming ? '#dc2626' : '#0284c7',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
            title="Stream live transient waveforms from Voltforge AI"
          >
            <Radio size={12} className={isStreaming ? 'animate-pulse' : ''} />
            {isStreaming ? 'Stop AI Stream' : 'Live AI Stream'}
          </button>

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
        {mode === 'oscilloscope' ? (
          <OscilloscopeScreen
            data={channels}
            voltsPerDiv={voltsPerDiv}
            timePerDiv={timePerDiv}
            paused={paused}
          />
        ) : (
          /* Digital Logic Analyzer Multi-Channel View */
          <div style={{ padding: '8px 12px', background: '#0a0f1e', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(channelKeys.length > 0 ? channelKeys : ['CH0 (D13)', 'CH1 (SDA)', 'CH2 (SCL)', 'CH3 (PWM)']).map((ch, idx) => {
                const samples = channels[ch] || []
                const latest = samples.length > 0 ? samples[samples.length - 1] : 0
                const isHigh = latest > 2.0
                return (
                  <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '90px', fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                      {ch}
                    </div>
                    <div style={{
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: isHigh ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                      color: isHigh ? '#22c55e' : '#64748b'
                    }}>
                      {isHigh ? 'HIGH' : 'LOW'}
                    </div>
                    {/* Visual pulse train representation */}
                    <div style={{ flex: 1, height: '16px', background: '#1e293b', borderRadius: '2px', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                      <div style={{
                        width: isHigh ? '100%' : '0%',
                        height: '3px',
                        background: '#22c55e',
                        boxShadow: isHigh ? '0 0 6px #22c55e' : 'none',
                        transition: 'all 0.05s ease'
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {channelKeys.length === 0 && !isStreaming && mode === 'oscilloscope' && (
          <div className="vf-oscilloscope-empty">
            <span>No oscilloscope probes connected (Click "Live AI Stream" to test)</span>
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
