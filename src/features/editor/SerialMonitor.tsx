import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSimulationStore } from '../../store/simulationStore';
import { Terminal, Send, Trash2, ChevronDown, ChevronUp, Copy, Download, Sparkles } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import type { ExecutionAttachment } from '../ai/executionContext';

export default function SerialMonitor({ onAskAi }: { onAskAi?: (attachment: ExecutionAttachment) => void }) {
  const { t } = useTranslation();
  const serialLogs = useSimulationStore((s) => s.serialLogs);
  const baudRate = useSimulationStore((s) => s.baudRate);
  const sendSerialInput = useSimulationStore((s) => s.sendSerialInput);
  const clearSerial = useSimulationStore((s) => s.clearSerial);
  const isOpen = useSimulationStore((s) => s.serialPanelOpen);
  const setSerialPanelOpen = useSimulationStore((s) => s.setSerialPanelOpen);
  const running = useSimulationStore((s) => s.isSimulating);
  const executionMode = useSimulationStore((s) => s.executionMode);
  const execution = useSimulationStore(s => s.execution);
  const restartRequired = useSimulationStore(s => s.restartRequired);
  const entries = useSimulationStore(s => s.serialEntries);
  const addToast = useToastStore(s => s.addToast);
  const [height, setHeight] = useState(170);
  const resize = useRef<{ y: number; height: number } | null>(null);
  const nearBottom = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  
  const onToggle = () => setSerialPanelOpen(!isOpen);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && nearBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [serialLogs]);

  useEffect(() => { nearBottom.current = true; setShowLatest(false); setInput(''); }, [execution.id]);

  const logText = entries.map(entry => `[${new Date(entry.timestamp).toISOString()}] ${entry.kind}: ${entry.text}`).join('\n');
  const output = entries.filter(entry => entry.kind === 'output').map(entry => entry.text);
  const label = ({ idle: 'Idle', preparing: 'Preparing', compiling: 'Compiling', starting: 'Starting', running: executionMode === 'avr8js' ? 'AVR firmware' : 'Source compatibility', stopped: 'Stopped', 'compilation-failed': 'Compilation failed', 'runtime-error': 'Runtime error', unavailable: 'Unavailable' })[execution.phase];
  const clampHeight = (value: number) => Math.max(120, Math.min(value, window.innerHeight * .5));

  const handleSend = () => {
    if (running && input.trim()) {
      sendSerialInput(input.trim());
      setInput('');
    }
  };

  return (
    <div className={`vf-serial-monitor ${isOpen ? 'is-open' : ''}`}>
      {isOpen && <div className="vf-serial-monitor__resize" role="separator" tabIndex={0} aria-label="Resize serial monitor" aria-orientation="horizontal" aria-valuenow={Math.round(height)} aria-valuemin={120} aria-valuemax={Math.round(window.innerHeight * .5)}
        onPointerDown={e => { resize.current = { y: e.clientY, height }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (resize.current) setHeight(clampHeight(resize.current.height + resize.current.y - e.clientY)); }}
        onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }}
        onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setHeight(h => clampHeight(h + (e.key === 'ArrowUp' ? 24 : -24))); } }} />}
      <button className="vf-serial-monitor__toggle" onClick={onToggle} aria-expanded={isOpen}>
        <Terminal size={14} />
        <span>{t("Serial Monitor")}</span>
        <span className="vf-serial-monitor__log-count">{serialLogs.length}</span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {isOpen && (
        <div className="vf-serial-monitor__body" style={{ height }}>
          <div className="vf-serial-monitor__toolbar">
            <span role="status" title="Reported by firmware; change Serial.begin() and restart to change baud. Baud mismatch is not emulated.">{Math.round(baudRate)} baud · {label}</span>
            {onAskAi && <button onClick={() => onAskAi({ id: crypto.randomUUID(), projectId: execution.projectId!, runId: execution.id, boardType: execution.boardType, phase: execution.phase, baudRate, output: output.slice(-40).map(line => line.slice(-2000)), diagnostic: execution.diagnostic?.slice(0, 8000) || null })} disabled={!execution.projectId || (!output.length && !execution.diagnostic)} aria-label="Ask AI about this output" title="Review this output in AI; context sharing must be enabled before sending"><Sparkles size={13} /></button>}
            <button disabled={!entries.length} aria-label="Copy serial logs" title="Copy serial logs" onClick={() => { void navigator.clipboard.writeText(logText).then(() => addToast('Serial logs copied', 'success')).catch(() => addToast('Clipboard unavailable', 'error')); }}><Copy size={13} /></button>
            <button disabled={!entries.length} aria-label="Export serial logs" title="Export serial logs" onClick={() => { const url = URL.createObjectURL(new Blob([logText], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = `voltforge-serial-${execution.id || 'session'}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={13} /></button>
            <button className="vf-serial-monitor__clear" onClick={clearSerial} title={t("Clear")} aria-label="Clear serial output">
              <Trash2 size={12} />
            </button>
          </div>
          <div className="vf-serial-monitor__output" ref={scrollRef} onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; setShowLatest(!nearBottom.current); }}>
            {restartRequired && <p role="status">Firmware changed. Restart to execute your edits. Circuit edits update the live electrical model.</p>}
            {execution.diagnostic && <p>{execution.diagnostic}</p>}
            {output.length === 0 && <p className="vf-serial-monitor__placeholder">{running ? 'Waiting for firmware serial data. Use Serial.begin() and Serial.print() in your sketch.' : ['preparing', 'compiling', 'starting'].includes(execution.phase) ? 'Execution is not running yet. You can cancel preparation from the toolbar.' : 'No firmware output. Run a supported sketch to receive serial data.'}</p>}
            {(
              serialLogs.map((line, i) => (
                <div
                  key={i}
                  title={entries[i] ? `${new Date(entries[i].timestamp).toLocaleTimeString()} · ${entries[i].kind}` : undefined}
                  className={`vf-serial-monitor__line ${entries[i]?.kind !== 'output' ? 'is-input' : ''}`}
                >
                  {line}
                </div>
              ))
            )}
          </div>
          {showLatest && <button onClick={() => { nearBottom.current = true; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); setShowLatest(false); }}>Latest output ↓</button>}
          <div className="vf-serial-monitor__input-row">
            <input
              className="vf-serial-monitor__input"
              placeholder={t("Type a command...")}
              value={input}
              maxLength={1024}
              aria-label="Serial input"
              disabled={!running}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            />
            <button className="vf-serial-monitor__send" onClick={handleSend} disabled={!running || !input.trim()} aria-label="Send serial input">
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
