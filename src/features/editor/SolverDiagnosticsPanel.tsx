import { Download, Gauge, Play, Square } from 'lucide-react';
import { FloatingPanel } from '../../components/ui/FloatingPanel';
import type { SimulationFidelityMode } from '../simulator/simulationModels';
import type { SolverDiagnosticsSnapshot } from '../simulator/solverDiagnostics';
import type { MaximumComponentRegressionTrace } from '../simulator/regression/maxComponentRegression';
import type { MaximumCanvasRenderTrace } from '../canvas/regression/canvasRenderRegression';
import type { AvrCompiledFirmwareTrace } from '../simulator/regression/avrCompiledFirmwareTrace';
import {
  AVR_COMPILED_TRACE_DURATION_MS,
  AVR_COMPILED_TRACE_ID,
} from '../simulator/regression/avrCompiledFirmwareTrace';
import {
  MAX_COMPONENT_REGRESSION_DURATION_MS,
  MAX_COMPONENT_REGRESSION_ID,
  createMaximumComponentRegressionPreset,
} from '../../store/maxComponentRegressionPreset';
import { useSimulationStore } from '../../store/simulationStore';

export interface SolverDiagnosticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics: SolverDiagnosticsSnapshot | null;
  regressionMode: SimulationFidelityMode | 'both' | null;
  regressionRuns: MaximumComponentRegressionTrace[];
  onRunRegression: () => void;
  onStopRegression: () => void;
  canvasRenderTraceRunning: boolean;
  canvasRenderTrace: MaximumCanvasRenderTrace | null;
  onRunCanvasRenderTrace: () => void;
  onStopCanvasRenderTrace: () => void;
  avrCompiledTraceRunning: boolean;
  avrCompiledTrace: AvrCompiledFirmwareTrace | null;
  onRunAvrCompiledTrace: () => void;
  onStopAvrCompiledTrace: () => void;
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '—';
  return `${rate.toFixed(rate >= 100 ? 0 : 2)}×`;
}

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : '—';
}

