
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cpanel.backend.mechair.co.in/api'

export interface AuthUser {
  username: string
  role: 'owner' | 'admin' | 'sub-admin' | 'supervisor'
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

export function isOwner(): boolean {
  return getUser()?.role === 'owner'
}

export function isAdmin(): boolean {
  const role = getUser()?.role
  return role === 'admin' || role === 'owner'
}

export function isSubAdmin(): boolean {
  return getUser()?.role === 'sub-admin'
}

export function isSupervisor(): boolean {
  return getUser()?.role === 'supervisor'
}

/** Returns true for owner, admin, sub-admin — anyone who can control devices */
export function canControl(): boolean {
  const role = getUser()?.role
  return role === 'owner' || role === 'admin' || role === 'sub-admin'
}

/** Returns true for owner and admin — anyone who can manage users */
export function canManageUsers(): boolean {
  const role = getUser()?.role
  return role === 'owner' || role === 'admin' || role === 'sub-admin'
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
 * Create a user — owner can create admin/sub-admin/supervisor,
 * admin can create sub-admin/supervisor, sub-admin can create supervisor.
 */
export async function createUser(params: {
  username: string
  password: string
  role: 'admin' | 'sub-admin' | 'supervisor'
  linkedDeviceId?: string
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

/**
 * Update a user (password, linkedDeviceId, canEditRoom).
 */
export async function updateUser(
  username: string,
  params: { password?: string; linkedDeviceId?: string; canEditRoom?: boolean }
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/users/${encodeURIComponent(username)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify(params)
  })
  const data = await res.json()
  if (!res.ok) {
    return { success: false, message: data.message || 'Failed to update user' }
  }
  return { success: true }
}

/**
 * Delete a user.
 */
export async function deleteUser(username: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  const data = await res.json()
  if (!res.ok) {
    return { success: false, message: data.message || 'Failed to delete user' }
  }
  return { success: true }
}

/**
 * List users visible to the current caller.
 */
export async function listUsers(): Promise<{ success: boolean; data?: AuthUser[]; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/users`, {
    headers: authHeaders()
  })
  const data = await res.json()
  if (!res.ok) {
    return { success: false, message: data.message || 'Failed to list users' }
  }
  return { success: true, data: data.data }
}
