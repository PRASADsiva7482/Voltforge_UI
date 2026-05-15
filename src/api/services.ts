import api from './client';
import type {
  ApiResponse,
  PagedResponse,
  User,
  Project,
  ProjectSummary,
  ElectronicComponent,
  Subscription,
  DashboardStats,
  CreateProjectRequest,
  UpdateProjectRequest,
  UpdateProfileRequest,
  AiGenerateRequest,
  AiGenerateResponse,
  AiChatRequest,
  AiChatResponse,
  FirmwareCompileRequest,
  FirmwareCompileResponse,
  CustomComponentRequest,
} from '../types';

// ── Auth APIs ─────────────────────────────────────────────────────────────
export const authApi = {
  syncUser: () => api.post<ApiResponse<User>>('/auth/sync'),
  getCurrentUser: () => api.get<ApiResponse<User>>('/auth/me'),
};

// ── User APIs ─────────────────────────────────────────────────────────────
export const userApi = {
  getProfile: () => api.get<ApiResponse<User>>('/users/profile'),
  updateProfile: (data: UpdateProfileRequest) =>
    api.put<ApiResponse<User>>('/users/profile', data),
  getUserById: (userId: string) => api.get<ApiResponse<User>>(`/users/${userId}`),
};

// ── Project APIs ──────────────────────────────────────────────────────────
export const projectApi = {
  create: (data: CreateProjectRequest) =>
    api.post<ApiResponse<Project>>('/projects', data),
  getById: (id: string) => api.get<ApiResponse<Project>>(`/projects/${id}`),
  update: (id: string, data: UpdateProjectRequest) =>
    api.put<ApiResponse<Project>>(`/projects/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<void>>(`/projects/${id}`),
  fork: (id: string) => api.post<ApiResponse<Project>>(`/projects/${id}/fork`),
  getUserProjects: (page = 0, size = 20) =>
    api.get<ApiResponse<PagedResponse<ProjectSummary>>>('/projects', { params: { page, size } }),
  getPublic: (page = 0, size = 20) => api.get<ApiResponse<PagedResponse<ProjectSummary>>>(`/projects/public?page=${page}&size=${size}`),
  searchPublic: (query: string, page = 0, size = 20) => api.get<ApiResponse<PagedResponse<ProjectSummary>>>(`/projects/public/search?query=${query}&page=${page}&size=${size}`),
  getTemplates: (page = 0, size = 20) => api.get<ApiResponse<PagedResponse<ProjectSummary>>>(`/projects/templates?page=${page}&size=${size}`),
};

// ── Component APIs ────────────────────────────────────────────────────────
export const componentApi = {
  getAll: () => api.get<ApiResponse<ElectronicComponent[]>>('/components'),
  getByCategory: (category: string) =>
    api.get<ApiResponse<ElectronicComponent[]>>(`/components/category/${category}`),
  getFree: () => api.get<ApiResponse<ElectronicComponent[]>>('/components/free'),
  search: (query: string) =>
    api.get<ApiResponse<ElectronicComponent[]>>('/components/search', { params: { query } }),
  getById: (id: string) => api.get<ApiResponse<ElectronicComponent>>(`/components/${id}`),
  getCategories: () => api.get<ApiResponse<string[]>>('/components/categories'),
  createCustom: (data: CustomComponentRequest) =>
    api.post<ApiResponse<ElectronicComponent>>('/components/custom', data),
  getCommunity: () => api.get<ApiResponse<ElectronicComponent[]>>('/components/community'),
};

// ── Subscription APIs ─────────────────────────────────────────────────────
export const subscriptionApi = {
  getCurrent: () => api.get<ApiResponse<Subscription>>('/subscriptions/current'),
  upgrade: (planType: string, paymentRef?: string) =>
    api.post<ApiResponse<Subscription>>('/subscriptions/upgrade', { planType, paymentRef }),
};

// ── AI APIs ───────────────────────────────────────────────────────────────
export const aiApi = {
  generateCircuit: (data: AiGenerateRequest) =>
    api.post<ApiResponse<AiGenerateResponse>>('/ai/generate-circuit', data),
  suggestWiring: (data: AiGenerateRequest) =>
    api.post<ApiResponse<AiGenerateResponse>>('/ai/suggest-wiring', data),
  generateCode: (data: AiGenerateRequest) =>
    api.post<ApiResponse<AiGenerateResponse>>('/ai/generate-code', data),
  chat: (data: AiChatRequest) =>
    api.post<ApiResponse<AiChatResponse>>('/ai/chat', data),
  reviewCode: (data: { code: string; boardType?: string; componentTypes?: string[] }) =>
    api.post<ApiResponse<any>>('/ai/review-code', data),
  schematicToCode: (data: { boardType?: string; components?: any[]; wires?: any[]; additionalInstructions?: string }) =>
    api.post<ApiResponse<AiGenerateResponse>>('/ai/schematic-to-code', data),
  validateCircuit: (data: { boardType?: string; components?: any[]; wires?: any[] }) =>
    api.post<ApiResponse<any>>('/ai/validate-circuit', data),
};

// ── Admin APIs ────────────────────────────────────────────────────────────
export const adminApi = {
  getDashboardStats: () => api.get<ApiResponse<DashboardStats>>('/admin/stats'),
};

// ── Project Export APIs ───────────────────────────────────────────────────
export const projectExportApi = {
  getBom: (projectId: string) => api.get<ApiResponse<any[]>>(`/projects/${projectId}/bom`),
  getStats: (projectId: string) => api.get<ApiResponse<any>>(`/projects/${projectId}/stats`),
  exportZip: (projectId: string) =>
    api.get(`/projects/${projectId}/export`, { responseType: 'blob' }),
  exportGerber: (projectId: string) =>
    api.get(`/projects/${projectId}/export/gerber`, { responseType: 'blob' }),
};

// Simulation APIs
export const simulationApi = {
  compileFirmware: (data: FirmwareCompileRequest) =>
    api.post<ApiResponse<FirmwareCompileResponse>>('/simulation/compile', data),
};
