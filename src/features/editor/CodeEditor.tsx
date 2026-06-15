import { useEffect, useRef, useState, useMemo } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Maximize2, Minimize2, FileCode2, Bug, AlignLeft, Eye, EyeOff } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useCanvasStore } from '../../store/canvasStore';
import SerialMonitor from './SerialMonitor';

// ── Arduino framework boilerplate generator ──
function generateFullCode(userCode: string, boardType?: string): string {
  const nodes = useCanvasStore.getState().nodes;

  // Collect pin assignments from connected components
  const pinDefs: string[] = [];
  const setupLines: string[] = [];
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
  const isEsp = board.startsWith('ESP');

  const includes = [
    '#include <Arduino.h>',
    ...(isEsp ? ['#include <WiFi.h>'] : []),
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
    `// Board: ${board.replace(/_/g, ' ')}`,
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
  const { currentProject, activeCodeFile, setActiveCodeFile, updateCodeFileContent } = useProjectStore();
  const { debugSnapshot, setBreakpoints } = useSimulationStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullCode, setShowFullCode] = useState(false);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationIds = useRef<string[]>([]);

  const lastShowFullCode = useRef(showFullCode);
  const lastFileId = useRef(activeCodeFile?.id);
  const ignoreChange = useRef(false);

  if (lastShowFullCode.current !== showFullCode || lastFileId.current !== activeCodeFile?.id) {
    lastShowFullCode.current = showFullCode;
    lastFileId.current = activeCodeFile?.id;
    ignoreChange.current = true;
  }

  useEffect(() => {
    if (ignoreChange.current) {
      const timer = setTimeout(() => {
        ignoreChange.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showFullCode, activeCodeFile?.id]);

  const codeFiles = currentProject?.codeFiles || [];

  // Generate full code view when toggled
  const fullCode = useMemo(() => {
    if (!activeCodeFile || !showFullCode) return null;
    return generateFullCode(activeCodeFile.content, currentProject?.boardType);
  }, [activeCodeFile?.content, showFullCode, currentProject?.boardType]);

  const displayedContent = showFullCode && fullCode ? fullCode : activeCodeFile?.content || '';

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // Register Arduino keywords
    editor.addAction({
      id: 'find-replace',
      label: 'Find and Replace',
      keybindings: [],
      run: (ed: any) => ed.getAction('editor.action.startFindReplaceAction')?.run(),
    });
    editor.onMouseDown((event: any) => {
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) return;
      const lineNumber = event.target.position?.lineNumber;
      if (!lineNumber) return;
      const currentBreakpoints = useSimulationStore.getState().debugSnapshot.breakpoints;
      const next = currentBreakpoints.includes(lineNumber)
        ? currentBreakpoints.filter(line => line !== lineNumber)
        : [...currentBreakpoints, lineNumber].sort((a, b) => a - b);
      setBreakpoints(next);
      window.dispatchEvent(new CustomEvent('voltforge:breakpoints', { detail: next }));
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const decorations = [
      ...debugSnapshot.breakpoints.map(line => ({
        range: new monaco.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'vf-breakpoint-glyph', glyphMarginHoverMessage: { value: 'Breakpoint' } },
      })),
      ...(debugSnapshot.currentLine ? [{
        range: new monaco.Range(debugSnapshot.currentLine, 1, debugSnapshot.currentLine, 1),
        options: { isWholeLine: true, className: 'vf-current-line', glyphMarginClassName: 'vf-current-glyph' },
      }] : []),
    ];
    decorationIds.current = editor.deltaDecorations(decorationIds.current, decorations);
  }, [debugSnapshot.breakpoints, debugSnapshot.currentLine]);

  // Format code using Monaco's built-in formatter
  const handleFormatCode = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getAction('editor.action.formatDocument')?.run();
  };

  if (!activeCodeFile) {
    return (
      <div className="flex items-center justify-center h-full bg-surface-950 text-surface-500">
        <div className="text-center">
          <FileCode2 className="w-10 h-10 mx-auto mb-3 text-surface-700" />
          <p className="text-sm font-medium">No file selected</p>
          <p className="text-xs text-surface-600 mt-1">Select a file from the tabs above</p>
        </div>
      </div>
    );
  }

  const languageMap: Record<string, string> = {
    cpp: 'cpp', c: 'c', h: 'cpp', ino: 'cpp', py: 'python', js: 'javascript', json: 'json',
  };
  const ext = activeCodeFile.filename.split('.').pop() || 'cpp';
  const lang = languageMap[ext] || activeCodeFile.language || 'cpp';

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-surface-950 flex flex-col'
    : 'h-full flex flex-col bg-surface-950';

  return (
    <div className={containerClass}>
      {/* File Tabs */}
      <div className="flex items-center border-b border-white/5 bg-surface-900/60 overflow-x-auto">
        <div className="flex items-center flex-1 min-w-0">
          {codeFiles.map(file => (
            <button key={file.id} onClick={() => { setActiveCodeFile(file); setShowFullCode(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-r border-white/5 whitespace-nowrap transition-colors ${
                activeCodeFile?.id === file.id
                  ? 'bg-surface-950 text-volt-400 border-b-2 border-b-volt-500'
                  : 'text-surface-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileCode2 className="w-3 h-3" />
              {file.filename}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2">
          <span className="text-[9px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded font-mono">
            {lang.toUpperCase()}
          </span>
          <span className="flex items-center gap-1 text-[9px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">
            <Bug className="w-3 h-3" />
            {debugSnapshot.breakpoints.length}
          </span>

          {/* Format Code Button */}
          <button
            onClick={handleFormatCode}
            className="p-1 rounded hover:bg-white/5 text-surface-400 hover:text-white transition-colors"
            title="Format Code (Auto-indent)"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Full Code / User Code Button */}
          <button
            onClick={() => setShowFullCode(!showFullCode)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
              showFullCode
                ? 'bg-forge-500/20 text-forge-400 border border-forge-500/30'
                : 'hover:bg-white/5 text-surface-400 hover:text-white'
            }`}
            title={showFullCode ? 'Show user code only' : 'Show full generated code (includes, pin defs, libraries)'}
          >
            {showFullCode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showFullCode ? 'User' : 'Full'}
          </button>

          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded hover:bg-white/5 text-surface-400 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Full Code Banner */}
      {showFullCode && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-forge-500/10 border-b border-forge-500/20 text-[10px]">
          <Eye className="w-3 h-3 text-forge-400 flex-shrink-0" />
          <span className="text-forge-300">
            <strong className="text-forge-400">Full Code View</strong> — Read-only preview with auto-generated #includes, pin definitions, and library headers based on your canvas components.
          </span>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={lang}
          value={displayedContent}
          theme="vs-dark"
          onMount={handleEditorMount}
          onChange={(value) => {
            if (showFullCode || ignoreChange.current) return;
            if (value === undefined) return;

            // Prevent saving full code view contents if it contains auto-generated headers
            if (value.includes('VoltForge — Auto-generated Full Sketch') || value.includes('Auto-generated Full Sketch')) {
              return;
            }

            updateCodeFileContent(activeCodeFile.id, value);
          }}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            minimap: { enabled: true, maxColumn: 80 },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            padding: { top: 12 },
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            lineNumbers: 'on',
            folding: true,
            renderWhitespace: 'selection',
            smoothScrolling: true,
            cursorSmoothCaretAnimation: 'on',
            cursorBlinking: 'smooth',
            formatOnPaste: true,
            readOnly: readOnly || showFullCode, // Read-only in full code view or non-owner mode
          }}
        />
      </div>

      <SerialMonitor />
    </div>
  );
}
