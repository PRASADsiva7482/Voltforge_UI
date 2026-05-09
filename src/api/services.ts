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
  getPublicProjects: (page = 0, size = 20) =>
    api.get<ApiResponse<PagedResponse<ProjectSummary>>>('/projects/public', { params: { page, size } }),
  searchPublic: (query: string, page = 0, size = 20) =>
    api.get<ApiResponse<PagedResponse<ProjectSummary>>>('/projects/public/search', {
      params: { query, page, size },
    }),
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
};

// ── Admin APIs ────────────────────────────────────────────────────────────
export const adminApi = {
  getDashboardStats: () => api.get<ApiResponse<DashboardStats>>('/admin/stats'),
};
