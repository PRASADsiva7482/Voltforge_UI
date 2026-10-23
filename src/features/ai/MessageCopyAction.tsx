import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** One full-message action; code-block copying remains a separate, scoped action. */
export function MessageCopyAction({ content, role }: { content: string; role: 'user' | 'assistant' }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const busy = useRef(false)
  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timeout)
  }, [copied])
  const copy = async () => {
    if (busy.current) return
    busy.current = true
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true); setError(false)
    } catch { setError(true); setCopied(false) }
    finally { busy.current = false }
  }
  return <>
    <button type="button" className={`vf-chat-copy${copied ? ' is-copied' : ''}`} aria-label={`Copy ${role} message`} title={copied ? 'Copied' : 'Copy complete message'} onClick={() => void copy()}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span className="vf-chat-copy-label" aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
    {error && <small className="vf-chat-copy-error" role="status">Clipboard unavailable. Select the message text to copy it.</small>}
  </>
}
