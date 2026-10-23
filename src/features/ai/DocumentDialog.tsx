import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/useAuth'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { documentApi, type ReferenceDocument } from './documentApi'

export function DocumentDialog({ projectId, selected, onSelect, onClose }: {
  projectId?: string; selected: string[]; onSelect: (ids: string[]) => void; onClose: () => void
}) {
  const { user } = useAuth()
  const [query, setQuery] = useState(''), [page, setPage] = useState(0)
  const [title, setTitle] = useState(''), [file, setFile] = useState<File>()
  const [replacement, setReplacement] = useState<ReferenceDocument>()
  const [deleting, setDeleting] = useState<ReferenceDocument>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState('')
  const lock = useRef(false), fileInput = useRef<HTMLInputElement>(null)
  const documents = useQuery({ queryKey: ['ai-documents', user?.id, projectId, query, page], queryFn: async () => (await documentApi.list(projectId, query, page)).data.data })
  const upload = async () => {
    if (lock.current || !file || !title.trim()) return
    if (file.size > 2 * 1024 * 1024) { setError('File must be no larger than 2 MiB.'); return }
    lock.current = true; setBusy(true); setError(''); setFeedback('')
    try {
      await documentApi.upload(file, title.trim(), replacement ? replacement.projectId : projectId, replacement?.id)
      setFile(undefined); setReplacement(undefined); setTitle(''); if (fileInput.current) fileInput.current.value = ''
      await documents.refetch({ throwOnError: true })
      setFeedback('Document indexed. Select it below to use matching excerpts in this conversation.')
    } catch (e) { setError(message(e, 'Upload could not be confirmed. Retry the same file safely; identical content is deduplicated.')) }
    finally { lock.current = false; setBusy(false) }
  }
  const remove = async () => {
    if (!deleting || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      await documentApi.delete(deleting.id); onSelect(selected.filter(id => id !== deleting.id)); setDeleting(undefined)
      await documents.refetch({ throwOnError: true }); setFeedback('Document and its versions deleted. Existing chat excerpts remain in their conversations.')
    } catch (e) { setError(message(e, 'Could not confirm deletion. Reload or retry.')) }
    finally { lock.current = false; setBusy(false) }
  }
  return <Modal isOpen title="Reference documents" onClose={() => { if (!busy) onClose() }}>
    <div className="vf-document-library">
      <p>Upload PDF, UTF-8 TXT or Markdown (2 MiB, 80 PDF pages). Text extraction only; scanned PDFs need OCR. Selecting a document permits matching excerpts in this conversation. Files are not sent to a search provider.</p>
      {projectId && <p>Uploads here belong to this project. Project sharing must be enabled to use them.</p>}
      <form onSubmit={e => { e.preventDefault(); void upload() }}>
        {replacement && <p>New version of {replacement.title} <Button type="button" disabled={busy} onClick={() => setReplacement(undefined)}>Cancel replacement</Button></p>}
        <label>Document title<input aria-label="Document title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} disabled={busy} required /></label>
        <label>Document file<input ref={fileInput} aria-label="Document file" type="file" accept=".pdf,.txt,.md" disabled={busy} onChange={e => setFile(e.target.files?.[0])} required /></label>
        <Button type="submit" disabled={busy || !file || !title.trim()}>{busy ? 'Working…' : replacement ? 'Upload new version' : 'Upload document'}</Button>
      </form>
      {error && <p role="alert">{error}</p>}{feedback && <p role="status">{feedback}</p>}
      <label>Search documents<input aria-label="Search documents" value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setPage(0) }} /></label>
      {documents.isPending && <p role="status">Loading documents…</p>}
      {documents.isError && <p role="alert">Documents could not be loaded. <Button onClick={() => void documents.refetch()}>Retry</Button></p>}
      {documents.data?.content.length === 0 && <p>No matching documents. Upload a reference to get started.</p>}
      {documents.data?.content.map(doc => <div className="vf-document-row" key={doc.id}>
        <label><input type="checkbox" aria-label={`Use ${doc.title}`} checked={selected.includes(doc.id)} disabled={busy || (!selected.includes(doc.id) && selected.length >= 10)} onChange={e => onSelect(e.target.checked ? [...selected, doc.id] : selected.filter(id => id !== doc.id))} />{doc.title} <small>v{doc.currentVersion}{doc.projectId ? ' · Project' : ''}</small></label>
        <Button disabled={busy} onClick={() => { setReplacement(doc); setTitle(doc.title) }}>New version</Button>
        <Button disabled={busy} aria-label={`Delete ${doc.title}`} onClick={() => setDeleting(doc)}>Delete</Button>
      </div>)}
      {deleting && <div role="group" aria-label="Confirm document deletion"><p>Delete {deleting.title} and all its versions? Saved chat excerpts will remain.</p><Button disabled={busy} onClick={() => void remove()}>Confirm deletion</Button><Button disabled={busy} onClick={() => setDeleting(undefined)}>Cancel</Button></div>}
      <div className="vf-document-paging"><Button disabled={busy || page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button><span>Page {page + 1}</span><Button disabled={busy || !documents.data || documents.data.last} onClick={() => setPage(p => p + 1)}>Next</Button></div>
      <Button onClick={onClose} disabled={busy}>Done</Button>
    </div>
  </Modal>
}
function message(error: unknown, fallback: string) {
  const e = error as { response?: { data?: { message?: string } } }
  return e.response?.data?.message || fallback
}
