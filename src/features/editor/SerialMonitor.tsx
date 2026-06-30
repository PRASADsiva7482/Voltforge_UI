import { useRef, useEffect, useState } from 'react';
import { useSimulationStore, BAUD_RATES } from '../../store/simulationStore';
import { Terminal, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export default function SerialMonitor() {
  const serialLogs = useSimulationStore((s) => s.serialLogs);
  const baudRate = useSimulationStore((s) => s.baudRate);
  const setBaudRate = useSimulationStore((s) => s.setBaudRate);
  const sendSerialInput = useSimulationStore((s) => s.sendSerialInput);
  const clearSerial = useSimulationStore((s) => s.clearSerial);
  const isOpen = useSimulationStore((s) => s.serialPanelOpen);
  const setSerialPanelOpen = useSimulationStore((s) => s.setSerialPanelOpen);
  
  const onToggle = () => setSerialPanelOpen(!isOpen);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [serialLogs]);

  const handleSend = () => {
    if (input.trim()) {
      sendSerialInput(input.trim());
      setInput('');
    }
  };

  return (
    <div className={`vf-serial-monitor ${isOpen ? 'is-open' : ''}`}>
      <button className="vf-serial-monitor__toggle" onClick={onToggle}>
        <Terminal size={14} />
        <span>Serial Monitor</span>
        <span className="vf-serial-monitor__log-count">{serialLogs.length}</span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {isOpen && (
        <div className="vf-serial-monitor__body">
          <div className="vf-serial-monitor__toolbar">
            <select
              className="vf-serial-monitor__baud"
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
            >
              {BAUD_RATES.map(b => <option key={b} value={b}>{b} baud</option>)}
            </select>
            <button className="vf-serial-monitor__clear" onClick={clearSerial} title="Clear">
              <Trash2 size={12} />
            </button>
          </div>
          <div className="vf-serial-monitor__output" ref={scrollRef}>
            {serialLogs.length === 0 ? (
              <span className="vf-serial-monitor__placeholder">No serial output yet...</span>
            ) : (
              serialLogs.map((line, i) => (
                <div
                  key={i}
                  className={`vf-serial-monitor__line ${line.startsWith('>') ? 'is-input' : ''}`}
                >
                  {line}
                </div>
              ))
            )}
          </div>
          <div className="vf-serial-monitor__input-row">
            <input
              className="vf-serial-monitor__input"
              placeholder="Type a command..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            />
            <button className="vf-serial-monitor__send" onClick={handleSend}>
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
