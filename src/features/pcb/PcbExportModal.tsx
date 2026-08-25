import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Download, Layers, ShieldCheck } from 'lucide-react';
import { FloatingPanel } from '../../components/ui/FloatingPanel';
import { pcbManufacturingApi, type PcbManufacturingPayload } from '../../api/services';
import { usePcbStore, type DrcViolation } from '../../store/pcbStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  wires?: unknown[];
}

export default function PcbExportModal({
  isOpen,
  onClose,
  projectName,
  wires = [],
}: Props) {
  const {
    boardHeight_mm,
    boardWidth_mm,
    footprints,
    traces,
    vias,
    setDrcViolations,
  } = usePcbStore();

  const [drcRan, setDrcRan] = useState(false);
  const [violations, setViolations] = useState<DrcViolation[]>([]);
  const [isRunningDrc, setIsRunningDrc] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasErrors = violations.some((v) => v.severity === 'ERROR');
  const hasWarnings = violations.some((v) => v.severity === 'WARNING');
  const canExport = drcRan && !hasErrors && !isRunningDrc && !isExporting;
  const designSignature = useMemo(
    () => JSON.stringify({ boardWidth_mm, boardHeight_mm, footprints, traces, vias, wires }),
    [boardHeight_mm, boardWidth_mm, footprints, traces, vias, wires],
  );

  useEffect(() => {
    // A DRC result is only valid for the exact layout that was checked.
    // Invalidate it whenever the schematic/PCB design changes.
    setDrcRan(false);
    setViolations([]);
    setDrcViolations([]);
    setErrorMessage(null);
  }, [designSignature, setDrcViolations]);

  const buildPayload = (): PcbManufacturingPayload => ({
    boardHeight_mm,
    boardWidth_mm,
    footprints,
    projectName: projectName || 'VoltForge_PCB',
    traces,
    vias,
    wires,
  });

  const runDrc = async () => {
    setIsRunningDrc(true);
    setErrorMessage(null);

    try {
      const response = await pcbManufacturingApi.runDrc(buildPayload());
      const list = response.data.data.violations || [];
      setViolations(list);
      setDrcViolations(list);
      setDrcRan(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to run PCB DRC.';
      const serviceViolation: DrcViolation = {
        id: 'drc_request_failed',
        severity: 'ERROR',
        rule: 'DRC service request',
        message,
      };
      setViolations([serviceViolation]);
      setDrcViolations([serviceViolation]);
      setDrcRan(true);
      setErrorMessage(message);
    } finally {
      setIsRunningDrc(false);
    }
  };

  const handleDownloadGerber = async () => {
    if (!canExport) return;

    setIsExporting(true);
    setErrorMessage(null);

    try {
      const response = await pcbManufacturingApi.exportGerber(buildPayload());
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = (projectName || 'VoltForge_PCB').replace(/[^A-Za-z0-9_.-]/g, '_');

      link.href = url;
      link.download = `${safeName}_gerber.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gerber export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="PCB Design Rules Check & Gerber Export"
      width="520px"
      icon={<Layers size={14} />}
    >
      <div className="vf-pcb-export">
        <div className="vf-pcb-export__summary">
          <div>
            <div className="vf-pcb-export__title">Design Rule Check (DRC)</div>
            <div className="vf-pcb-export__hint">
              6 mil clearance, 6 mil trace width, drill sizing, board outline, and unrouted net checks.
            </div>
          </div>

          <button
            type="button"
            onClick={runDrc}
            className="vf-button vf-button--sm vf-button--primary"
            disabled={isRunningDrc}
          >
            <ShieldCheck size={14} />
            <span>{isRunningDrc ? 'Checking...' : 'Run DRC'}</span>
          </button>
        </div>

        {errorMessage && <div className="vf-pcb-export__error">{errorMessage}</div>}

        {drcRan && (
          <section className="vf-pcb-export__section">
            <div className="vf-pcb-export__section-title">
              DRC Results ({violations.length} {violations.length === 1 ? 'item' : 'items'})
            </div>

            {violations.length === 0 ? (
              <div className="vf-pcb-export__pass">
                <CheckCircle size={16} />
                <span>All design rules passed. Board is ready for manufacturing.</span>
              </div>
            ) : (
              <div className="vf-pcb-export__violations">
                {violations.map((v) => (
                  <div
                    key={v.id}
                    className={`vf-pcb-export__violation ${v.severity === 'ERROR' ? 'is-error' : 'is-warning'}`}
                  >
                    <AlertTriangle size={14} />
                    <div>
                      <div className="vf-pcb-export__violation-title">
                        [{v.severity}] {v.rule}
                      </div>
                      <div className="vf-pcb-export__violation-message">{v.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="vf-pcb-export__section">
          <div className="vf-pcb-export__title">Gerber & Drill Package (RS-274X)</div>
          <div className="vf-pcb-export__hint">
            Exports Top/Bottom Copper, Solder Mask, Silkscreen, Edge Cuts, and Excellon drill files as a fabrication ZIP.
          </div>

          <button
            type="button"
            onClick={handleDownloadGerber}
            disabled={!canExport}
            className="vf-button vf-button--md vf-button--primary vf-pcb-export__download"
            title={
              !drcRan
                ? 'Run DRC before export'
                : hasErrors
                  ? 'Fix DRC errors before export'
                  : hasWarnings
                    ? 'Exports with warnings'
                    : 'Download Gerber ZIP'
            }
          >
            <Download size={14} />
            <span>{isExporting ? 'Exporting...' : 'Download Gerber ZIP'}</span>
          </button>
        </section>
      </div>
    </FloatingPanel>
  );
}
