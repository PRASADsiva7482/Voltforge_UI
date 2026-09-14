import { createContext } from 'react'
import type { AppUser } from '../types/auth'

export type AuthContextValue = {
  isAuthenticated: boolean
  isLoading: boolean
  isRedirecting: boolean
  error: string | null
  login: () => void
  logout: () => void
  signup: () => void
  user: AppUser | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)
