import { request } from '../utils/request.js'

/**
 * 查询当前用户会话列表。
 * @returns {Promise<Array<object>>} 会话列表
 */
export function listConversations(limit = 30) {
  return request(`/conversations?limit=${limit}`)
}

/**
 * 查询指定会话的历史消息。
 * @param {number|string} conversationId 会话 ID
 * @param {number} limit 返回条数
 * @param {number} beforeSequenceNo 分页游标，小于该 sequence_no 的消息
 * @returns {Promise<{conversation: object, messages: Array<object>, has_more: boolean}>} 会话详情和消息列表
 */
export function getConversationMessages(conversationId, limit = 50, beforeSequenceNo = 0) {
  return request(`/conversations/${conversationId}/messages?limit=${limit}&before_sequence_no=${beforeSequenceNo}`)
}

/**
 * 更新会话标题。
 * @param {number|string} conversationId 会话 ID
 * @param {string} title 新标题
 * @returns {Promise<object>} 更新后的会话
 */
export function updateConversationTitle(conversationId, title) {
  return request(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}
