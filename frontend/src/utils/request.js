const API_BASE = '/api/v1'

let refreshPromise = null

export function getStoredAuth() {
  return {
    accessToken: localStorage.getItem('access_token') || '',
    refreshToken: localStorage.getItem('refresh_token') || '',
    user: parseStoredUser(),
  }
}

export function setStoredAuth(data) {
  if (data.access_token) localStorage.setItem('access_token', data.access_token)
  if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
  if (data.user) localStorage.setItem('user_info', JSON.stringify(data.user))
}

export function clearStoredAuth() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_info')
}

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const { refreshToken } = getStoredAuth()
    if (!refreshToken) throw new Error('缺少 refresh token')
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const payload = await readJSON(res)
    if (payload.code !== 0 || !payload.data?.access_token) {
      throw new Error(payload.message || '刷新登录态失败')
    }
    setStoredAuth(payload.data)
    return payload.data.access_token
  })()
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

export async function request(path, options = {}, retry = true) {
  const { accessToken } = getStoredAuth()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401 && retry) {
    try {
      const newToken = await refreshAccessToken()
      headers.Authorization = `Bearer ${newToken}`
      res = await fetch(`${API_BASE}${path}`, { ...options, headers })
    } catch {
      clearStoredAuth()
      throw new Error('登录已过期，请重新登录')
    }
  }

  const payload = await readJSON(res)
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || '请求失败')
  }
  return payload.data
}

export function apiURL(path) {
  return `${API_BASE}${path}`
}

function parseStoredUser() {
  const raw = localStorage.getItem('user_info')
  if (!raw || raw === 'undefined' || raw === 'null') return null
  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem('user_info')
    return null
  }
}

async function readJSON(res) {
  try {
    return await res.json()
  } catch {
    return { code: -1, message: `接口返回异常：HTTP ${res.status}` }
  }
}
