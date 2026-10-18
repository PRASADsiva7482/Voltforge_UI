import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { IconButton } from './IconButton'

export type CodeBlockProps = {
  code: string
  filename?: string
  language?: string
}

export function CodeBlock({ code, filename, language = 'cpp' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true); setCopyError(false)
      window.setTimeout(() => setCopied(false), 1200)
    } catch { setCopyError(true) }
  }

  return (
    <figure className="vf-code-block">
      <figcaption>
        <span>{filename ?? language}</span>
        <IconButton icon={copied ? <Check size={16} /> : <Copy size={16} />} label="Copy code" onClick={copyCode} size="sm" />
      </figcaption>
      <pre>
        <code>{highlightCode(code)}</code>
      </pre>
      {copyError && <small role="status">Clipboard unavailable. Select the code to copy it.</small>}
    </figure>
  )
}

// React text nodes escape HTML; highlighting never interprets code as markup.
function highlightCode(code: string) {
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|return|void|int|float|bool|if|else|for|while|class|def|import|from|true|false|None|function|include|setup|loop)\b|\b\d+(?:\.\d+)?\b)/g
  return code.split(pattern).map((part, index) => {
    const kind = /^(\/\/|\/\*|#)/.test(part) ? 'comment' : /^["']/.test(part) ? 'string' : /^\d/.test(part) ? 'number' : index % 2 ? 'keyword' : ''
    return kind ? <span key={index} className={`vf-code-token--${kind}`}>{part}</span> : part
  })
}
