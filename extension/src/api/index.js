const API_BASE = 'http://106.54.16.245/api/v1'

// --- Token management ---

async function getTokens() {
  const data = await chrome.storage.local.get(['access_token', 'refresh_token'])
  return { accessToken: data.access_token || '', refreshToken: data.refresh_token || '' }
}

async function setTokens({ access_token, refresh_token }) {
  await chrome.storage.local.set({ access_token, refresh_token })
  window.dispatchEvent(new CustomEvent('auth:login', {
    detail: { access_token, refresh_token },
  }))
}

async function clearTokens() {
  await chrome.storage.local.remove(['access_token', 'refresh_token', 'user_info'])
  window.dispatchEvent(new CustomEvent('auth:logout'))
}

// --- Refresh logic ---

let refreshPromise = null

/**
 * 自动刷新 access_token（防并发重复刷新）
 */
async function doRefresh() {
  // 已经在刷新中，返回同一 Promise
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const { refreshToken } = await getTokens()
    if (!refreshToken) throw new Error('no_refresh_token')

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    const data = await res.json()
    if (data.code !== 0 || !data.data?.access_token) {
      throw new Error('refresh_failed')
    }

    // 保存新 token
    await setTokens({
      access_token: data.data.access_token,
      refresh_token: data.data.refresh_token,
    })

    return data.data.access_token
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

// --- Generic fetch with auth + auto-refresh ---

async function fetchJSON(url, options = {}, { noRefresh = false } = {}) {
  const { accessToken } = await getTokens()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  let res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  })

  // 401 自动刷新重试（仅重试一次，登录/注册等不需要认证的接口跳过）
  if (res.status === 401 && !noRefresh) {
    try {
      const newToken = await doRefresh()
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers,
      })
    } catch {
      await clearTokens()
      throw { code: 40001, message: '登录已过期，请重新登录' }
    }
  }

  const data = await res.json()
  if (data.code !== 0) {
    throw { code: data.code, message: data.message, data: data.data }
  }
  return data.data
}

// --- Auth ---

export async function login(email, password) {
  return fetchJSON('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, { noRefresh: true })
}

export async function register(email, password, nickname) {
  return fetchJSON('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  }, { noRefresh: true })
}

export async function refreshTokenAPI(refreshToken) {
  return fetchJSON('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}

export async function getMe() {
  return fetchJSON('/auth/me')
}

export async function logout(refreshToken) {
  return fetchJSON('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, { noRefresh: true })
}

// --- Conversations ---

export async function listConversations(limit = 30) {
  return fetchJSON(`/conversations?limit=${limit}`)
}

export async function getConversationMessages(conversationId, limit = 50, beforeSequenceNo = 0) {
  return fetchJSON(`/conversations/${conversationId}/messages?limit=${limit}&before_sequence_no=${beforeSequenceNo}`)
}

export async function updateConversationTitle(conversationId, title) {
  return fetchJSON(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

// --- Files ---

export async function createUploadURLs(files) {
  return fetchJSON('/files/images/upload-urls', {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

export async function confirmUpload(fileIDs) {
  return fetchJSON('/files/images/confirm', {
    method: 'POST',
    body: JSON.stringify({ file_ids: fileIDs }),
  })
}

export async function getPreviewURL(fileID) {
  return fetchJSON(`/files/${fileID}/preview-url`)
}

// Direct PUT to OSS (no JSON wrapper, no auth header)
export async function uploadToOSS(uploadURL, blob, headers = {}) {
  const res = await fetch(uploadURL, {
    method: 'PUT',
    body: blob,
    headers,
  })
  if (!res.ok) {
    throw new Error(`OSS PUT failed: ${res.status} ${res.statusText}`)
  }
}

// --- Chat ---

// Returns a ReadableStream for SSE parsing, with auto-refresh on 401
export async function streamChat(requestBody) {
  let { accessToken } = await getTokens()
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(requestBody),
  })

  // 401 自动刷新重试
  if (res.status === 401) {
    try {
      accessToken = await doRefresh()
    } catch {
      await clearTokens()
      throw { code: 40001, message: '登录已过期，请重新登录' }
    }
    const res2 = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
    })
    if (!res2.ok) {
      const errData = await res2.json().catch(() => ({}))
      throw { code: errData.code || res2.status, message: errData.message || '请求失败' }
    }
    return res2.body
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw { code: errData.code || res.status, message: errData.message || '请求失败' }
  }

  return res.body
}

// --- Messages ---

export async function updateMessage(messageID, updates) {
  return fetchJSON(`/messages/${messageID}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}
