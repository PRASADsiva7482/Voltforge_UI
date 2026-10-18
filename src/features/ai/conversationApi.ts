import api from '../../api/client'
import type { ApiResponse, PagedResponse } from '../../types/domain'

export interface Conversation { id: string; title: string; projectId?: string; createdAt: string; updatedAt: string }
export interface SavedMessage {
  id: string; conversationId: string; clientRequestId: string; sequenceNumber: number
  role: 'user' | 'assistant'; content: string; status: 'pending' | 'completed' | 'failed' | 'interrupted'
  createdAt: string; metadata?: Record<string, unknown>
}
const root = '/ai/conversations'
const path = (id: string) => `${root}/${encodeURIComponent(id)}`
export const conversationApi = {
  create: async (projectId?: string) => (await api.post<ApiResponse<Conversation>>(root, { projectId })).data.data,
  list: async (q = '', page = 0, projectId?: string) => (await api.get<ApiResponse<PagedResponse<Conversation>>>(root, { params: { q, page, projectId, size: 30 } })).data.data,
  get: async (id: string) => (await api.get<ApiResponse<Conversation>>(path(id))).data.data,
  messages: async (id: string, page = 0) => (await api.get<ApiResponse<PagedResponse<SavedMessage>>>(`${path(id)}/messages`, { params: { page, size: 50 } })).data.data,
  rename: async (id: string, title: string) => (await api.patch<ApiResponse<Conversation>>(path(id), { title })).data.data,
  delete: (id: string) => api.delete(path(id)),
  stop: (id: string) => api.post(`${path(id)}/stop`),
}

export function mergeSavedMessages(previous: SavedMessage[], incoming: SavedMessage[]): SavedMessage[] {
  const byId = new Map(previous.map(message => [message.id, message]))
  incoming.forEach(message => byId.set(message.id, message))
  return [...byId.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
}
