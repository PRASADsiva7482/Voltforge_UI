import type { KeycloakTokenParsed } from 'keycloak-js'

export type UserRole = 'USER' | 'ADMIN'

export type AppUser = {
  accountStatus?: string
  avatarUrl?: string
  displayName: string
  email?: string
  id?: string
  keycloakId?: string
  role: UserRole
  username: string
}

export type VoltforgeToken = KeycloakTokenParsed & {
  email?: string
  name?: string
  preferred_username?: string
  realm_access?: {
    roles?: string[]
  }
  resource_access?: Record<string, { roles?: string[] }>
}

export type ApiResponse<T> = {
  data: T
  errorCode?: string
  message: string
  success: boolean
  timestamp: string
}
