import { useState, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Maximize2, Minimize2, Plus, X, FileCode2 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';

export default function CodeEditor() {
  const { currentProject, activeCodeFile, setActiveCodeFile, updateCodeFileContent } = useProjectStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef<any>(null);

  const codeFiles = currentProject?.codeFiles || [];

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    // Register Arduino keywords
    editor.addAction({
      id: 'find-replace',
      label: 'Find and Replace',
      keybindings: [],
      run: (ed: any) => ed.getAction('editor.action.startFindReplaceAction')?.run(),
    });
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
            <button key={file.id} onClick={() => setActiveCodeFile(file)}
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
          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded hover:bg-white/5 text-surface-400 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={lang}
          value={activeCodeFile.content}
          theme="vs-dark"
          onMount={handleEditorMount}
          onChange={(value) => {
            if (value !== undefined) updateCodeFileContent(activeCodeFile.id, value);
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
          }}
        />
      </div>
    </div>
  );
}
