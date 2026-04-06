
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

export interface AuthUser {
  username: string
  role: 'admin' | 'sub-admin' | 'supervisor'
  linkedDeviceId: string | null
  canEditRoom?: boolean
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('wv_token')
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('wv_user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function isAdmin(): boolean {
  return getUser()?.role === 'admin'
}

export function isSubAdmin(): boolean {
  return getUser()?.role === 'sub-admin'
}

export function isSupervisor(): boolean {
  return getUser()?.role === 'supervisor'
}

export function logout(): void {
  localStorage.removeItem('wv_token')
  localStorage.removeItem('wv_user')
  localStorage.removeItem('isAuthenticated')
  window.location.href = '/'
}

export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Create a sub-admin (admin calling) or supervisor (sub-admin calling).
 */
export async function createUser(params: {
  username: string
  password: string
  role: 'sub-admin' | 'supervisor'
  linkedDeviceId: string
  canEditRoom?: boolean
}): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify(params)
  })
  const data = await res.json()
  if (!res.ok) {
    return { success: false, message: data.message || 'Failed to create user' }
  }
  return { success: true }
}
