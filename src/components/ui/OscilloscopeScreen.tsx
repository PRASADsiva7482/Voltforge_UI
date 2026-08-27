import { useRef, useEffect, useMemo } from 'react'

const GRID_COLS = 10
const GRID_ROWS = 8

export interface OscilloscopeScreenProps {
  colors?: {
    background?: string
    ch1?: string
    ch2?: string
    grid?: string
    gridMajor?: string
  }
  data: Record<string, number[]>
  paused: boolean
  timePerDiv: number
  voltsPerDiv: number
  samplePeriodMs: number
}

export function OscilloscopeScreen({
  colors,
  data,
  paused,
  timePerDiv,
  voltsPerDiv,
  samplePeriodMs,
}: OscilloscopeScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef(0)

  const c = useMemo(() => ({
    background: '#0a0f1e',
    ch1: '#22c55e',
    ch2: '#38bdf8',
    grid: 'rgba(34,197,94,0.12)',
    gridMajor: 'rgba(34,197,94,0.25)',
    ...(colors || {}),
  }), [colors])

  const channelKeys = useMemo(() => Object.keys(data), [data])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()

      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      const w = rect.width
      const h = rect.height

      // Background
      ctx.fillStyle = c.background
      ctx.fillRect(0, 0, w, h)

      // Grid
      const cellW = w / GRID_COLS
      const cellH = h / GRID_ROWS
      ctx.strokeStyle = c.grid
      ctx.lineWidth = 0.5
      for (let i = 1; i < GRID_COLS; i++) {
        ctx.beginPath(); ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, h); ctx.stroke()
      }
      for (let i = 1; i < GRID_ROWS; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * cellH); ctx.lineTo(w, i * cellH); ctx.stroke()
      }

      // Major axes
      ctx.strokeStyle = c.gridMajor
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()

      // Traces
      const traceColors = [c.ch1, c.ch2]
      channelKeys.forEach((key, chIdx) => {
        const samples = data[key]
        if (!samples || samples.length < 2) return

        const color = traceColors[chIdx % traceColors.length]
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.shadowColor = color
        ctx.shadowBlur = 4

        const visibleMinimum = Math.min(...samples)
        const visibleMaximum = Math.max(...samples)
        const centerVoltage = (visibleMinimum + visibleMaximum) / 2
        const totalVolts = voltsPerDiv * GRID_ROWS
        const samplesPerDiv = Math.max(1, Math.ceil((timePerDiv * 1e-3) / Math.max(samplePeriodMs * 1e-3, Number.EPSILON)))
        const totalSamples = samplesPerDiv * GRID_COLS
        const startIdx = Math.max(0, samples.length - totalSamples)
        const visibleSamples = samples.slice(startIdx)

        if (visibleSamples.length >= 2) {
          ctx.beginPath()
          for (let i = 0; i < visibleSamples.length; i++) {
            const x = (i / (visibleSamples.length - 1)) * w
            const y = h / 2 - ((visibleSamples[i] - centerVoltage) / totalVolts) * h
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
        ctx.shadowBlur = 0

        // Channel label
        ctx.fillStyle = color
        ctx.font = '10px monospace'
        ctx.fillText(`CH${chIdx + 1}: ${key}`, 8, 14 + chIdx * 14)
      })

      // Scale labels
      ctx.fillStyle = '#94a3b8'
      ctx.font = '9px monospace'
      ctx.fillText(`${voltsPerDiv.toFixed(1)} V/div`, w - 70, h - 24)
      ctx.fillText(`${timePerDiv.toFixed(1)} ms/div`, w - 72, h - 10)

      ctx.restore()
      if (!paused) animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [data, voltsPerDiv, timePerDiv, samplePeriodMs, paused, c, channelKeys])

  return <canvas ref={canvasRef} className="vf-oscilloscope-screen" />
}