function downloadTrace(trace: unknown, filename: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SolverDiagnosticsPanel({
  isOpen,
  onClose,
  diagnostics,
  regressionMode,
  regressionRuns,
  onRunRegression,
  onStopRegression,
  canvasRenderTraceRunning,
  canvasRenderTrace,
  onRunCanvasRenderTrace,
  onStopCanvasRenderTrace,
  avrCompiledTraceRunning,
  avrCompiledTrace,
  onRunAvrCompiledTrace,
  onStopAvrCompiledTrace,
}: SolverDiagnosticsPanelProps) {
  const avrWorkload = useSimulationStore((state) => state.avrWorkload);
  const preset = createMaximumComponentRegressionPreset();
  const latestRun = regressionRuns[regressionRuns.length - 1];
  const isRunning = regressionMode !== null || canvasRenderTraceRunning || avrCompiledTraceRunning;

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Solver, canvas, and AVR diagnostics"
      icon={<Gauge size={15} />}
      width="390px"
    >
      <div className="vf-solver-diagnostics">
        <p className="vf-solver-diagnostics__hint">
          Solver and AVR workload samples are published at 4 Hz. Normal simulation payloads and per-frame store publication remain unchanged.
        </p>

        <div className="vf-solver-diagnostics__grid">
          <Metric label="Frame wall" value={formatMs(diagnostics?.frameWallTimeMs ?? NaN)} />
          <Metric label="Budget use" value={diagnostics ? `${diagnostics.budgetUtilizationPercent.toFixed(0)}%` : '—'} />
          <Metric label="Steps/frame" value={diagnostics ? String(diagnostics.stepsThisFrame) : '—'} />
          <Metric label="Completed" value={diagnostics ? diagnostics.completedSteps.toLocaleString() : '—'} />
          <Metric label="Timestep" value={diagnostics ? `${(diagnostics.selectedTimeStep_s * 1000).toFixed(2)} ms` : '—'} />
          <Metric label="Sim rate" value={formatRate(diagnostics?.simulationTimeRate ?? 0)} />
          <Metric label="Sim time" value={diagnostics ? `${diagnostics.simulationTime_s.toFixed(3)} s` : '—'} />
          <Metric label="Convergence" value={diagnostics ? (diagnostics.converged ? 'OK' : 'Failed') : '—'} />
        </div>

        {diagnostics?.budgetLimited && (
          <div className="vf-solver-diagnostics__warning">Worker frame reached its configured budget.</div>
        )}

        {(avrWorkload.active || avrCompiledTraceRunning) && (
          <div className="vf-solver-diagnostics__section">
            <div className="vf-solver-diagnostics__section-title">Live AVR execution budget</div>
            <div className="vf-solver-diagnostics__grid">
              <Metric label="Instruction rate" value={avrWorkload.instructionsPerSecond > 0 ? `${Math.round(avrWorkload.instructionsPerSecond).toLocaleString()}/s` : '—'} />
              <Metric label="Emulated clock" value={avrWorkload.emulatedClockHz > 0 ? `${(avrWorkload.emulatedClockHz / 1_000_000).toFixed(2)} MHz` : '—'} />
              <Metric label="Main-thread use" value={`${avrWorkload.mainThreadUtilizationPercent.toFixed(1)}%`} />
              <Metric label="Cycle debt" value={formatMs(avrWorkload.pendingCycleLagMs)} />
              <Metric label="Average slice" value={formatMs(avrWorkload.averageSliceMs)} />
              <Metric label="Maximum slice" value={formatMs(avrWorkload.maximumSliceMs)} />
              <Metric label="Deadline overshoot" value={formatMs(avrWorkload.maximumDeadlineOvershootMs)} />
              <Metric label="Slice budget" value={formatMs(avrWorkload.sliceBudgetMs)} />
            </div>
            {(avrWorkload.budgetLimited || avrWorkload.hardLimitReached || avrWorkload.backgroundStallCount > 0) && (
              <div className="vf-solver-diagnostics__checks">
                <span className={avrWorkload.budgetLimited ? 'is-pending' : 'is-pass'}>
                  budget limited: {avrWorkload.budgetLimited ? 'yes' : 'no'}
                </span>
                <span className={avrWorkload.hardLimitReached ? 'is-pending' : 'is-pass'}>
                  hard ceiling: {avrWorkload.hardLimitReached ? 'reached' : 'clear'}
                </span>
                <span className={avrWorkload.backgroundStallCount > 0 ? 'is-pending' : 'is-pass'}>
                  background stalls: {avrWorkload.backgroundStallCount}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="vf-solver-diagnostics__section">
          <div className="vf-solver-diagnostics__section-title">Maximum-component regression</div>
          <p className="vf-solver-diagnostics__meta">
            {MAX_COMPONENT_REGRESSION_ID} · {preset.nodes.length} nodes · {preset.wires.length} wires · {MAX_COMPONENT_REGRESSION_DURATION_MS / 1000}s per mode
          </p>
          <p className="vf-solver-diagnostics__meta">
            The same deterministic circuit and compatibility firmware are used for Adaptive and Full fidelity.
          </p>
          <div className="vf-solver-diagnostics__actions">
            <button
              className="vf-editor__sim-btn"
              disabled={isRunning}
              onClick={onRunRegression}
              type="button"
            >
              <Play size={13} />
              Run both traces
            </button>
            {regressionMode !== null && (
              <button className="vf-editor__tool-btn" onClick={onStopRegression} title="Stop regression" type="button">
                <Square size={13} />
                {regressionMode === 'both' ? 'Running' : regressionMode}
              </button>
            )}
          </div>
        </div>

        <div className="vf-solver-diagnostics__section">
          <div className="vf-solver-diagnostics__section-title">Maximum-canvas rendering trace</div>
          <p className="vf-solver-diagnostics__meta">
            Loads the same maximum preset, replays deterministic current results, and pans/zooms through disabled, Adaptive, overview-limited, and Full detail modes before restoring this project.
          </p>
          <p className="vf-solver-diagnostics__meta">
            GPU activity is recorded as Konva Canvas2D draw submissions and CPU submission time; direct GPU-process timing still requires a browser profiler trace.
          </p>
          <div className="vf-solver-diagnostics__actions">
            <button
              className="vf-editor__sim-btn"
              disabled={isRunning}
              onClick={onRunCanvasRenderTrace}
              type="button"
            >
              <Play size={13} />
              Run canvas trace
            </button>
            {canvasRenderTraceRunning && (
              <button className="vf-editor__tool-btn" onClick={onStopCanvasRenderTrace} title="Stop canvas trace" type="button">
                <Square size={13} />
                Running
              </button>
            )}
            {canvasRenderTrace && (
              <button
                className="vf-editor__tool-btn"
                onClick={() => downloadTrace(
                  canvasRenderTrace,
                  `voltforge-canvas-render-${canvasRenderTrace.fixtureId}-${Date.now()}.json`,
                )}
                title="Download canvas rendering trace JSON"
                type="button"
              >
                <Download size={13} />
                JSON
              </button>
            )}
          </div>
        </div>

        {canvasRenderTrace && (
          <div className="vf-solver-diagnostics__section">
            <div className="vf-solver-diagnostics__section-title">
              Canvas comparison · {canvasRenderTrace.completed ? 'complete' : 'stopped'}
            </div>
            <div className="vf-solver-diagnostics__checks">
              <span className={canvasRenderTrace.sameOverviewMotion ? 'is-pass' : 'is-pending'}>
                Same motion: {canvasRenderTrace.sameOverviewMotion ? 'yes' : 'no'}
              </span>
              <span className={canvasRenderTrace.sameResultStream ? 'is-pass' : 'is-pending'}>
                Same results: {canvasRenderTrace.sameResultStream ? 'yes' : 'no'}
              </span>
            </div>
            {canvasRenderTrace.scenarios.map((scenario) => (
              <div className="vf-solver-diagnostics__trace-row" key={scenario.id}>
                <strong>{scenario.label}</strong>
                <span>{scenario.mountedWireShapes.minimum}–{scenario.mountedWireShapes.maximum}/{scenario.mountedWireShapes.totalWires} wires</span>
                <span>{scenario.compiledFlowPathCount} paths · {scenario.maximumParticlesPerDraw} particles</span>
                <span>p95 {formatMs(scenario.frameTime.p95Ms)} · {scenario.gpuActivity.canvasDrawCount} canvas draws</span>
              </div>
            ))}
          </div>
        )}

        <div className="vf-solver-diagnostics__section">
          <div className="vf-solver-diagnostics__section-title">Compiled ATmega328P responsiveness trace</div>
          <p className="vf-solver-diagnostics__meta">
            {AVR_COMPILED_TRACE_ID} · GPIO, timer/PWM, UART, ADC, and I2C · {AVR_COMPILED_TRACE_DURATION_MS / 1000}s per fidelity mode
          </p>
          <p className="vf-solver-diagnostics__meta">
            Compiles the fixture through the configured firmware service, measures real requestAnimationFrame and synthetic click latency, then restores this project.
          </p>
          <div className="vf-solver-diagnostics__actions">
            <button
              className="vf-editor__sim-btn"
              disabled={isRunning}
              onClick={onRunAvrCompiledTrace}
              type="button"
            >
              <Play size={13} />
              Run AVR trace
            </button>
            {avrCompiledTraceRunning && (
              <button className="vf-editor__tool-btn" onClick={onStopAvrCompiledTrace} title="Stop compiled AVR trace" type="button">
                <Square size={13} />
                Running
              </button>
            )}
            {avrCompiledTrace && (
              <button
                className="vf-editor__tool-btn"
                onClick={() => downloadTrace(
                  avrCompiledTrace,
                  `voltforge-avr-${avrCompiledTrace.fixtureId}-${Date.now()}.json`,
                )}
                title="Download compiled AVR trace JSON"
                type="button"
              >
                <Download size={13} />
                JSON
              </button>
            )}
          </div>
        </div>

        {avrCompiledTrace && (
          <div className="vf-solver-diagnostics__section">
            <div className="vf-solver-diagnostics__section-title">
              Compiled AVR comparison · {avrCompiledTrace.completed ? 'complete' : 'stopped'} · {avrCompiledTrace.compiler}
            </div>
            {avrCompiledTrace.modes.map((mode) => (
              <div className="vf-solver-diagnostics__trace-row" key={mode.fidelityMode}>
                <strong>{mode.fidelityMode} · {mode.responsive ? 'pass' : 'review'}</strong>
                <span>{Math.round(mode.workload.averageInstructionsPerSecond).toLocaleString()} instructions/s · {(mode.workload.averageEmulatedClockHz / 1_000_000).toFixed(2)} MHz</span>
                <span>p95 frame {formatMs(mode.frameTime.p95Ms)} · input {formatMs(mode.inputLatency.p95Ms)}</span>
                <span>debt {formatMs(mode.workload.maximumPendingCycleLagMs)} · overshoot {formatMs(mode.workload.maximumDeadlineOvershootMs)}</span>
                <div className="vf-solver-diagnostics__checks">
                  {mode.peripheralChecks.map((check) => (
                    <span key={check.kind} className={check.passed ? 'is-pass' : 'is-pending'}>
                      {check.kind}: {check.observed}/{check.minimum}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {latestRun && (
          <div className="vf-solver-diagnostics__section">
            <div className="vf-solver-diagnostics__section-title">Latest trace: {latestRun.fidelityMode}</div>
            <div className="vf-solver-diagnostics__trace-summary">
              <span>{latestRun.sampleCount} samples</span>
              <span>{latestRun.completedSteps.toLocaleString()} steps</span>
              <span>{latestRun.monotonicSimulationTime ? 'Monotonic time' : 'Time regression'}</span>
            </div>
            <div className="vf-solver-diagnostics__checks">
              {latestRun.representativeChecks.map((check) => (
                <span key={check.kind} className={check.sampled && check.observedNodeCount === check.expectedNodeCount ? 'is-pass' : 'is-pending'}>
                  {check.kind}: {check.observedNodeCount}/{check.expectedNodeCount}
                </span>
              ))}
            </div>
          </div>
        )}

        {regressionRuns.length > 1 && (
          <div className="vf-solver-diagnostics__section">
            <div className="vf-solver-diagnostics__section-title">Fidelity comparison</div>
            <div className="vf-solver-diagnostics__trace-summary">
              {regressionRuns.slice(-2).map((run) => (
                <span key={`${run.fixtureId}-${run.fidelityMode}`}>
                  {run.fidelityMode}: {formatRate(run.averageSimulationTimeRate)} rate
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="vf-solver-diagnostics__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
