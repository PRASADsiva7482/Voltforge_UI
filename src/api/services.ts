import api, { getBaseURL } from './client'
import keycloak from '../auth/keycloak'
import type {
  AiChatRequest,
  AiChatResponse,
  AiComponentCoverageResponse,
  AiGenerateRequest,
  AiGenerateResponse,
  AiHardwareCoverageResponse,
  AiMemoryState,
  AiValidationResponse,
  ApiResponse,
  CreateProjectRequest,
  CustomComponentRequest,
  DashboardStats,
  ElectronicComponent,
  FirmwareCompileRequest,
  FirmwareCompileResponse,
  PagedResponse,
  Project,
  ProjectSummary,
  UpdateProfileRequest,
  UpdateProjectRequest,
  User,
} from '../types/domain'
import type { DrcViolation, PcbFootprint, PcbTrace, PcbVia } from '../store/pcbStore'

/** Base URL for direct fetch() calls (SSE streaming bypasses Axios). */
function getStreamBaseURL(): string {
  return getBaseURL()
}


export const authApi = {
  getCurrentUser: () => api.get<ApiResponse<User>>('/auth/me'),
  syncUser: (signal?: AbortSignal) => api.post<ApiResponse<User>>('/auth/sync', undefined, { signal }),
}

export const userApi = {
  getProfile: () => api.get<ApiResponse<User>>('/users/profile'),
  getUserById: (userId: string) => api.get<ApiResponse<User>>(`/users/${userId}`),
  updateProfile: (data: UpdateProfileRequest) => api.put<ApiResponse<User>>('/users/profile', data),
}

export const projectApi = {
  create: (data: CreateProjectRequest) => api.post<ApiResponse<Project>>('/projects', data),
  delete: (id: string) => api.delete<ApiResponse<void>>(`/projects/${id}`),
  fork: (id: string) => api.post<ApiResponse<Project>>(`/projects/${id}/fork`),
  getById: (id: string) => api.get<ApiResponse<Project>>(`/projects/${id}`),
  getPublic: (page = 0, size = 20) => api.get<ApiResponse<PagedResponse<ProjectSummary>>>('/projects/public', { params: { page, size } }),
  getTemplates: (page = 0, size = 20) => api.get<ApiResponse<PagedResponse<ProjectSummary>>>('/projects/templates', { params: { page, size } }),
  getUserProjects: (page = 0, size = 20) => api.get<ApiResponse<PagedResponse<ProjectSummary>>>('/projects', { params: { page, size } }),
  searchPublic: (query: string, page = 0, size = 20) =>
    api.get<ApiResponse<PagedResponse<ProjectSummary>>>('/projects/public/search', { params: { page, query, size } }),
  update: (id: string, data: UpdateProjectRequest) => api.put<ApiResponse<Project>>(`/projects/${id}`, data),
}

export const componentApi = {
  createCustom: (data: CustomComponentRequest) => api.post<ApiResponse<ElectronicComponent>>('/components/custom', data),
  getAll: () => api.get<ApiResponse<ElectronicComponent[]>>('/components'),
  getByCategory: (category: string) => api.get<ApiResponse<ElectronicComponent[]>>(`/components/category/${category}`),
  getById: (id: string) => api.get<ApiResponse<ElectronicComponent>>(`/components/${id}`),
  getCategories: () => api.get<ApiResponse<string[]>>('/components/categories'),
  getCommunity: () => api.get<ApiResponse<ElectronicComponent[]>>('/components/community'),
  getFree: () => api.get<ApiResponse<ElectronicComponent[]>>('/components/free'),
  search: (query: string) => api.get<ApiResponse<ElectronicComponent[]>>('/components/search', { params: { query } }),
}

