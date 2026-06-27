// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Oscilloscope Panel
// Full-size waveform viewer similar to the Serial Monitor panel.
// Uses VfOscilloscopeScreen for waveform rendering.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useState } from 'react';
import { X, Maximize2, Minimize2, Pause, Play, Activity } from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';
import VfOscilloscopeScreen from '../../components/ui/VfOscilloscopeScreen';
import VfSelect from '../../components/ui/VfSelect';
import VfPanelHeader from '../../components/ui/VfPanelHeader';
import { useTranslation } from 'react-i18next';

interface OscilloscopePanelProps {
  className?: string;
}

export default function OscilloscopePanel({ className = '' }: OscilloscopePanelProps) {
  const { t } = useTranslation();
  const {
    oscilloscopeData,
    oscilloscopePanelOpen,
    setOscilloscopePanelOpen,
  } = useSimulationStore();

  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voltsPerDiv, setVoltsPerDiv] = useState(1.0);
  const [timePerDiv, setTimePerDiv] = useState(1.0); // ms
  const [pausedData, setPausedData] = useState<Record<string, number[]>>({});

  // Get channel data
  const channels = paused ? pausedData : oscilloscopeData;
  const channelKeys = Object.keys(channels);

  const handlePauseToggle = useCallback(() => {
    if (!paused) {
      setPausedData({ ...oscilloscopeData });
    }
    setPaused(!paused);
  }, [paused, oscilloscopeData]);

  if (!oscilloscopePanelOpen) return null;

  const panelHeight = expanded ? 'h-80' : 'h-48';

  return (
    <div className={`flex flex-col border-t border-surface-200 dark:border-white/10 bg-[#0a0f1e] ${panelHeight} ${className}`}>
      <VfPanelHeader
        title={t("Oscilloscope")}
        icon={<Activity className="w-3.5 h-3.5 text-volt-500" />}
        onClose={() => setOscilloscopePanelOpen(false)}
        actions={
          <div className="flex items-center gap-3">
            {/* V/div control */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-surface-400">{t("V/div:")}</span>
              <div className="w-[65px]">
                <VfSelect
                  value={voltsPerDiv}
                  onChange={(e) => setVoltsPerDiv(Number(e.target.value))}
                  options={[
                    { value: 0.1, label: t('0.1V') },
                    { value: 0.5, label: t('0.5V') },
                    { value: 1.0, label: t('1.0V') },
                    { value: 2.0, label: t('2.0V') },
                    { value: 5.0, label: t('5.0V') },
                  ]}
                  className="h-6 py-0 pl-1.5 pr-5 rounded bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 border border-surface-200 dark:border-white/10 text-[9px]"
                />
              </div>
            </div>

            {/* T/div control */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-surface-400">{t("T/div:")}</span>
              <div className="w-[75px]">
                <VfSelect
                  value={timePerDiv}
                  onChange={(e) => setTimePerDiv(Number(e.target.value))}
                  options={[
                    { value: 0.1, label: t('0.1ms') },
                    { value: 0.5, label: t('0.5ms') },
                    { value: 1.0, label: t('1ms') },
                    { value: 5.0, label: t('5ms') },
                    { value: 10.0, label: t('10ms') },
                    { value: 50.0, label: t('50ms') },
                  ]}
                  className="h-6 py-0 pl-1.5 pr-5 rounded bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 border border-surface-200 dark:border-white/10 text-[9px]"
                />
              </div>
            </div>

            {/* Pause / Resume */}
            <button
              onClick={handlePauseToggle}
              className="p-1 rounded hover:bg-surface-200 dark:hover:bg-white/10 cursor-pointer text-surface-400"
              title={paused ? t('Resume') : t('Pause')}
            >
              {paused ? (
                <Play className="w-3 h-3 text-[#22c55e]" />
              ) : (
                <Pause className="w-3 h-3" />
              )}
            </button>

            {/* Expand / Collapse */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-surface-200 dark:hover:bg-white/10 cursor-pointer text-surface-400"
              title={expanded ? t('Collapse') : t('Expand')}
            >
              {expanded ? (
                <Minimize2 className="w-3 h-3" />
              ) : (
                <Maximize2 className="w-3 h-3" />
              )}
            </button>
          </div>
        }
      />

      {/* Waveform canvas screen */}
      <div className="flex-1 relative">
        <VfOscilloscopeScreen
          data={channels}
          voltsPerDiv={voltsPerDiv}
          timePerDiv={timePerDiv}
          paused={paused}
        />
        {channelKeys.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] text-surface-500 font-mono">
              {t("No oscilloscope probes connected")}
            </span>
          </div>
        )}
        {paused && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-yellow-500/20 rounded text-[9px] text-yellow-400 font-mono font-bold pointer-events-none">
            {t("PAUSED")}
          </div>
        )}
      </div>
    </div>
  );
}
