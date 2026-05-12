import { useEffect, useRef } from 'react';
import { ChevronDown, Terminal, Trash2, X } from 'lucide-react';
import { BAUD_RATES, useSimulationStore } from '../../store/simulationStore';

export default function SerialMonitor() {
  const { serialLogs, serialPanelOpen, baudRate, clearSerial, setBaudRate, setSerialPanelOpen } = useSimulationStore();
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
        <div
          ref={scrollRef}
          className="h-40 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-green-400"
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
      )}
    </div>
  );
}
