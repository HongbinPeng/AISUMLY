const API_BASE = '/api/v1'

let refreshPromise = null

export function getStoredAuth() {
  return {
    accessToken: localStorage.getItem('access_token') || '',
    refreshToken: localStorage.getItem('refresh_token') || '',
    user: JSON.parse(localStorage.getItem('user_info') || 'null'),
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
    const payload = await res.json()
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

/**
 * 发起项目统一 JSON 请求，自动携带 access token 并在 401 时刷新登录态。
 * @param {string} path API 路径，必须以 / 开头
 * @param {RequestInit} options fetch 参数
 * @param {boolean} retry 是否允许刷新 token 后重试
 * @returns {Promise<unknown>} 后端 data 字段
 */
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

  const payload = await res.json()
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || '请求失败')
  }
  return payload.data
}

export function apiURL(path) {
  return `${API_BASE}${path}`
}
