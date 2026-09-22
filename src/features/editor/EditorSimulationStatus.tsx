import { useSimulationStore } from '../../store/simulationStore'

export function EditorSimulationTime() {
  const simulationTime = useSimulationStore((state) => state.simulationTime)
  return (
    <span className="vf-editor__simulation-time" title="Monotonic physical simulation time">
      t={simulationTime.toFixed(3)}s
    </span>
  )
}

export function EditorAvrWorkload() {
  const executionMode = useSimulationStore((state) => state.executionMode)
  const avrWorkload = useSimulationStore((state) => state.avrWorkload)
  if (executionMode !== 'avr8js' || !avrWorkload.active) return null
  return (
    <span
      className={`vf-editor__avr-workload ${avrWorkload.budgetLimited ? 'is-limited' : ''}`}
      title={[
        `${avrWorkload.fidelityMode === 'full-fidelity' ? 'Full fidelity' : 'Adaptive'} AVR execution`,
        `${avrWorkload.averageSliceMs.toFixed(2)} ms average of ${avrWorkload.sliceBudgetMs.toFixed(0)} ms slice budget`,
        `${Math.round(avrWorkload.instructionsPerSecond).toLocaleString()} instructions/s`,
        `${avrWorkload.pendingCycleLagMs.toFixed(1)} ms retained cycle debt`,
        'Firmware instructions and peripheral ticks are never skipped',
      ].join(' · ')}
    >
      {avrWorkload.budgetLimited ? 'AVR capped' : 'AVR'} · {(avrWorkload.emulatedClockHz / 1_000_000).toFixed(2)} MHz · {avrWorkload.mainThreadUtilizationPercent.toFixed(0)}%
    </span>
  )
}
