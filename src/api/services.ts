import api from './client'
import type {
  AiChatRequest,
  AiChatResponse,
  AiGenerateRequest,
  AiGenerateResponse,
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

export const authApi = {
  getCurrentUser: () => api.get<ApiResponse<User>>('/auth/me'),
  syncUser: () => api.post<ApiResponse<User>>('/auth/sync'),
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
  generateCircuit: (data: AiGenerateRequest) => api.post<ApiResponse<AiGenerateResponse>>('/ai/generate-circuit', data),
  generateCode: (data: AiGenerateRequest) => api.post<ApiResponse<AiGenerateResponse>>('/ai/generate-code', data),
  reviewCode: (data: { boardType?: string; code: string; componentTypes?: string[] }) => api.post<ApiResponse<unknown>>('/ai/review-code', data),
  schematicToCode: (data: { additionalInstructions?: string; boardType?: string; components?: unknown[]; wires?: unknown[] }) =>
    api.post<ApiResponse<AiGenerateResponse>>('/ai/schematic-to-code', data),
  suggestWiring: (data: AiGenerateRequest) => api.post<ApiResponse<AiGenerateResponse>>('/ai/suggest-wiring', data),
  validateCircuit: (data: { boardType?: string; components?: unknown[]; wires?: unknown[] }) => api.post<ApiResponse<unknown>>('/ai/validate-circuit', data),
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

export const simulationApi = {
  compileFirmware: (data: FirmwareCompileRequest) => api.post<ApiResponse<FirmwareCompileResponse>>('/simulation/compile', data),
}
