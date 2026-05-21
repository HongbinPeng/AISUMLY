import { apiURL, getStoredAuth, refreshAccessToken } from '../utils/request.js'
import { readSSE } from '../utils/sse.js'

/**
 * 发起普通会话流式聊天。
 * @param {object} requestBody 后端 /chat/stream 请求体
 * @param {Record<string, Function>} handlers SSE 事件处理函数
 * @returns {Promise<void>}
 */
export async function streamChat(requestBody, handlers = {}) {
  let { accessToken } = getStoredAuth()
  let res = await postChatStream(requestBody, accessToken)

  if (res.status === 401) {
    accessToken = await refreshAccessToken()
    res = await postChatStream(requestBody, accessToken)
  }

  if (!res.ok || !res.body) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.message || '聊天请求失败')
  }

  await readSSE(res.body, handlers)
}

function postChatStream(requestBody, accessToken) {
  return fetch(apiURL('/chat/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  })
}
