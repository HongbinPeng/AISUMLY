import { request } from '../utils/request.js'

/**
 * 更新 AI 回复消息的学习状态。
 * @param {number|string} messageId 消息 ID
 * @param {{is_favorite?: boolean, is_understood?: boolean, is_review_later?: boolean, user_note?: string}} patch 更新字段
 * @returns {Promise<object>} 更新后的消息
 */
export function updateMessageState(messageId, patch) {
  return request(`/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}
