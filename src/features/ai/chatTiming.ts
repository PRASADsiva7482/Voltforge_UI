/** Content-free, page-local measurements. No storage, network, or window/debug API. */
type Stage = 'accepted' | 'firstText' | 'saved' | 'total'
type Outcome = 'completed' | 'failed' | 'interrupted' | 'cancelled' | 'unconfirmed'
const stages: Stage[] = ['accepted', 'firstText', 'saved', 'total']
const outcomes: Outcome[] = ['completed', 'failed', 'interrupted', 'cancelled', 'unconfirmed']

export class ChatTiming {
  private samples = new Map<Stage, number[]>(stages.map(stage => [stage, []]))
  private counts = new Map<Outcome, number>()
  constructor(private clock: () => number = () => performance.now()) {}
  start() {
    const started = this.clock()
    const recorded = new Set<Stage>()
    let finished = false
    const mark = (stage: Stage) => {
      if (finished || recorded.has(stage)) return
      recorded.add(stage)
      const elapsed = this.clock() - started
      if (!Number.isFinite(elapsed)) return
      const window = this.samples.get(stage)!
      if (window.length === 256) window.shift()
      window.push(Math.max(0, Math.min(600_000, elapsed)))
    }
    const finish = (outcome: Outcome) => {
      if (finished) return
      mark('total')
      finished = true
      this.counts.set(outcome, (this.counts.get(outcome) ?? 0) + 1)
    }
    return {
      accepted: () => mark('accepted'),
      firstText: () => mark('firstText'),
      saved: (status: string) => {
        if (finished) return
        mark('saved')
        finish(outcomes.includes(status as Outcome) ? status as Outcome : 'unconfirmed')
      },
      finish: (cancelled: boolean) => finish(cancelled ? 'cancelled' : 'unconfirmed'),
    }
  }
  snapshot() {
    return {
      latencyMs: Object.fromEntries([...this.samples].map(([stage, values]) => {
        const sorted = [...values].sort((a, b) => a - b)
        return [stage, { count: sorted.length, p50Ms: sorted[Math.floor((sorted.length - 1) * .5)] ?? null,
          p95Ms: sorted[Math.floor((sorted.length - 1) * .95)] ?? null, maxMs: sorted.at(-1) ?? null }]
      })),
      outcomes: Object.fromEntries(this.counts),
    }
  }
}

export const chatTiming = new ChatTiming()
