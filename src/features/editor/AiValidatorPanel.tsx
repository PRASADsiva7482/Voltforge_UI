import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ShieldAlert, CheckCircle, AlertTriangle, Info, Play, Loader2 } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import { useProjectStore } from '../../store/projectStore';
import { aiApi } from '../../api/services';

interface Props { isOpen: boolean; onClose: () => void; }

export default function AiValidatorPanel({ isOpen, onClose }: Props) {
  const { nodes, wires } = useCanvasStore();
  const { currentProject } = useProjectStore();
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const handleValidate = async () => {
    if (nodes.length === 0) return alert('Add components to the canvas first.');
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
      alert('Validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
      className="absolute top-16 right-4 w-80 glass rounded-2xl overflow-hidden z-30 shadow-2xl border border-white/10 flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-surface-900/60">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold text-white">AI Circuit Validator</span>
        </div>
        <button onClick={onClose} className="text-surface-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!validationResult && !isValidating && (
          <div className="text-center py-6">
            <ShieldAlert className="w-10 h-10 text-surface-600 mx-auto mb-3" />
            <p className="text-xs text-surface-400 mb-4">Validate your circuit wiring, power distribution, and component logic for potential safety or functional issues.</p>
            <button onClick={handleValidate} className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.3)]">
              <Play className="w-3.5 h-3.5" /> Start Validation
            </button>
          </div>
        )}

        {isValidating && (
          <div className="text-center py-10 flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
            <p className="text-xs text-surface-400 animate-pulse">AI is analyzing circuit topology...</p>
          </div>
        )}

        {validationResult && !isValidating && (
          <div className="space-y-4">
            <div className={`p-3 rounded-xl border flex items-start gap-3 ${validationResult.isValid ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              {validationResult.isValid ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />}
              <div>
                <h4 className={`text-sm font-bold mb-1 ${validationResult.isValid ? 'text-green-400' : 'text-red-400'}`}>
                  {validationResult.isValid ? 'Circuit looks safe!' : 'Circuit validation failed'}
                </h4>
                <p className="text-[10px] text-surface-300 leading-relaxed">{validationResult.generalFeedback}</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-surface-800 rounded-xl border border-white/5">
              <span className="text-[11px] font-medium text-surface-300">Safety Score</span>
              <span className={`text-lg font-black ${validationResult.safetyScore >= 80 ? 'text-green-400' : validationResult.safetyScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {validationResult.safetyScore}/100
              </span>
            </div>

            {validationResult.issues && validationResult.issues.length > 0 && (
              <div className="space-y-2 mt-4">
                <h5 className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Detected Issues</h5>
                {validationResult.issues.map((issue: any, i: number) => (
                  <div key={i} className="bg-surface-800/80 p-3 rounded-lg border border-white/5">
                    <div className="flex items-start gap-2 mb-1.5">
                      {issue.severity === 'CRITICAL' ? <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" /> : 
                       issue.severity === 'WARNING' ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" /> : 
                       <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />}
                      <span className="text-[11px] font-medium text-white">{issue.message}</span>
                    </div>
                    {issue.suggestedFix && (
                      <p className="text-[10px] text-purple-300 ml-5 bg-purple-500/10 px-2 py-1 rounded inline-block mt-1">
                        💡 Fix: {issue.suggestedFix}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button onClick={handleValidate} className="w-full mt-4 bg-surface-800 hover:bg-surface-700 text-white text-[11px] font-medium py-2 rounded-lg border border-white/10 transition-colors">
              Re-Validate Circuit
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
