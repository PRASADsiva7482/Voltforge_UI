import { useQuery } from '@tanstack/react-query'
import { aiApi } from '../../api/services'

/** Kept inside Chat options; ordinary chat is independent from retrieval readiness. */
export function ResearchOptions({ enabled, mode, onMode, query, onQuery, consent, onConsent, busy }: {
  enabled: boolean; mode: 'off' | 'on'; onMode: (mode: 'off' | 'on') => void
  query: string; onQuery: (query: string) => void; consent: boolean; onConsent: (value: boolean) => void; busy: boolean
}) {
  const capabilities = useQuery({
    queryKey: ['ai-research-capabilities'],
    queryFn: async () => (await aiApi.getResearchCapabilities()).data.data,
    enabled,
    retry: false,
    staleTime: 30_000,
  })
  return <details className="vf-research-options">
    <summary>Web and documents</summary>
    {!enabled ? <p>Sign in to check research availability.</p>
      : capabilities.isPending ? <p role="status">Checking research availability…</p>
      : capabilities.isError ? <p>Research availability could not be checked. Ordinary chat is unaffected. <button type="button" disabled={capabilities.isFetching} onClick={() => void capabilities.refetch()}>Retry</button></p>
      : <>
        <p>{capabilities.data.web.message}</p>
        <p>{capabilities.data.documents.message}</p>
      </>}
    <label>Web research<select aria-label="Web research" value={mode} disabled={busy || !enabled} onChange={e => onMode(e.target.value as 'off' | 'on')}>
      <option value="off">Off</option><option value="on" disabled={!capabilities.data?.web.available}>On — review each query</option>
    </select></label>
    {mode === 'on' && <>
      <label>Public search query<textarea aria-label="Public search query" maxLength={500} value={query} disabled={busy} onChange={e => onQuery(e.target.value)} /></label>
      <label><input type="checkbox" checked={consent} disabled={busy || !capabilities.data?.web.available} onChange={e => onConsent(e.target.checked)} /> Send this public query to the search provider</label>
    </>}
    <p>Project sharing does not authorize external searches. Web research requires a separately reviewed public query. Private code, logs and chat history are not search queries.</p>
  </details>
}
