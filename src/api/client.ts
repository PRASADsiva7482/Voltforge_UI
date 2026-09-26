import axios, { type InternalAxiosRequestConfig } from 'axios'
import keycloak from '../auth/keycloak'

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

export const getBaseURL = (): string => {
  return (typeof window !== 'undefined' ? window.config?.baseUrls?.BL : '') || ''
}

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  config.baseURL = getBaseURL()
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
