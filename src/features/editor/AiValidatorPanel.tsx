import { useState } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, Info, Play } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import { useProjectStore } from '../../store/projectStore';
import { aiApi } from '../../api/services';
import VfFloatingPanel from '../../components/ui/VfFloatingPanel';
import VfCallout from '../../components/ui/VfCallout';
import VfActionButton from '../../components/ui/VfActionButton';
import VfLoadingSpinner from '../../components/ui/VfLoadingSpinner';
import { useTranslation } from 'react-i18next';

interface Props { isOpen: boolean; onClose: () => void; }

export default function AiValidatorPanel({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const { nodes, wires } = useCanvasStore();
  const { currentProject } = useProjectStore();
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const handleValidate = async () => {
    if (nodes.length === 0) return alert(t('Add components to the canvas first.'));
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await aiApi.validateCircuit({
        boardType: currentProject?.boardType,
        components: nodes.map(n => ({ id: n.id, type: n.type, name: n.name })),
        wires: wires.map(w => ({ fromComponent: w.fromNodeId, fromPin: w.fromPinId, toComponent: w.toNodeId, toPin: w.toPinId }))
      });
      setValidationResult(res.data.data);
    } catch (e) {
      console.error(e);
      alert(t('Validation failed.'));
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <VfFloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("AI Circuit Validator")}
      icon={<ShieldAlert className="w-4 h-4 text-purple-500 dark:text-purple-400" />}
      width="w-80"
    >
      <div className="flex-1 p-1">
        {!validationResult && !isValidating && (
          <div className="text-center py-6">
            <ShieldAlert className="w-10 h-10 text-surface-400 mx-auto mb-3 dark:text-surface-600" />
            <p className="text-xs text-surface-600 mb-4 dark:text-surface-400">{t('Validate your circuit wiring, power distribution, and component logic for potential safety or functional issues.')}</p>
            <VfActionButton
              onClick={handleValidate}
              icon={<Play className="w-3.5 h-3.5" />}
              variant="primary"
              className="w-full"
            >
              {t('Start Validation')}
            </VfActionButton>
          </div>
        )}

        {isValidating && (
          <div className="text-center py-10 flex flex-col items-center">
            <VfLoadingSpinner size="md" className="mb-3" />
            <p className="text-xs text-surface-600 animate-pulse dark:text-surface-400">{t('AI is analyzing circuit topology...')}</p>
          </div>
        )}

        {validationResult && !isValidating && (
          <div className="space-y-4">
            <VfCallout
              type={validationResult.isValid ? 'success' : 'error'}
              title={validationResult.isValid ? t('Circuit looks safe!') : t('Circuit validation failed')}
            >
              {validationResult.generalFeedback}
            </VfCallout>

            <div className="flex items-center justify-between p-3 bg-surface-50 rounded-xl border border-surface-200 dark:bg-surface-800 dark:border-white/5">
              <span className="text-[11px] font-medium text-surface-700 dark:text-surface-300">{t('Safety Score')}</span>
              <span className={`text-lg font-black ${validationResult.safetyScore >= 80 ? 'text-green-500 dark:text-green-400' : validationResult.safetyScore >= 50 ? 'text-yellow-500 dark:text-yellow-400' : 'text-red-500 dark:text-red-400'}`}>
                {validationResult.safetyScore}/100
              </span>
            </div>

            {validationResult.issues && validationResult.issues.length > 0 && (
              <div className="space-y-2 mt-4">
                <h5 className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">{t('Detected Issues')}</h5>
                {validationResult.issues.map((issue: any, i: number) => (
                  <div key={i} className="bg-surface-50 p-3 rounded-lg border border-surface-200 dark:bg-surface-800/80 dark:border-white/5">
                    <div className="flex items-start gap-2 mb-1.5">
                      {issue.severity === 'CRITICAL' ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" /> :
                        issue.severity === 'WARNING' ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 dark:text-yellow-400 shrink-0 mt-0.5" /> :
                          <Info className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />}
                      <span className="text-[11px] font-medium text-surface-950 dark:text-white">{issue.message}</span>
                    </div>
                    {issue.suggestedFix && (
                      <p className="text-[10px] text-purple-700 ml-5 bg-purple-500/10 px-2 py-1 rounded inline-block mt-1 dark:text-purple-300">
                        {t('Fix:')} {issue.suggestedFix}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <VfActionButton
              onClick={handleValidate}
              variant="secondary"
              className="w-full mt-4"
            >
              {t('Re-Validate Circuit')}
            </VfActionButton>
          </div>
        )}
      </div>
    </VfFloatingPanel>
  );
}
