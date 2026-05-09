import Editor from '@monaco-editor/react';
import { useProjectStore } from '../../store/projectStore';

export default function CodeEditor() {
  const { activeCodeFile, updateCodeFileContent } = useProjectStore();

  if (!activeCodeFile) {
    return (
      <div className="flex items-center justify-center h-full bg-surface-950 text-surface-500">
        <p className="text-sm">No file selected</p>
      </div>
    );
  }

  const languageMap: Record<string, string> = { cpp: 'cpp', c: 'c', h: 'cpp', ino: 'cpp', py: 'python', js: 'javascript', json: 'json' };
  const ext = activeCodeFile.filename.split('.').pop() || 'cpp';
  const lang = languageMap[ext] || activeCodeFile.language || 'cpp';

  return (
    <div className="h-full flex flex-col bg-surface-950">
      <div className="flex items-center px-4 py-2 border-b border-white/5 bg-surface-900/50">
        <span className="text-xs font-mono text-volt-400">{activeCodeFile.filename}</span>
        <span className="ml-2 text-[10px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">{lang.toUpperCase()}</span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={lang}
          value={activeCodeFile.content}
          theme="vs-dark"
          onChange={(value) => { if (value !== undefined) updateCodeFileContent(activeCodeFile.id, value); }}
          options={{
            fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", minimap: { enabled: true, maxColumn: 80 },
            scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, automaticLayout: true,
            bracketPairColorization: { enabled: true }, padding: { top: 12 },
            suggestOnTriggerCharacters: true, quickSuggestions: true,
          }}
        />
      </div>
    </div>
  );
}
