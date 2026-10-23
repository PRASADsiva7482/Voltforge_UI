import { useCallback, useEffect, useRef, useState } from 'react'
import { conversationApi, mergeSavedMessages, type Conversation, type SavedMessage } from './conversationApi'

export function useConversationHistory(userId: string | undefined, projectId: string | undefined, onMessages: (messages: SavedMessage[]) => void, busy: boolean) {
  const [active, setActive] = useState<Conversation>()
  const [items, setItems] = useState<Conversation[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [older, setOlder] = useState(false)
  const [page, setPage] = useState(0)
  const messagePage = useRef(0)
  const savedMessages = useRef<SavedMessage[]>([])
  const generation = useRef(0)
  const listGeneration = useRef(0)
  const creating = useRef(false)
  const key = userId ? `vf-chat:${userId}:${projectId || 'workspace'}` : undefined
  const persist = useCallback((id?: string) => {
    if (key) { try { if (id) localStorage.setItem(key, id); else localStorage.removeItem(key) } catch { /* DB history still works without browser storage. */ } }
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('conversation', id); else url.searchParams.delete('conversation')
    window.history.replaceState(window.history.state, '', url)
  }, [key])

  const refresh = useCallback(async (nextPage = 0) => {
    if (!userId) return
    const version = ++listGeneration.current
    setListLoading(true); setListError('')
    try {
      const result = await conversationApi.list(query, nextPage, projectId)
      if (version !== listGeneration.current) return
      setItems(prev => nextPage ? [...new Map([...prev, ...result.content].map(c => [c.id, c])).values()] : result.content)
      setActive(previous => result.content.find(item => item.id === previous?.id) || previous)
      setHasMore(!result.last); setPage(nextPage)
    } catch { if (version === listGeneration.current) setListError('Could not load conversation history. Please retry.') }
    finally { if (version === listGeneration.current) setListLoading(false) }
  }, [userId, query, projectId])

  const open = useCallback(async (id: string, preserveView = false) => {
    const version = ++generation.current
    setLoading(true); setError('')
    if (!preserveView) { setActive(undefined); onMessages([]) }
    try {
      const [conversation, history] = await Promise.all([conversationApi.get(id), conversationApi.messages(id)])
      if (version !== generation.current) return
      if (projectId && conversation.projectId !== projectId) throw new Error('scope')
      setActive(conversation); persist(id)
      if (!preserveView) messagePage.current = 0
      savedMessages.current = mergeSavedMessages(preserveView ? savedMessages.current : [], history.content)
      if (!preserveView || messagePage.current === 0) setOlder(!history.last)
      onMessages(savedMessages.current)
    } catch { if (version === generation.current) setError('This conversation could not be opened. Retry from history or start a new chat.') }
    finally { if (version === generation.current) setLoading(false) }
  }, [onMessages, persist, projectId])

  useEffect(() => {
    ++generation.current; setActive(undefined); setError(''); onMessages([])
    if (!userId || !key) return
    let id: string | null = null
    try { id = new URLSearchParams(window.location.search).get('conversation') || localStorage.getItem(key) } catch { /* Optional preference. */ }
    if (id) void open(id)
    const counter = generation
    return () => { ++counter.current }
  }, [userId, key, open, onMessages])
  useEffect(() => { const counter = listGeneration; const timer = setTimeout(() => void refresh(), 250); return () => { clearTimeout(timer); ++counter.current } }, [refresh])

  // Refresh summaries and the active transcript after returning from another tab.
  useEffect(() => {
    const focus = () => { if (!busy) { void refresh(); if (active) void open(active.id, true) } }
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [active, busy, refresh, open])

  const create = async (associatedProject = projectId) => {
    if (creating.current) return undefined
    creating.current = true
    const version = ++generation.current
    setLoading(true); setError('')
    try {
      const result = await conversationApi.create(associatedProject)
      if (version !== generation.current) return undefined
      ++generation.current; setActive(result); persist(result.id); onMessages([]); setOlder(false); savedMessages.current = []; messagePage.current = 0
      void refresh(); return result
    } catch { setError('Could not create a conversation. Your draft is still available.'); return undefined }
    finally { creating.current = false; setLoading(false) }
  }
  const loadOlder = async () => {
    if (!active || loading) return
    const version = generation.current; setLoading(true)
    try {
      const result = await conversationApi.messages(active.id, messagePage.current + 1)
      if (version !== generation.current) return
      messagePage.current++; savedMessages.current = mergeSavedMessages(savedMessages.current, result.content)
      onMessages(savedMessages.current); setOlder(!result.last)
    } catch { setError('Could not load older messages. Please retry.') }
    finally { if (version === generation.current) setLoading(false) }
  }
  const reconcile = (message: SavedMessage) => { savedMessages.current = mergeSavedMessages(savedMessages.current, [message]) }
  const remove = async (id: string) => {
    await conversationApi.delete(id)
    if (active?.id === id) { ++generation.current; setActive(undefined); persist(); onMessages([]); setOlder(false) }
    await refresh()
  }
  const rename = async (id: string, title: string) => {
    const result = await conversationApi.rename(id, title)
    if (active?.id === id) setActive(result)
    await refresh()
  }
  return { active, items, query, setQuery, loading, listLoading, error, setError, listError, hasMore, older, open, create, loadOlder, reconcile, refresh, more: () => refresh(page + 1), remove, rename }
}
