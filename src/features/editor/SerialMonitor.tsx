import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Send, Terminal, Trash2, X } from 'lucide-react';
import { BAUD_RATES, useSimulationStore } from '../../store/simulationStore';
import VfSelect from '../../components/ui/VfSelect';
import VfInput from '../../components/ui/VfInput';
import VfPanelHeader from '../../components/ui/VfPanelHeader';
import VfTerminal from '../../components/ui/VfTerminal';
import VfCollapsible from '../../components/ui/VfCollapsible';
import { useTranslation } from 'react-i18next';

export default function SerialMonitor() {
  const { t } = useTranslation();
  const { serialLogs, serialPanelOpen, baudRate, debugSnapshot, clearSerial, setBaudRate, setSerialPanelOpen, sendSerialInput } = useSimulationStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [serialLogs, serialPanelOpen]);

  return (
    <div className="border-t border-white/5 bg-[#080812] flex-shrink-0">
      <VfCollapsible
        isOpen={serialPanelOpen}
        onToggle={() => setSerialPanelOpen(!serialPanelOpen)}
        title={t("Serial Monitor")}
        icon={<Terminal className="w-3.5 h-3.5 text-volt-400" />}
        headerClassName="!bg-transparent border-none px-3 py-1.5"
        bodyClassName="h-56 grid grid-cols-[1fr_220px] p-0"
        actions={
          <div className="flex items-center gap-2">
            <div className="w-[85px]" onClick={(e) => e.stopPropagation()}>
              <VfSelect
                value={baudRate}
                onChange={(event) => setBaudRate(Number(event.target.value))}
                options={BAUD_RATES.map((rate) => ({ value: rate, label: `${rate} baud` }))}
                className="h-6 py-0 pl-2 pr-6 rounded-md bg-white/5 border border-white/10 text-[10px] text-surface-300"
                title={t("Baud rate")}
              />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); clearSerial(); }}
              className="p-1 rounded text-surface-500 hover:text-white hover:bg-white/5 cursor-pointer outline-none"
              title={t("Clear serial output")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col h-full">
          <VfTerminal
            lines={serialLogs.map(text => {
              const lower = text.toLowerCase();
              let type: 'info' | 'error' | 'warning' | 'success' = 'info';
              if (lower.includes('error') || lower.includes('fail')) type = 'error';
              else if (lower.includes('warn')) type = 'warning';
              else if (lower.includes('success') || lower.includes('ok')) type = 'success';
              return { text, type };
            })}
            emptyMessage={t("No serial output yet...")}
            height="h-auto flex-1 bg-transparent border-none rounded-none"
            showLineNumbers={true}
          />
          <form
            className="flex items-center gap-2 border-t border-white/5 px-2 py-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!input.trim()) return;
              sendSerialInput(input);
              setInput('');
            }}
          >
            <VfInput
              value={input}
              onChange={(event) => setInput(event.target.value)}
              inputSize="sm"
              className="h-7 bg-white/5 border border-white/10 text-[11px] text-white focus:ring-1 focus:ring-volt-500/50"
              placeholder={t("Send to UART...")}
            />
            <button className="h-7 w-7 rounded-md bg-volt-500/15 text-volt-300 hover:bg-volt-500/25 outline-none cursor-pointer" title={t("Send serial input")}>
              <Send className="mx-auto h-3.5 w-3.5" />
            </button>
          </form>
        </div>
        <div className="border-l border-white/5 p-2 overflow-y-auto h-full">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">{t("Debugger")}</span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-surface-500">
              {t("line")} {debugSnapshot.currentLine ?? '-'}
            </span>
          </div>
          <div className="mb-2">
            <div className="text-[9px] uppercase tracking-wider text-surface-500">{t("Variables Watch")}</div>
            {Object.keys(debugSnapshot.variables).length === 0 ? (
              <div className="mt-1 text-[10px] text-surface-600">{t("No variables yet")}</div>
            ) : Object.entries(debugSnapshot.variables).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2 rounded bg-white/[0.03] px-2 py-1 text-[10px]">
                <span className="font-mono text-surface-300">{key}</span>
                <span className="font-mono text-volt-300">{String(value)}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-surface-500">{t("GPIO")}</div>
            {Object.entries(debugSnapshot.pins).slice(0, 12).map(([key, pin]) => (
              <div key={key} className="mt-1 flex justify-between gap-2 rounded bg-white/[0.03] px-2 py-1 text-[10px]">
                <span className="font-mono text-surface-300">D{key}</span>
                <span className="font-mono text-amber-300">{pin.state}:{pin.value}</span>
              </div>
            ))}
          </div>
        </div>
      </VfCollapsible>
    </div>
  );
}
