import React, { useState } from 'react';
import {
  AlertCircle,
  Clock,
  Cpu,
  Layers,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FloatingPanel } from '../../components/ui/FloatingPanel';
import { useSimulationStore } from '../../store/simulationStore';
import type {
  CoreLifecycleState,
  Rp2040ExecutionSnapshot,
} from '../simulator/rp2040Telemetry';

export interface Rp2040CpuInspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  isSimulationPaused?: boolean;
  snapshot?: Rp2040ExecutionSnapshot | null;
}

function formatValue(val: number, hex: boolean): string {
  if (hex) {
    return '0x' + (val >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
  return (val >>> 0).toLocaleString();
}

function formatHexByte(val: number): string {
  return '0x' + (val & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

function formatHex32(val: number): string {
  return '0x' + (val >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function getLifecycleBadge(state: CoreLifecycleState): {
  label: string;
  badgeClass: string;
} {
  switch (state) {
    case 'RUNNABLE':
      return {
        label: 'RUNNABLE',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    case 'SLEEPING':
      return {
        label: 'SLEEPING (WFE/WFI)',
        badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      };
    case 'HANDLER_MODE':
      return {
        label: 'HANDLER MODE',
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      };
    case 'BOOTROM_PARKED':
      return {
        label: 'BOOTROM PARKED',
        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      };
    default:
      return {
        label: String(state),
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      };
  }
}

export default function Rp2040CpuInspectorPanel({
  isOpen,
  onClose,
  onRefresh,
  isSimulationPaused = false,
  snapshot: overrideSnapshot,
}: Rp2040CpuInspectorPanelProps) {
  const { t } = useTranslation();
  const [selectedCore, setSelectedCore] = useState<0 | 1>(0);
  const [useHex, setUseHex] = useState<boolean>(true);

  const storeSnapshot = useSimulationStore((state) => state.rp2040Snapshot);
  const isSimulating = useSimulationStore((state) => state.isSimulating);
  const expectedGenerationId = useSimulationStore((state) => state.expectedGenerationId);
  const lastSequenceId = useSimulationStore((state) => state.lastSequenceId);

  const snapshot = overrideSnapshot !== undefined ? overrideSnapshot : storeSnapshot;
  const core = snapshot ? (selectedCore === 0 ? snapshot.core0 : snapshot.core1) : null;

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('RP2040 Dual-Core CPU Inspector')}
      icon={<Cpu size={15} />}
      width="560px"
      footer={
        <div className="flex items-center justify-between text-[11px] text-slate-400 w-full px-1">
          <div className="flex items-center gap-2">
            <span>
              {t('Gen')}: <span className="font-mono text-slate-200">{snapshot ? snapshot.generationId : expectedGenerationId}</span>
            </span>
            <span>•</span>
            <span>
              {t('Seq')}: <span className="font-mono text-slate-200">{snapshot ? snapshot.sequenceId : lastSequenceId}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">
              {snapshot?.isMulticoreActive ? t('Dual-Core Co-Simulation Active') : t('Single-Core Execution')}
            </span>
          </div>
        </div>
      }
    >
      <div className="vf-rp2040-cpu-inspector p-3 text-xs text-slate-300 space-y-3 max-h-[80vh] overflow-y-auto">
        {/* Controls Toolbar: Core Selector, Format Toggle, Manual Refresh */}
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedCore(0)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedCore === 0
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              {t('Core 0')}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCore(1)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedCore === 1
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              {t('Core 1')}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseHex(!useHex)}
              className="px-2 py-1 rounded bg-slate-800 text-[11px] font-mono text-slate-300 hover:bg-slate-700 border border-slate-700/60"
              title={t('Toggle Hexadecimal / Decimal display format')}
            >
              {useHex ? 'HEX' : 'DEC'}
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={!isSimulationPaused}
                className={`p-1.5 rounded border text-[11px] flex items-center gap-1 transition-colors ${
                  isSimulationPaused
                    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700 cursor-pointer'
                    : 'bg-slate-900/40 text-slate-600 border-slate-800/50 cursor-not-allowed'
                }`}
                title={isSimulationPaused ? t('Query snapshot while paused') : t('Manual refresh available only while paused')}
              >
                <RefreshCw size={12} className={isSimulationPaused ? 'text-blue-400' : ''} />
                <span>{t('Refresh')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Unavailable or Stale Placeholder */}
        {!snapshot ? (
          <div className="p-6 rounded-lg bg-slate-900/60 border border-slate-800 text-center space-y-2">
            <Cpu size={28} className="mx-auto text-slate-500 animate-pulse" />
            <div className="font-medium text-slate-200 text-sm">
              {isSimulating ? t('Awaiting RP2040 CPU Telemetry...') : t('Simulation Inactive')}
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed max-w-sm mx-auto">
              {isSimulating
                ? t('Circuit simulation is running. Telemetry snapshots will attach automatically at 10 Hz when RP2040 firmware is loaded.')
                : t('Start the simulation with a Raspberry Pi Pico component placed to observe dual-core execution, registers, SIO FIFOs, and spinlocks.')}
            </p>
          </div>
        ) : (
          <>
            {/* Host Emulator Errors Alert */}
            {snapshot.errors && snapshot.errors.length > 0 && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">{t('Host Controller Errors')}</div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-200">
                    {snapshot.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Selected Core Status Bar */}
            {core && (
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">
                      {t('Core {{id}}', { id: core.coreId })}
                    </span>
                    {(() => {
                      const badge = getLifecycleBadge(core.lifecycle);
                      return (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border ${badge.badgeClass}`}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Clock size={12} className="text-slate-500" />
                      <span>
                        {t('Core Cycles')}: <span className="font-mono text-slate-200">{core.cycles.toLocaleString()}</span>
                      </span>
                    </div>
                    <span>•</span>
                    <div>
                      <span>
                        {t('SoC Cycles')}: <span className="font-mono text-slate-200">{snapshot.totalCycleCount.toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                    <div className="text-slate-400 text-[10px]">{t('Execution Mode')}</div>
                    <div className="font-mono font-medium text-slate-200">
                      {core.flags.ipsr === 0 ? t('Thread Mode') : t('Handler Mode')}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                    <div className="text-slate-400 text-[10px]">{t('Exception / IPSR')}</div>
                    <div className="font-mono font-medium text-amber-400">
                      {`${core.flags.exceptionName} (${core.flags.ipsr})`}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                    <div className="text-slate-400 text-[10px]">{t('Low-Power Wait')}</div>
                    <div className={`font-mono font-medium ${core.waiting ? 'text-blue-400' : 'text-slate-400'}`}>
                      {core.waiting ? t('Active (WFE/WFI)') : t('None')}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                    <div className="text-slate-400 text-[10px]">{t('IRQ Pending')}</div>
                    <div className={`font-mono font-medium ${core.interrupts?.pending ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                      {core.interrupts ? formatHex32(core.interrupts.pending) : '0x00000000'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Special Registers & Condition Flags */}
            {core && (
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200 text-xs flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                  <Zap size={13} className="text-amber-400" />
                  {t('Special Registers & Status Flags')}
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                    <div className="text-slate-400 text-[10px]">PC</div>
                    <div className="font-mono font-bold text-emerald-400">{formatValue(core.pc, useHex)}</div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                    <div className="text-slate-400 text-[10px]">SP</div>
                    <div className="font-mono font-bold text-blue-400">{formatValue(core.sp, useHex)}</div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                    <div className="text-slate-400 text-[10px]">LR</div>
                    <div className="font-mono font-bold text-purple-400">{formatValue(core.lr, useHex)}</div>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/50">
                    <div className="text-slate-400 text-[10px]">xPSR</div>
                    <div className="font-mono font-bold text-slate-200">{formatHex32(core.xpsr)}</div>
                  </div>
                </div>

                {/* Flags Bitmask Decode */}
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/40 border border-slate-800/40 text-[11px]">
                  <div className="text-slate-400 text-[10px] uppercase tracking-wide">{t('Cortex-M0+ Flags')}:</div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className={core.flags.negative ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {`N=${core.flags.negative ? '1' : '0'}`}
                    </span>
                    <span className={core.flags.zero ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {`Z=${core.flags.zero ? '1' : '0'}`}
                    </span>
                    <span className={core.flags.carry ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {`C=${core.flags.carry ? '1' : '0'}`}
                    </span>
                    <span className={core.flags.overflow ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {`V=${core.flags.overflow ? '1' : '0'}`}
                    </span>
                    <span className={core.flags.thumb ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {`T=${core.flags.thumb ? '1' : '0'}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* General Purpose Registers (R0 - R12) */}
            {core && (
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200 text-xs flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span>{t('General Purpose Registers (R0 - R12)')}</span>
                  <span className="text-[10px] text-slate-500 font-normal">{t('Read-Only State')}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                  {core.r0_r12.map((val, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/60 px-2 py-1.5 rounded border border-slate-800/50 flex items-center justify-between"
                    >
                      <span className="text-slate-500 font-mono text-[10px]">R{idx}</span>
                      <span className="font-mono text-slate-200 text-[11px] font-medium">
                        {formatValue(val, useHex)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SIO Multicore Hardware: FIFOs, Spinlocks, Boot ROM */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5">
              <div className="font-semibold text-slate-200 text-xs flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                <Layers size={13} className="text-blue-400" />
                {t('SIO Multicore Hardware & Inter-Core FIFOs')}
              </div>

              {/* FIFO Status Bars */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60 space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-800/50 pb-1">
                    <span className="font-medium text-slate-300">FIFO 0 $\to$ 1</span>
                    <span className="font-mono text-blue-400 font-bold">
                      {`Depth ${snapshot.fifo.fifo0to1.depth}/8`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>{`VLD: ${snapshot.fifo.core0Status.vld ? '1' : '0'}`}</span>
                    <span>{`RDY: ${snapshot.fifo.core0Status.rdy ? '1' : '0'}`}</span>
                    <span className={snapshot.fifo.core0Status.wof ? 'text-rose-400 font-bold' : ''}>
                      {`WOF: ${snapshot.fifo.core0Status.wof ? '1' : '0'}`}
                    </span>
                    <span className={snapshot.fifo.core0Status.roe ? 'text-rose-400 font-bold' : ''}>
                      {`ROE: ${snapshot.fifo.core0Status.roe ? '1' : '0'}`}
                    </span>
                  </div>
                  {snapshot.fifo.fifo0to1.entries.length > 0 && (
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      [{snapshot.fifo.fifo0to1.entries.map((e) => formatHexByte(e)).join(', ')}]
                    </div>
                  )}
                </div>

                <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60 space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-800/50 pb-1">
                    <span className="font-medium text-slate-300">FIFO 1 $\to$ 0</span>
                    <span className="font-mono text-purple-400 font-bold">
                      {`Depth ${snapshot.fifo.fifo1to0.depth}/8`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>{`VLD: ${snapshot.fifo.core1Status.vld ? '1' : '0'}`}</span>
                    <span>{`RDY: ${snapshot.fifo.core1Status.rdy ? '1' : '0'}`}</span>
                    <span className={snapshot.fifo.core1Status.wof ? 'text-rose-400 font-bold' : ''}>
                      {`WOF: ${snapshot.fifo.core1Status.wof ? '1' : '0'}`}
                    </span>
                    <span className={snapshot.fifo.core1Status.roe ? 'text-rose-400 font-bold' : ''}>
                      {`ROE: ${snapshot.fifo.core1Status.roe ? '1' : '0'}`}
                    </span>
                  </div>
                  {snapshot.fifo.fifo1to0.entries.length > 0 && (
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      [{snapshot.fifo.fifo1to0.entries.map((e) => formatHexByte(e)).join(', ')}]
                    </div>
                  )}
                </div>
              </div>

              {/* Spinlocks & Boot ROM Status */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="flex items-center gap-1">
                      <Shield size={11} className="text-emerald-400" />
                      {t('Hardware Spinlocks')}
                    </span>
                    <span className="font-mono text-slate-200">
                      {`${snapshot.spinlocks.claimedCount} / 32`}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-emerald-400 font-semibold">
                    {formatHex32(snapshot.spinlocks.claimedMask)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {t('Ownership')}: <span className="text-slate-400">UNTRACKED</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>{t('Boot ROM Protocol')}</span>
                    <span
                      className={`font-semibold ${
                        snapshot.bootRom.isLaunched ? 'text-emerald-400' : 'text-purple-400'
                      }`}
                    >
                      {snapshot.bootRom.isLaunched ? t('Launched') : t('Parked')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {t('Handshake')}: <span className="font-mono text-slate-200">{`Step ${snapshot.bootRom.handshakeStep}`}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {t('Vector')}: <span className="font-mono text-slate-400">{formatHex32(snapshot.bootRom.launchEntry ?? 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </FloatingPanel>
  );
}
