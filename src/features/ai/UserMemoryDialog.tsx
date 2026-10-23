import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/client'
import type { ApiResponse } from '../../types/domain'
import { useAuth } from '../../auth/useAuth'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'

const choices = [
  { key: 'response_detail', label: 'Response detail', values: ['concise', 'detailed'] },
  { key: 'units', label: 'Units', values: ['metric', 'imperial'] },
  { key: 'experience', label: 'Electronics experience', values: ['beginner', 'intermediate', 'advanced'] },
] as const
const root = '/ai/user-memory'

export function UserMemoryDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const memory = useQuery({ queryKey: ['user-memory', user?.id], queryFn: async () => (await api.get<ApiResponse<Record<string, string>>>(root)).data.data, staleTime: 0 })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const save = async (key: string, value: string) => {
    if (busy) return
    setBusy(true); setError(''); setFeedback('')
    try {
      if (value) await api.put(`${root}/${key}`, { value })
      else await api.delete(`${root}/${key}`)
      await memory.refetch({ throwOnError: true })
      setDrafts(previous => { const next = { ...previous }; delete next[key]; return next })
      setFeedback(value ? 'Preference saved. It will be used across your conversations.' : 'Preference deleted from future AI context. Existing chat messages are unchanged.')
    } catch { setError('Could not confirm the memory update. Your selection is preserved; reload or retry before assuming it was saved.') }
    finally { setBusy(false) }
  }
  return <Modal isOpen title="Preference memory" size="sm" onClose={() => { if (!busy) onClose() }}>
    <p className="vf-memory-disclosure">Optional preferences for all your conversations, including general chat. They are separate from chat history and project sharing. Only the listed choices can be stored; no personal facts, credentials, code, or transcripts.</p>
    {memory.isLoading && <p role="status">Loading saved preferences…</p>}
    {memory.isError && <p role="alert">Memory could not be loaded. <Button onClick={() => void memory.refetch()}>Retry</Button></p>}
    {memory.data && choices.map(choice => {
      const saved = memory.data[choice.key] || ''
      const value = drafts[choice.key] ?? saved
      return <div className="vf-memory-row" key={choice.key}>
        <label>{choice.label}<select aria-label={choice.label} value={value} disabled={busy} onChange={e => setDrafts(previous => ({ ...previous, [choice.key]: e.target.value }))}>
          <option value="">Not remembered</option>{choice.values.map(option => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
        </select></label>
        <Button disabled={busy || value === saved} onClick={() => void save(choice.key, value)}>Save</Button>
        {saved && <Button disabled={busy} onClick={() => void save(choice.key, '')} aria-label={`Forget ${choice.label}`}>Forget</Button>}
      </div>
    })}
    <p className="vf-memory-disclosure">You can also say “Remember I prefer concise answers.” Changes require an explicit request. Forget removes the stored preference; delete a conversation separately to remove its transcript.</p>
    {feedback && <p role="status">{feedback}</p>}{error && <p role="alert">{error}</p>}
  </Modal>
}
