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

  async function copyCode() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <figure className="vf-code-block">
      <figcaption>
        <span>{filename ?? language}</span>
        <IconButton icon={copied ? <Check size={16} /> : <Copy size={16} />} label="Copy code" onClick={copyCode} size="sm" />
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  )
}
