import { apiURL, getStoredAuth, refreshAccessToken, request } from '../utils/request.js'
import { readSSE } from '../utils/sse.js'

export async function listReviewAgentMessages(turns = 20) {
  return request(`/review-agent/messages?turns=${turns}`)
}

/**
 * 向学习复盘助手发送消息，并通过 SSE 接收流式响应。
 * @param {string} message 用户消息
 * @param {{ file_ids?: number[] }|Record<string, Function>} options 附加选项，兼容旧的 handlers 参数
 * @param {Record<string, Function>} handlers SSE 事件处理函数
 * @returns {Promise<void>}
 */
export async function streamReviewAgent(message, options = {}, handlers = {}) {
  if (typeof options === 'function' || options.onDelta || options.onToolResult || options.onError) {
    handlers = options
    options = {}
  }
  let { accessToken } = getStoredAuth()
  let res = await postReviewAgentStream(message, options, accessToken)

  if (res.status === 401) {
    accessToken = await refreshAccessToken()
    res = await postReviewAgentStream(message, options, accessToken)
  }

  if (!res.ok || !res.body) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.message || '复盘助手请求失败')
  }

  await readSSE(res.body, handlers)
}

function postReviewAgentStream(message, options, accessToken) {
  return fetch(apiURL('/review-agent/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message,
      file_ids: options.file_ids || [],
      request_id: crypto.randomUUID?.() || String(Date.now()),
    }),
  })
}
