import api from '../../api/client'
import type { ApiResponse } from '../../types/domain'

export type ReferenceDocument = { id: string; title: string; projectId?: string; currentVersion: number }
type DocumentPage = { content: ReferenceDocument[]; page: number; last: boolean }
export type DocumentExcerpt = { title: string; version: number; page: number; content: string }
export const documentApi = {
  list: (projectId: string | undefined, q: string, page: number) => api.get<ApiResponse<DocumentPage>>('/ai/documents', { params: { projectId, q, page } }),
  upload: (file: File, title: string, projectId?: string, documentId?: string) => {
    const body = new FormData()
    body.append('file', file); body.append('title', title)
    if (projectId) body.append('projectId', projectId)
    if (documentId) body.append('documentId', documentId)
    return api.post<ApiResponse<ReferenceDocument>>('/ai/documents', body, { headers: { 'Content-Type': undefined } })
  },
  delete: (id: string) => api.delete(`/ai/documents/${encodeURIComponent(id)}`),
  excerpt: (id: string, version: string, chunk: string) => api.get<ApiResponse<DocumentExcerpt>>(`/ai/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/chunks/${encodeURIComponent(chunk)}`),
}
