import { lazy, memo, Suspense, useRef, useState, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useToastStore } from '../../store/useToastStore';
import { Loader2, Maximize2, Minimize2, AlignLeft, Eye, EyeOff, Cpu, Upload, X } from 'lucide-react';
import type { OnMount } from '@monaco-editor/react';
import { getBoardPinNumber, getBoardProfile, isBoardComponentType, supportsAvr8js } from '../canvas/boardCatalog';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

// ── Arduino framework boilerplate generator ──
function generateFullCode(userCode: string, boardType?: string): string {
  const nodes = useCanvasStore.getState().nodes;

  // Collect pin assignments from connected components
  const pinDefs: string[] = [];
  const seenTypes = new Set<string>();
  const pinNames = new Set<string>();

  const identifier = (value: string) => value.replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z_])/, '_$1');
  const boardPinNumber = (pin: { id: string; name: string }) => getBoardPinNumber(pin);

  nodes.forEach(node => {
    const type = node.type;
    if (seenTypes.has(type)) return;
    seenTypes.add(type);

    if (type === 'LED_STANDARD' || type === 'LED_RGB') {
      pinDefs.push(`// LED: ${node.name}`);
    }
    if (type === 'SERVO_MOTOR' || type === 'MOTOR_SERVO') {
      pinDefs.push(`// Servo: ${node.name}`);
    }
    if (type.startsWith('SENSOR_') || type.startsWith('DISPLAY_') || type.startsWith('LCD')) {
      pinDefs.push(`// ${type.replace(/_/g, ' ')}: ${node.name}`);
    }
  });

  // Derive usable constants from actual schematic connections. The previous
  // generator emitted only comments, so a "full sketch" could not address the
  // components it described.
  const boardNodes = nodes.filter((node) => isBoardComponentType(node.type));
  const boardIds = new Set(boardNodes.map((node) => node.id));
  useCanvasStore.getState().wires.forEach((wire) => {
    const boardNode = boardIds.has(wire.fromNodeId)
      ? nodes.find((node) => node.id === wire.fromNodeId)
      : boardIds.has(wire.toNodeId)
        ? nodes.find((node) => node.id === wire.toNodeId)
        : undefined;
    const peripheralId = boardIds.has(wire.fromNodeId) ? wire.toNodeId : wire.fromNodeId;
    const peripheral = nodes.find((node) => node.id === peripheralId);
    if (!boardNode || !peripheral) return;
    const boardPinId = boardIds.has(wire.fromNodeId) ? wire.fromPinId : wire.toPinId;
    const peripheralPinId = boardIds.has(wire.fromNodeId) ? wire.toPinId : wire.fromPinId;
    const boardPin = boardNode.pins.find((pin) => pin.id === boardPinId);
    const peripheralPin = peripheral.pins.find((pin) => pin.id === peripheralPinId);
    const pinNumber = boardPin ? boardPinNumber(boardPin) : null;
    if (!pinNumber) return;
    const constantName = `${identifier(peripheral.name)}_${identifier(peripheralPin?.name || peripheralPinId)}_PIN`.toUpperCase();
    if (pinNames.has(constantName)) return;
    pinNames.add(constantName);
    pinDefs.push(`const int ${constantName} = ${pinNumber}; // ${peripheral.name} / ${peripheralPin?.name || peripheralPinId}`);
  });

  // Determine board-specific includes
  const board = boardType || 'ARDUINO_UNO';
  const boardProfile = getBoardProfile(board);
  const boardLabel = boardProfile?.name || board.replace(/_/g, ' ');
  const hasWifi = board.startsWith('ESP') || Boolean(boardProfile?.features.some((feature) => feature.toLowerCase().includes('wi-fi')));

  const includes = [
    '#include <Arduino.h>',
    ...(hasWifi ? ['#include <WiFi.h>'] : []),
    ...(nodes.some(n => n.type.includes('SERVO')) ? ['#include <Servo.h>'] : []),
    ...(nodes.some(n => n.type.includes('LCD') || n.type.includes('OLED')) ? ['#include <Wire.h>'] : []),
    ...(nodes.some(n => n.type.includes('LCD_I2C') || n.type === 'DISPLAY_LCD_I2C') ? ['#include <LiquidCrystal_I2C.h>'] : []),
    ...(nodes.some(n => n.type.includes('OLED') || n.type === 'DISPLAY_OLED') ? ['#include <Adafruit_SSD1306.h>'] : []),
  ];

  const header = [
    '// ═══════════════════════════════════════════════════════════',
    `// VoltForge — Auto-generated Full Sketch`,
    `// Board: ${boardLabel}`,
    `// Components: ${nodes.map(n => n.name).join(', ') || 'None'}`,
    '// ═══════════════════════════════════════════════════════════',
    '',
    ...includes,
    '',
    '// ── Pin Definitions ─────────────────────────────────────────',
    ...(pinDefs.length > 0 ? pinDefs : ['// No board-connected component pins detected']),
    '',
    '// ── User Code ───────────────────────────────────────────────',
    '',
  ].join('\n');

  return header + userCode;
}

