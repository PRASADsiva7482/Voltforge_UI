import React from 'react';
import { Activity, AlertTriangle, Cpu, Radio, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FloatingPanel } from '../../components/ui/FloatingPanel';
import { useSimulationStore } from '../../store/simulationStore';
import type { PwmDiagnostics, PwmSliceDiagnostics } from '../simulator/rp2040Pwm';

export interface PwmInspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics?: PwmDiagnostics | null;
}

const SLICE_GPIO_MAP: Record<number, { primaryA: number; primaryB: number; secA?: number; secB?: number }> = {
  0: { primaryA: 0, primaryB: 1, secA: 16, secB: 17 },
  1: { primaryA: 2, primaryB: 3, secA: 18, secB: 19 },
  2: { primaryA: 4, primaryB: 5, secA: 20, secB: 21 },
  3: { primaryA: 6, primaryB: 7, secA: 22, secB: 23 },
  4: { primaryA: 8, primaryB: 9, secA: 24, secB: 25 },
  5: { primaryA: 10, primaryB: 11, secA: 26, secB: 27 },
  6: { primaryA: 12, primaryB: 13, secA: 28, secB: 29 },
  7: { primaryA: 14, primaryB: 15 },
};

function formatDivMode(mode: number): { code: string; label: string; badgeClass: string } {
  switch (mode) {
    case 0:
      return { code: '00', label: 'Free-running', badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    case 1:
      return { code: '01', label: 'B_HIGH (Gated by B)', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    case 2:
      return { code: '10', label: 'B_RISING (Edge clocked)', badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
    case 3:
      return { code: '11', label: 'B_FALLING (Edge clocked)', badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
    default:
      return { code: '??', label: 'Unknown', badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  }
}

function formatHexByte(val: number): string {
  return '0x' + (val & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

export default function PwmInspectorPanel({ isOpen, onClose, diagnostics: overrideDiagnostics }: PwmInspectorPanelProps) {
  const { t } = useTranslation();
  const storeDiagnostics = useSimulationStore((state) => state.pwmDiagnostics);
  const pwmDiagnostics = overrideDiagnostics !== undefined ? overrideDiagnostics : storeDiagnostics;
  const isSimulating = useSimulationStore((state) => state.isSimulating);

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("RP2040 PWM Peripheral Inspector")}
      icon={<Activity size={15} />}
      width="540px"
    >
      <div className="vf-pwm-inspector p-3 text-xs text-slate-300 space-y-3 max-h-[80vh] overflow-y-auto">
        {!pwmDiagnostics ? (
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-center space-y-2">
            <Cpu size={24} className="mx-auto text-slate-500" />
            <div className="font-medium text-slate-300">
              {isSimulating
                ? t("No RP2040 PWM Activity Detected")
                : t("Simulation Inactive")}
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed max-w-sm mx-auto">
              {isSimulating
                ? t("Ensure your circuit includes a Raspberry Pi Pico component with firmware actively configuring the hardware PWM peripheral (base 0x40050000).")
                : t("Start the simulation with a Raspberry Pi Pico project to inspect live PWM slices, clock dividers, compare thresholds, and DMA request states.")}
            </p>
          </div>
        ) : (
          <>
            {/* Global Register & Interrupt Status Bar */}
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] border-b border-slate-800/80 pb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Radio size={13} className="text-emerald-400" />
                  RP2040 PWM Hardware (IRQ 4)
                </span>
                <span className="font-mono text-slate-400">Base: 0x40050000</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                  <div className="text-slate-400 text-[10px]">PWM_EN</div>
                  <div className="font-mono font-bold text-emerald-400">
                    {formatHexByte(pwmDiagnostics.enRegister)}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                  <div className="text-slate-400 text-[10px]">INTR (Raw)</div>
                  <div className="font-mono font-bold text-amber-400">
                    {formatHexByte(pwmDiagnostics.rawInterrupts)}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                  <div className="text-slate-400 text-[10px]">INTE (Enable)</div>
                  <div className="font-mono font-bold text-blue-400">
                    {formatHexByte(pwmDiagnostics.interruptEnable)}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                  <div className="text-slate-400 text-[10px]">INTS (Masked)</div>
                  <div className="font-mono font-bold text-rose-400">
                    {formatHexByte(pwmDiagnostics.maskedInterrupts)}
                  </div>
                </div>
              </div>
            </div>

            {/* Slices List */}
            <div className="space-y-2.5">
              {pwmDiagnostics.slices.map((slice: PwmSliceDiagnostics) => {
                const divModeInfo = formatDivMode(slice.divMode);
                const gpios = SLICE_GPIO_MAP[slice.sliceIndex];
                const rawIntrBit = (pwmDiagnostics.rawInterrupts & (1 << slice.sliceIndex)) !== 0;
                const inteBit = (pwmDiagnostics.interruptEnable & (1 << slice.sliceIndex)) !== 0;

                return (
                  <div
                    key={slice.sliceIndex}
                    className={`p-2.5 rounded-lg border transition-colors ${
                      slice.enabled
                        ? 'bg-slate-900/70 border-slate-700/80 shadow-sm shadow-emerald-950/20'
                        : 'bg-slate-950/40 border-slate-800/50 opacity-70'
                    }`}
                  >
                    {/* Slice Header */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100">
                          {`Slice ${slice.sliceIndex}`}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          GPIO {gpios.primaryA} (A) / {gpios.primaryB} (B)
                          {gpios.secA !== undefined ? ` | ${gpios.secA}/${gpios.secB}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] border font-medium ${
                            slice.enabled
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {slice.enabled ? 'ACTIVE' : 'OFF'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] border font-mono ${divModeInfo.badgeClass}`}
                          title={`DIVMODE ${divModeInfo.code}: ${divModeInfo.label}`}
                        >
                          DIVMODE {divModeInfo.code}
                        </span>
                        {slice.phaseCorrect && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            Phase-Correct
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Non-Free-Running Warning / Channel B Input Notice */}
                    {slice.divMode !== 0 && (
                      <div className="mt-1.5 p-1.5 rounded bg-amber-950/30 border border-amber-800/40 text-amber-300 text-[11px] flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                          <span>Channel B acts as input ({divModeInfo.label}). PWM out B suppressed.</span>
                        </div>
                        <span className="font-mono text-[10px] px-1 rounded bg-amber-900/50">
                          B Level: {slice.pinBLevel ? 'HIGH' : 'LOW'}
                        </span>
                      </div>
                    )}

                    {/* Core Parameters Grid */}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      {/* Counter & Period */}
                      <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/60">
                        <div className="text-slate-400 text-[10px]">Counter / TOP</div>
                        <div className="font-mono font-medium text-slate-200">
                          {slice.counter} <span className="text-slate-500">/</span> {slice.top}
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/60">
                        <div className="text-slate-400 text-[10px]">Clock Divider (8.4)</div>
                        <div className="font-mono text-slate-200">
                          {slice.intDiv}.{slice.fracDiv} <span className="text-slate-400 text-[10px]">({slice.effectiveDivider.toFixed(2)}×)</span>
                        </div>
                      </div>

                      {/* Frequency */}
                      <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/60">
                        <div className="text-slate-400 text-[10px]">Frequency</div>
                        <div className="font-mono text-slate-200">
                          {slice.divMode === 2 || slice.divMode === 3
                            ? 'Edge-clocked'
                            : slice.frequency_Hz >= 1000
                            ? `${(slice.frequency_Hz / 1000).toFixed(2)} kHz`
                            : `${slice.frequency_Hz.toFixed(1)} Hz`}
                        </div>
                      </div>
                    </div>

                    {/* Channel Compare, Duty, and Live Output Indicators */}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      {/* Channel A */}
                      <div className="p-2 rounded bg-slate-950/60 border border-slate-800/70 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">Channel A</span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                slice.outA ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'
                              }`}
                            />
                            <span className="font-mono text-[10px] text-slate-400">
                              {slice.outA ? 'HIGH' : 'LOW'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-slate-400 text-[10px]">
                          <span>Compare CC_A: {slice.compareA}</span>
                          <span className="font-medium text-slate-300">
                            {(slice.dutyA * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full transition-all duration-150"
                            style={{ width: `${Math.min(100, Math.max(0, slice.dutyA * 100))}%` }}
                          />
                        </div>
                      </div>

                      {/* Channel B */}
                      <div className="p-2 rounded bg-slate-950/60 border border-slate-800/70 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">Channel B</span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                slice.outB ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'
                              }`}
                            />
                            <span className="font-mono text-[10px] text-slate-400">
                              {slice.divMode !== 0 ? 'INPUT' : slice.outB ? 'HIGH' : 'LOW'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-slate-400 text-[10px]">
                          <span>Compare CC_B: {slice.compareB}</span>
                          <span className="font-medium text-slate-300">
                            {slice.divMode !== 0 ? 'Input Mode' : `${(slice.dutyB * 100).toFixed(1)}%`}
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`${slice.divMode !== 0 ? 'bg-amber-500/40' : 'bg-emerald-500'} h-full transition-all duration-150`}
                            style={{ width: `${slice.divMode !== 0 ? 0 : Math.min(100, Math.max(0, slice.dutyB * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* DMA & IRQ Flags for this slice */}
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/40 font-mono">
                      <span>DREQ {24 + slice.sliceIndex} (WRAP{slice.sliceIndex})</span>
                      <div className="flex items-center gap-2">
                        <span>INTE: {inteBit ? '1' : '0'}</span>
                        <span className={rawIntrBit ? 'text-amber-400 font-bold' : ''}>
                          INTR: {rawIntrBit ? 'ASSERTED' : '0'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </FloatingPanel>
  );
}
