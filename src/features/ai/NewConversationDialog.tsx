import { useEffect, useState } from 'react'
import { projectApi } from '../../api/services'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { ProjectSummary } from '../../types/domain'

export function NewConversationDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (projectId?: string) => Promise<boolean> }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [page, setPage] = useState(0)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const load = async (nextPage = 0) => {
    setLoading(true); setError('')
    try {
      const result = (await projectApi.getUserProjects(nextPage, 30)).data.data
      setProjects(previous => nextPage ? [...previous, ...result.content] : result.content); setMore(!result.last); setPage(nextPage)
    } catch { setError('Projects could not be loaded. You can still start a general conversation.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  return <Modal isOpen title="Start a conversation" onClose={() => { if (!working) onClose() }} size="sm" footer={<><Button onClick={onClose} disabled={working}>Cancel</Button><Button variant="primary" disabled={working} onClick={async () => { setWorking(true); const ok = await onCreate(projectId || undefined); setWorking(false); if (ok) onClose(); else setError('Conversation could not be created. Please retry.') }}>{working ? 'Creating…' : 'Create conversation'}</Button></>}>
    <label>Associated project (optional)<select aria-label="Associated project" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">General engineering chat</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <p className="vf-chat-notice">Linking a project adds a shortcut to its Playground. Source code and circuit data are shared only when you choose to share context from the editor.</p>
    {loading && <p role="status">Loading projects…</p>}
    {more && <Button disabled={loading} onClick={() => void load(page + 1)}>More projects</Button>}
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry projects</button></p>}
  </Modal>
}