function CodeEditor({ readOnly }: { readOnly?: boolean }) {
  const activeCodeFile = useProjectStore((s) => s.activeCodeFile);
  // Keep the subscribed snapshot stable while a project is absent or denied.
  const codeFiles = useProjectStore((s) => s.currentProject?.codeFiles) ?? [];
  const updateCodeFileContent = useProjectStore((s) => s.updateCodeFileContent);
  const setActiveCodeFile = useProjectStore((s) => s.setActiveCodeFile);
  const boardType = useProjectStore((s) => s.currentProject?.boardType);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullCode, setShowFullCode] = useState(false);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const fullCode = useMemo(() => {
    if (!activeCodeFile || !showFullCode) return null;
    return generateFullCode(activeCodeFile.content, boardType);
  }, [activeCodeFile, showFullCode, boardType]);

  const displayedContent = showFullCode && fullCode ? fullCode : activeCodeFile?.content || '';

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const handleFormatCode = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getAction('editor.action.formatDocument')?.run();
  };

  const languageMap: Record<string, string> = {
    cpp: 'cpp', c: 'c', h: 'cpp', ino: 'cpp', py: 'python', js: 'javascript', json: 'json',
  };
  const ext = activeCodeFile?.filename.split('.').pop() || 'cpp';
  const lang = languageMap[ext] || activeCodeFile?.language || 'cpp';

  const customHex = useSimulationStore((s) => s.customHex);
  const setCustomHex = useSimulationStore((s) => s.setCustomHex);
  const addToast = useToastStore((s) => s.addToast);
  const canRunCustomHex = supportsAvr8js(boardType || 'ARDUINO_UNO');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleHexUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && content.includes(':')) {
        setCustomHex(content);
        const selectedBoard = boardType || 'ARDUINO_UNO';
        const boardLabel = getBoardProfile(selectedBoard)?.name || selectedBoard.replace(/_/g, ' ');
        const canRunInBrowser = supportsAvr8js(selectedBoard);
        addToast(
          canRunInBrowser
            ? `Loaded Intel HEX (${file.name}, ${content.length} chars) into AVR8js engine`
            : `Loaded Intel HEX for ${boardLabel}; browser execution will use source compatibility mode`,
          canRunInBrowser ? 'success' : 'warning'
        );
      } else {
        addToast('Invalid Intel HEX file format (must start with :)', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className={`vf-code-editor ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {/* Hidden file input for .hex loading */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".hex"
        style={{ display: 'none' }}
        onChange={handleHexUpload}
      />

      {/* Editor Header */}
      <div className="vf-code-editor__header">
        <div className="vf-code-editor__tabs">
          {codeFiles.map((file) => (
            <button
              key={file.id}
              className={`vf-code-editor__tab ${file.id === activeCodeFile?.id ? 'is-active' : ''}`}
              onClick={() => {
                setActiveCodeFile(file);
                setShowFullCode(false);
              }}
            >
              <span>{file.filename}</span>
            </button>
          ))}
        </div>

        {activeCodeFile && (
          <div className="vf-code-editor__actions">
            {/* Custom HEX / AVR8js Execution Mode Badge */}
            {customHex ? (
              <div
                className="vf-code-editor__action-btn"
                style={{
                    backgroundColor: canRunCustomHex ? 'rgba(56, 189, 248, 0.15)' : 'rgba(250, 204, 21, 0.15)',
                  borderColor: '#38bdf8',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
                title="Custom Intel HEX firmware; AVR8js execution is available only for Uno/Nano/ATmega328P boards"
              >
                <Cpu size={12} />
                <span>{canRunCustomHex ? 'AVR8js: Custom HEX' : 'Custom HEX: Interpreter'}</span>
                <button
                  disabled={readOnly}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomHex(null);
                    addToast('Cleared custom HEX, using source compiler/interpreter', 'info');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Clear custom HEX"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                className="vf-code-editor__action-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={readOnly}
                title="Upload compiled Intel HEX file; direct AVR8js execution is available only for Uno/Nano/ATmega328P boards"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Upload size={12} />
                <span>Load .hex</span>
              </button>
            )}

            <span className="vf-code-editor__lang-badge">{lang}</span>

            {/* Format code button */}
            <button
              className="vf-code-editor__action-btn"
              onClick={handleFormatCode}
              disabled={readOnly}
              title={readOnly ? "Format Code (Disabled in Read-only)" : "Format Code (Auto-indent)"}
            >
              <AlignLeft size={13} />
            </button>

            {/* View Full Code / User Code */}
            <button
              className={`vf-code-editor__action-btn vf-code-editor__action-btn--full ${showFullCode ? 'is-active' : ''}`}
              onClick={() => setShowFullCode(!showFullCode)}
              title={showFullCode ? "Show user code only" : "Show full generated sketch code"}
            >
              {showFullCode ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{showFullCode ? 'User Code' : 'Full Sketch'}</span>
            </button>

            {/* Fullscreen button */}
            <button
              className="vf-code-editor__action-btn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Full code warning banner */}
      {showFullCode && (
        <div className="vf-code-editor__banner">
          <Eye size={13} />
          <span>
            <strong>Full Sketch View</strong> — Read-only boilerplate containing auto-generated libraries and pin definitions.
          </span>
        </div>
      )}

      {/* Editor Body */}
      <div className="vf-code-editor__body">
        {activeCodeFile ? (
          <Suspense fallback={
            <div className="vf-code-editor__loading">
              <Loader2 size={24} className="vf-spin" />
              <span>Loading editor...</span>
            </div>
          }>
            <MonacoEditor
              height="100%"
              language={lang}
              theme="vs-dark"
              value={displayedContent}
              onMount={handleEditorMount}
              onChange={(value) => {
                // The Monaco React wrapper suppresses its own controlled value
                // updates. A timed guard here would also drop real user edits
                // immediately after changing tabs or leaving Full Sketch.
                if (readOnly || showFullCode) return;
                if (value === undefined) return;

                // Protect content integrity
                if (value.includes('VoltForge — Auto-generated Full Sketch')) {
                  return;
                }

                updateCodeFileContent(activeCodeFile.id, value);
              }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                bracketPairColorization: { enabled: true },
                padding: { top: 12 },
                readOnly: showFullCode || readOnly,
              }}
            />
          </Suspense>
        ) : (
          <div className="vf-code-editor__empty">
            <p>No code file selected</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(CodeEditor);
