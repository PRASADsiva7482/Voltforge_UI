import { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useCanvasStore } from '../../store/canvasStore';
import { Loader2, Maximize2, Minimize2, AlignLeft, Eye, EyeOff } from 'lucide-react';
import type { OnMount } from '@monaco-editor/react';
import { getBoardProfile } from '../canvas/boardCatalog';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

// ── Arduino framework boilerplate generator ──
function generateFullCode(userCode: string, boardType?: string): string {
  const nodes = useCanvasStore.getState().nodes;

  // Collect pin assignments from connected components
  const pinDefs: string[] = [];
  const seenTypes = new Set<string>();

  nodes.forEach(node => {
    const type = node.type;
    if (seenTypes.has(type)) return;
    seenTypes.add(type);

    if (type === 'LED_STANDARD' || type === 'LED_RGB' || type === 'LED_NEOPIXEL') {
      pinDefs.push(`// LED: ${node.name}`);
    }
    if (type === 'SERVO_MOTOR' || type === 'MOTOR_SERVO') {
      pinDefs.push(`// Servo: ${node.name}`);
    }
    if (type.startsWith('SENSOR_') || type.startsWith('DISPLAY_') || type.startsWith('LCD')) {
      pinDefs.push(`// ${type.replace(/_/g, ' ')}: ${node.name}`);
    }
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
    ...(nodes.some(n => n.type === 'SENSOR_DHT11' || n.type === 'SENSOR_DHT22' || n.type === 'TEMP_SENSOR') ? ['#include <DHT.h>'] : []),
    ...(nodes.some(n => n.type === 'LED_NEOPIXEL') ? ['#include <Adafruit_NeoPixel.h>'] : []),
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
    ...(pinDefs.length > 0 ? pinDefs : ['// No components on canvas']),
    '',
    '// ── User Code ───────────────────────────────────────────────',
    '',
  ].join('\n');

  return header + userCode;
}

export default function CodeEditor({ readOnly }: { readOnly?: boolean }) {
  const activeCodeFile = useProjectStore((s) => s.activeCodeFile);
  const codeFiles = useProjectStore((s) => s.currentProject?.codeFiles || []);
  const updateCodeFileContent = useProjectStore((s) => s.updateCodeFileContent);
  const setActiveCodeFile = useProjectStore((s) => s.setActiveCodeFile);
  const boardType = useProjectStore((s) => s.currentProject?.boardType);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullCode, setShowFullCode] = useState(false);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const ignoreChange = useRef(false);

  // Sync to prevent onChange updates during fullCode toggling
  useEffect(() => {
    ignoreChange.current = true;
    const timer = setTimeout(() => {
      ignoreChange.current = false;
    }, 100);
    return () => clearTimeout(timer);
  }, [showFullCode, activeCodeFile?.id]);

  const fullCode = useMemo(() => {
    if (!activeCodeFile || !showFullCode) return null;
    return generateFullCode(activeCodeFile.content, boardType);
  }, [activeCodeFile?.content, showFullCode, boardType]);

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

  return (
    <div className={`vf-code-editor ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {/* Tabs / Toolbar bar */}
      <div className="vf-code-editor__tabs">
        <div className="vf-code-editor__tabs-list">
          {codeFiles.map(file => (
            <button
              key={file.id}
              className={`vf-code-editor__tab ${activeCodeFile?.id === file.id ? 'is-active' : ''}`}
              onClick={() => {
                setActiveCodeFile(file);
                setShowFullCode(false);
              }}
            >
              {file.filename}
            </button>
          ))}
        </div>

        {activeCodeFile && (
          <div className="vf-code-editor__actions">
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
                if (readOnly || showFullCode || ignoreChange.current) return;
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
