import { useState } from 'react'
import { Pencil, Plus, Trash2, PanelLeftClose } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { useConversationHistory } from './useConversationHistory'
import type { Conversation } from './conversationApi'

type Props = { history: ReturnType<typeof useConversationHistory>; busy: boolean; onClose: () => void; onNew: () => void }
export function ConversationSidebar({ history, busy, onClose, onNew }: Props) {
  const [dialog, setDialog] = useState<{ conversation: Conversation; action: 'rename' | 'delete' }>()
  const [title, setTitle] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const confirm = async () => {
    if (!dialog || working) return
    setWorking(true); setError('')
    try {
      if (dialog.action === 'rename') await history.rename(dialog.conversation.id, title.trim())
      else await history.remove(dialog.conversation.id)
      setDialog(undefined)
    } catch { setError('Could not save this change. If a response is generating, stop it first and retry.') }
    finally { setWorking(false) }
  }
  const group = (date: string) => {
    const day = new Date(date).toDateString()
    if (day === new Date().toDateString()) return 'Today'
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    return day === yesterday.toDateString() ? 'Yesterday' : 'Earlier'
  }
  return <aside className="vf-chat-history" aria-label="Conversation history">
    <div className="vf-chat-history__heading"><strong>Your conversations</strong><button type="button" onClick={onClose} aria-label="Hide conversation history" title="Collapse conversation history"><PanelLeftClose size={16} /></button></div>
    <Button variant="primary" icon={<Plus size={16} />} onClick={onNew} disabled={busy || history.loading}>New chat</Button>
    <input aria-label="Search conversations" placeholder="Search titles…" maxLength={120} value={history.query} onChange={e => history.setQuery(e.target.value)} />
    <div className="vf-chat-history__list" aria-busy={history.listLoading}>
      {history.listError && <p role="alert">{history.listError} <button type="button" onClick={() => void history.refresh()}>Retry history</button></p>}
      {!history.items.length && history.listLoading && <div className="vf-chat-skeleton" role="status">Loading conversations…</div>}
      {!history.items.length && !history.listLoading && !history.listError && <p>{history.query ? 'No matching conversations.' : 'Your saved conversations will appear here.'}</p>}
      {history.items.map((item, index) => <div key={item.id}>
        {(index === 0 || group(item.updatedAt) !== group(history.items[index - 1].updatedAt)) && <h4>{group(item.updatedAt)}</h4>}
        <div className={`vf-chat-history__item${history.active?.id === item.id ? ' is-active' : ''}`}>
          <button type="button" disabled={busy || history.loading} aria-current={history.active?.id === item.id ? 'true' : undefined} onClick={() => { void history.open(item.id); if (window.innerWidth < 760) onClose() }}>
            <span>{item.title}</span><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
          </button>
          <button type="button" disabled={busy} title="Rename conversation" aria-label={`Rename ${item.title}`} onClick={() => { setDialog({ conversation: item, action: 'rename' }); setTitle(item.title); setError('') }}><Pencil size={14} /></button>
          <button type="button" disabled={busy} title="Delete conversation" aria-label={`Delete ${item.title}`} onClick={() => { setDialog({ conversation: item, action: 'delete' }); setError('') }}><Trash2 size={14} /></button>
        </div>
      </div>)}
      {history.hasMore && <Button variant="secondary" disabled={history.listLoading} onClick={() => void history.more()}>Load more conversations</Button>}
    </div>
    <small>Private to your account · Saved on VoltForge</small>
    <Modal isOpen={!!dialog} title={dialog?.action === 'rename' ? 'Rename conversation' : 'Delete conversation?'} onClose={() => { if (!working) setDialog(undefined) }} size="sm" footer={<><Button variant="secondary" disabled={working} onClick={() => setDialog(undefined)}>Cancel</Button><Button variant={dialog?.action === 'delete' ? 'danger' : 'primary'} disabled={working || (dialog?.action === 'rename' && !title.trim())} onClick={() => void confirm()}>{working ? 'Saving…' : dialog?.action === 'delete' ? 'Delete conversation' : 'Save title'}</Button></>}>
      {dialog?.action === 'rename' ? <label>Conversation title<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} /></label> : <p>This permanently deletes this conversation and its messages. Your project is kept.</p>}
      {error && <p role="alert">{error}</p>}
    </Modal>
  </aside>
}
