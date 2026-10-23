import type { AiCitation } from '../../types/domain'
import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { documentApi, type DocumentExcerpt } from './documentApi'

export function ResearchSources({ citations }: { citations?: AiCitation[] }) {
  const [source, setSource] = useState<DocumentExcerpt>()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const openSource = async (item: AiCitation) => {
    setOpen(true); setBusy(true); setError(''); setSource(undefined)
    try { setSource((await documentApi.excerpt(item.documentId!, item.versionId!, item.sourceId!)).data.data) }
    catch { setError('Source unavailable or no longer accessible. The saved chat reference remains historical.') }
    finally { setBusy(false) }
  }
  const safe = (Array.isArray(citations) ? citations : []).filter(item => {
    try {
      if (!/^S\d+$/.test(item.citationId || '')) return false
      if (item.locator === 'document_chunk') return [item.documentId, item.versionId, item.sourceId].every(id => /^[a-f0-9-]{36}$/i.test(id || ''))
      const url = new URL(item.url || '')
      return /^S\d+$/.test(item.citationId || '') && url.protocol === 'https:' && !url.username && !url.password
    } catch { return false }
  }).slice(0, 5)
  if (!safe.length) return null
  return <><details className="vf-chat-sources"><summary>Sources ({safe.length})</summary>
    <ol>{safe.map(item => <li key={item.citationId}>
      {item.locator === 'document_chunk' ? <button type="button" onClick={() => void openSource(item)}>[{item.citationId}] {item.title} · p. {item.page}</button>
        : <a href={item.url} target="_blank" rel="noopener noreferrer">[{item.citationId}] {item.title}</a>}
      {item.locator === 'search_snippet' && <small> · Search excerpt</small>}
    </li>)}</ol>
  </details>{open && <Modal isOpen title="Source excerpt" onClose={() => setOpen(false)}>
    {busy && <p role="status">Loading source…</p>}{error && <p role="alert">{error}</p>}
    {source && <><p>{source.title} · v{source.version} · p. {source.page}</p><pre className="vf-document-excerpt">{source.content}</pre></>}
  </Modal>}</>
}
