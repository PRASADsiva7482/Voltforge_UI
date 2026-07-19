import axios, { type InternalAxiosRequestConfig } from 'axios'
import keycloak from '../auth/keycloak'

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

const getBaseURL = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Target Spring Boot backend directly on port 2001 in development
  if (import.meta.env.DEV) {
    return 'http://localhost:2001/voltForge-app/api/v1';
  }
  // In production, fallback to context path
  const pathParts = window.location.pathname.split('/');
  if (pathParts[1] && pathParts[1].toLowerCase().includes('voltforge')) {
    return `/${pathParts[1]}/api/v1`;
  }
  return '/voltForge-app/api/v1';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const refreshed = await keycloak.updateToken(30)
        if (refreshed && keycloak.token) {
          originalRequest.headers.Authorization = `Bearer ${keycloak.token}`
          return api(originalRequest)
        }
      } catch {
        keycloak.login({ redirectUri: `${window.location.origin}/dashboard` })
      }
    }

    return Promise.reject(error)
  },
)

export default api
