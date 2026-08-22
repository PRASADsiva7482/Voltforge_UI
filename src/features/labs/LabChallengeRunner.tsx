import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, Circle, HelpCircle, Play, Square, Trophy, X } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import { useSimulationStore } from '../../store/simulationStore';
import CircuitCanvas from '../canvas/CircuitCanvas';
import ComponentPanel from '../editor/ComponentPanel';
import PropertyEditor from '../editor/PropertyEditor';
import SerialMonitor from '../editor/SerialMonitor';
import { SimulationEngine } from '../simulator/SimulationEngine';
import { LogicRegistry } from '../simulator/logic/LogicRegistry';
import labCatalog from './labCatalog.json';
import { LabCriteriaEvaluator, type EvaluationResult, type LabChallenge } from './labCriteriaEvaluator';

export function LabChallengeRunner() {
  const { labId } = useParams<{ labId: string }>();
  const navigate = useNavigate();
  const challenge = (labCatalog as unknown as LabChallenge[]).find((item) => item.id === labId);

  const loadCanvas = useCanvasStore((s) => s.loadCanvas);
  const nodes = useCanvasStore((s) => s.nodes);
  const wires = useCanvasStore((s) => s.wires);
  const isSimulating = useSimulationStore((s) => s.isSimulating);
  const setSimulating = useSimulationStore((s) => s.setSimulating);
  const nodeVoltages = useSimulationStore((s) => s.nodeVoltages);
  const branchCurrents = useSimulationStore((s) => s.branchCurrents);
  const writeSerial = useSimulationStore((s) => s.writeSerial);
  const clearSerial = useSimulationStore((s) => s.clearSerial);

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const [canvasSize, setCanvasSize] = useState({ height: 520, width: 820 });
  const [revealedHints, setRevealedHints] = useState(0);
  const [showHintModal, setShowHintModal] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluationResult>({
    allPassed: false,
    objectiveResults: [],
  });

  useEffect(() => {
    if (!challenge) return;
    loadCanvas(challenge.initialCircuit.nodes || [], challenge.initialCircuit.wires || []);
  }, [challenge, loadCanvas]);

  useEffect(() => {
    engineRef.current = new SimulationEngine({
      onError: (err) => writeSerial(`[ERROR] ${err}`),
      onPinStateChange: (componentId, pinId, state, value) => {
        const node = useCanvasStore.getState().nodes.find((item) => item.id === componentId);
        if (node) LogicRegistry.dispatch(node.type, componentId, pinId, state, value);
      },
      onSerialOutput: (text) => writeSerial(text),
    });

    return () => {
      engineRef.current?.stop();
      setSimulating(false);
    };
  }, [setSimulating, writeSerial]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const resize = () => {
      setCanvasSize({
        height: Math.max(320, host.clientHeight),
        width: Math.max(420, host.clientWidth),
      });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!challenge) return;

    const result = LabCriteriaEvaluator.evaluate(
      challenge,
      nodes,
      wires,
      nodeVoltages,
      branchCurrents,
      isSimulating
    );
    setEvalResult(result);

    if (result.allPassed && !showCompletedModal) {
      setShowCompletedModal(true);
    }
  }, [branchCurrents, challenge, isSimulating, nodeVoltages, nodes, showCompletedModal, wires]);

  const toggleSimulation = async () => {
    if (!isSimulating) {
      setSimulating(true);
      clearSerial();
      writeSerial('> Challenge verification simulation started');
      await engineRef.current?.start('', nodes, wires);
      return;
    }

    setSimulating(false);
    engineRef.current?.stop();
    writeSerial('> Simulation stopped');
  };

  if (!challenge) {
    return (
      <div className="vf-lab-missing">
        <h2>Challenge not found</h2>
        <button type="button" className="vf-button vf-button--md vf-button--primary" onClick={() => navigate('/labs')}>
          Back to Labs
        </button>
      </div>
    );
  }

  return (
    <div className="vf-lab-runner">
      <header className="vf-lab-runner__header">
        <div className="vf-lab-runner__header-left">
          <button type="button" className="vf-button vf-button--sm vf-button--secondary" onClick={() => navigate('/labs')}>
            <ArrowLeft size={14} />
            <span>Labs</span>
          </button>

          <div className="vf-lab-runner__title">
            <div>
              <h1>{challenge.title}</h1>
              <span className="vf-badge vf-badge--info">{challenge.difficulty}</span>
            </div>
            <p>{challenge.description}</p>
          </div>
        </div>

        <div className="vf-lab-runner__actions">
          <button
            type="button"
            className="vf-button vf-button--sm vf-button--secondary"
            onClick={() => setShowHintModal(true)}
          >
            <HelpCircle size={14} />
            <span>Hints ({revealedHints}/{challenge.hints.length})</span>
          </button>

          <button
            type="button"
            className={`vf-button vf-button--md ${isSimulating ? 'vf-button--danger' : 'vf-button--primary'}`}
            onClick={toggleSimulation}
          >
            {isSimulating ? <Square size={14} /> : <Play size={14} />}
            <span>{isSimulating ? 'Stop' : 'Simulate & Verify'}</span>
          </button>
        </div>
      </header>

      <section className="vf-lab-objectives">
        <span className="vf-lab-objectives__label">Objectives</span>
        {challenge.objectives.map((objective) => {
          const result = evalResult.objectiveResults.find((item) => item.objectiveId === objective.id);
          const isPassed = Boolean(result?.passed);

          return (
            <div key={objective.id} className={`vf-lab-objective ${isPassed ? 'is-passed' : ''}`}>
              {isPassed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
              <span>{objective.description}</span>
              {result?.currentValueText && <small>{result.currentValueText}</small>}
            </div>
          );
        })}
      </section>

      <div className="vf-lab-runner__body">
        <aside className="vf-lab-runner__left-panel">
          <ComponentPanel />
        </aside>

        <main className="vf-lab-runner__workspace">
          <div ref={canvasHostRef} className="vf-lab-runner__canvas">
            <CircuitCanvas width={canvasSize.width} height={canvasSize.height} isSimulating={isSimulating} />
            <PropertyEditor />
          </div>
          <SerialMonitor />
        </main>
      </div>

      {showHintModal && (
        <div className="vf-modal-overlay">
          <div className="vf-modal vf-lab-dialog">
            <header className="vf-modal__header">
              <h3>
                <HelpCircle size={18} />
                Challenge Hints ({revealedHints}/{challenge.hints.length})
              </h3>
              <button
                type="button"
                className="vf-modal__close-btn"
                onClick={() => setShowHintModal(false)}
                aria-label="Close hints"
              >
                <X size={16} />
              </button>
            </header>

            <div className="vf-modal__body vf-lab-dialog__body">
              {challenge.hints.slice(0, revealedHints).map((hint, index) => (
                <div key={`${hint}-${index}`} className="vf-lab-hint">
                  <strong>Hint {index + 1}</strong>
                  <span>{hint}</span>
                </div>
              ))}
              {revealedHints === 0 && <p className="vf-lab-dialog__empty">No hints revealed yet.</p>}
            </div>

            <footer className="vf-modal__footer">
              {revealedHints < challenge.hints.length ? (
                <button
                  type="button"
                  className="vf-button vf-button--sm vf-button--primary"
                  onClick={() => setRevealedHints((count) => count + 1)}
                >
                  Reveal Next Hint
                </button>
              ) : <span />}
              <button type="button" className="vf-button vf-button--sm vf-button--secondary" onClick={() => setShowHintModal(false)}>
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {showCompletedModal && (
        <div className="vf-modal-overlay">
          <div className="vf-modal vf-lab-complete">
            <div className="vf-lab-complete__icon">
              <Trophy size={44} />
            </div>
            <h2>Challenge Completed</h2>
            <p>
              You met every validation target for <strong>{challenge.title}</strong>.
            </p>

            <div className="vf-lab-complete__theory">
              <div>
                <BookOpen size={14} />
                <span>Engineering Theory & Solution</span>
              </div>
              <p>{challenge.theoryExplanation}</p>
            </div>

            <div className="vf-lab-complete__actions">
              <button type="button" className="vf-button vf-button--md vf-button--primary" onClick={() => navigate('/labs')}>
                Next Lab
              </button>
              <button type="button" className="vf-button vf-button--md vf-button--secondary" onClick={() => setShowCompletedModal(false)}>
                Continue Experimenting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