export const aiApi = {
  chat: (data: AiChatRequest) => api.post<ApiResponse<AiChatResponse>>('/ai/chat', data),
  getComponentCoverage: () => api.get<ApiResponse<AiComponentCoverageResponse>>('/ai/component-coverage'),
  getHardwareCoverage: () => api.get<ApiResponse<AiHardwareCoverageResponse>>('/ai/hardware-coverage'),
  /** SSE streaming chat — returns a raw fetch Response for ReadableStream consumption. */
  chatStream: async (data: AiChatRequest, signal?: AbortSignal): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    }
    if (keycloak.token) {
      headers['Authorization'] = `Bearer ${keycloak.token}`
    }
    const response = await fetch(`${getStreamBaseURL()}/ai/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal,
    })
    if (!response.ok) {
      let detail = `Stream request failed: ${response.status}`
      try {
        const payload = await response.json() as { detail?: string; message?: string }
        detail = payload.detail || payload.message || detail
      } catch {
        // Keep the bounded HTTP status fallback when the gateway returns no JSON body.
      }
      throw new Error(detail)
    }
    return response
  },
  inspectMemory: (projectId: string, sessionId?: string, projectRevision?: string) =>
    api.get<ApiResponse<AiMemoryState>>('/ai/memory', { params: { projectId, sessionId, projectRevision } }),
  setMemoryPreference: (projectId: string, enabled: boolean, sessionId?: string, clearOnDisable = false) =>
    api.put<ApiResponse<AiMemoryState>>('/ai/memory/preferences', { enabled, clearOnDisable }, { params: { projectId, sessionId } }),
  createMemoryEntry: (projectId: string, data: { approved: true; content: string; kind: 'fact' | 'decision' | 'summary'; projectRevision: string; scope: 'project' | 'session' }, sessionId?: string) =>
    api.post<ApiResponse<{ entry: unknown; memory: AiMemoryState }>>('/ai/memory/entries', data, { params: { projectId, sessionId } }),
  correctMemoryEntry: (projectId: string, memoryId: string, data: { approved: true; content: string; expectedVersion: number; projectRevision: string }, sessionId?: string) =>
    api.patch<ApiResponse<unknown>>(`/ai/memory/entries/${encodeURIComponent(memoryId)}`, data, { params: { projectId, sessionId } }),
  deleteMemoryEntry: (projectId: string, memoryId: string, sessionId?: string) =>
    api.delete<ApiResponse<unknown>>(`/ai/memory/entries/${encodeURIComponent(memoryId)}`, { params: { projectId, sessionId } }),
  clearMemory: (projectId: string, scope: 'project' | 'session', sessionId?: string) =>
    api.delete<ApiResponse<unknown>>('/ai/memory', { params: { projectId, scope, sessionId } }),
  generateCircuit: (data: AiGenerateRequest) => api.post<ApiResponse<AiGenerateResponse>>('/ai/generate-circuit', data),
  generateCode: (data: AiGenerateRequest) => api.post<ApiResponse<AiGenerateResponse>>('/ai/generate-code', data),
  reviewCode: (data: { boardType?: string; code: string; componentTypes?: string[] }) => api.post<ApiResponse<unknown>>('/ai/review-code', data),
  schematicToCode: (data: { additionalInstructions?: string; boardType?: string; components?: unknown[]; wires?: unknown[] }) =>
    api.post<ApiResponse<AiGenerateResponse>>('/ai/schematic-to-code', data),
  suggestWiring: (data: AiGenerateRequest) => api.post<ApiResponse<AiGenerateResponse>>('/ai/suggest-wiring', data),
  validateCircuit: (data: { boardType?: string; code?: string; components?: unknown[]; context?: string; wires?: unknown[] }) =>
    api.post<ApiResponse<AiValidationResponse>>('/ai/validate-circuit', data),
}

export const adminApi = {
  getDashboardStats: () => api.get<ApiResponse<DashboardStats>>('/admin/stats'),
}

export const projectExportApi = {
  exportGerber: (projectId: string) => api.get(`/projects/${projectId}/export/gerber`, { responseType: 'blob' }),
  exportZip: (projectId: string) => api.get(`/projects/${projectId}/export`, { responseType: 'blob' }),
  getBom: (projectId: string) => api.get<ApiResponse<unknown[]>>(`/projects/${projectId}/bom`),
  getStats: (projectId: string) => api.get<ApiResponse<unknown>>(`/projects/${projectId}/stats`),
}

export type PcbManufacturingPayload = {
  boardWidth_mm: number
  boardHeight_mm: number
  footprints: PcbFootprint[]
  projectName?: string
  traces: PcbTrace[]
  vias: PcbVia[]
  wires?: unknown[]
}

export type PcbDrcResponse = {
  errors: number
  passed: boolean
  rulesChecked: string[]
  totalViolations: number
  violations: DrcViolation[]
  warnings: number
}

export const pcbManufacturingApi = {
  exportGerber: (data: PcbManufacturingPayload) =>
    api.post('/ai/circuit/export-gerber', data, { responseType: 'blob' }),
  runDrc: (data: PcbManufacturingPayload) =>
    api.post<ApiResponse<PcbDrcResponse>>('/ai/circuit/drc-check', data),
}

export const simulationApi = {
  compileFirmware: (data: FirmwareCompileRequest) => api.post<ApiResponse<FirmwareCompileResponse>>('/simulation/compile', data),
}
