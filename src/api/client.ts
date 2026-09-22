import axios, { type InternalAxiosRequestConfig } from 'axios'
import keycloak from '../auth/keycloak'

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

const getBaseURL = () => {
  let url = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:2001/voltForge-app/api/v1' : '/voltForge-app/api/v1');
  if (!url.endsWith('/api/v1')) {
    url = url.replace(/\/+$/, '') + '/api/v1';
  }
  return url;
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

    if (error.response?.status === 401 && keycloak.token && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const refreshed = await keycloak.updateToken(30)
        if (refreshed && keycloak.token) {
          originalRequest.headers.Authorization = `Bearer ${keycloak.token}`
          return api(originalRequest)
        }
      } catch {
        keycloak.clearToken()
      }
    }

    return Promise.reject(error)
  },
)

export default api
