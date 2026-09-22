import { authApi } from '../api/services'
import keycloak from './keycloak'
import type { AppUser, UserRole, VoltforgeToken } from '../types/auth'

function hasAdminRole(token: VoltforgeToken | undefined): boolean {
  const realmRoles = token?.realm_access?.roles ?? []
  const clientRoles = Object.values(token?.resource_access ?? {}).flatMap((access) => access.roles ?? [])
  return [...realmRoles, ...clientRoles].some((role) => role.toLowerCase() === 'admin')
}

export function userFromToken(token: VoltforgeToken | undefined): AppUser | null {
  if (!token) return null

  const username = token.preferred_username || token.email || token.sub || 'voltforge-user'
  const displayName = token.name || token.preferred_username || token.email || 'Voltforge user'
  const role: UserRole = hasAdminRole(token) ? 'ADMIN' : 'USER'

  return {
    displayName,
    email: token.email,
    keycloakId: token.sub,
    role,
    username,
  }
}

export async function syncUser(signal?: AbortSignal): Promise<AppUser | null> {
  if (!keycloak.token) return null
  const response = await authApi.syncUser(signal)
  return response.data.data ?? userFromToken(keycloak.tokenParsed as VoltforgeToken | undefined)
}
