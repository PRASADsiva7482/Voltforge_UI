import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Send, Terminal, Trash2, X } from 'lucide-react';
import { BAUD_RATES, useSimulationStore } from '../../store/simulationStore';

export default function SerialMonitor() {
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
      <div className="h-9 flex items-center justify-between px-3 bg-surface-900/80 border-b border-white/5">
        <button
          onClick={() => setSerialPanelOpen(!serialPanelOpen)}
          className="flex items-center gap-2 text-surface-300 hover:text-white transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-volt-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Serial Monitor</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${serialPanelOpen ? '' : '-rotate-90'}`} />
        </button>

        <div className="flex items-center gap-2">
          <select
            value={baudRate}
            onChange={(event) => setBaudRate(Number(event.target.value))}
            className="h-6 px-2 rounded-md bg-white/5 border border-white/10 text-[10px] text-surface-300 focus:outline-none focus:ring-1 focus:ring-volt-500/50"
            title="Baud rate"
          >
            {BAUD_RATES.map((rate) => (
              <option key={rate} value={rate}>{rate} baud</option>
            ))}
          </select>
          <button
            onClick={clearSerial}
            className="p-1 rounded-md text-surface-500 hover:text-white hover:bg-white/5"
            title="Clear serial output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSerialPanelOpen(false)}
            className="p-1 rounded-md text-surface-500 hover:text-white hover:bg-white/5"
            title="Close serial monitor"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {serialPanelOpen && (
        <div className="h-56 grid grid-cols-[1fr_220px]">
          <div className="flex min-w-0 flex-col">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-green-400"
            >
              {serialLogs.length === 0 ? (
                <div className="text-surface-500 italic">No serial output yet...</div>
              ) : (
                serialLogs.map((line, index) => (
                  <div key={`${index}-${line}`} className="whitespace-pre-wrap break-words">
                    {line}
                  </div>
                ))
              )}
            </div>
            <form
              className="flex items-center gap-2 border-t border-white/5 px-2 py-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!input.trim()) return;
                sendSerialInput(input);
                setInput('');
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="h-7 flex-1 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-white outline-none focus:ring-1 focus:ring-volt-500/50"
                placeholder="Send to UART..."
              />
              <button className="h-7 w-7 rounded-md bg-volt-500/15 text-volt-300 hover:bg-volt-500/25" title="Send serial input">
                <Send className="mx-auto h-3.5 w-3.5" />
              </button>
            </form>
          </div>
          <div className="border-l border-white/5 p-2 overflow-y-auto">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">Debugger</span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-surface-500">
                line {debugSnapshot.currentLine ?? '-'}
              </span>
            </div>
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-wider text-surface-500">Variables Watch</div>
              {Object.keys(debugSnapshot.variables).length === 0 ? (
                <div className="mt-1 text-[10px] text-surface-600">No variables yet</div>
              ) : Object.entries(debugSnapshot.variables).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 rounded bg-white/[0.03] px-2 py-1 text-[10px]">
                  <span className="font-mono text-surface-300">{key}</span>
                  <span className="font-mono text-volt-300">{String(value)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-surface-500">GPIO</div>
              {Object.entries(debugSnapshot.pins).slice(0, 12).map(([key, pin]) => (
                <div key={key} className="mt-1 flex justify-between gap-2 rounded bg-white/[0.03] px-2 py-1 text-[10px]">
                  <span className="font-mono text-surface-300">D{key}</span>
                  <span className="font-mono text-amber-300">{pin.state}:{pin.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
