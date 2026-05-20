import { atom } from 'jotai'
import { activeConversationIdAtom } from './conversation'

// 按会话保存消息，避免某个会话的流式回调写到当前正在查看的其他会话里。
export const messagesByConversationAtom = atom({})

// 当前会话消息。
// 每条消息结构：{ id, turn_no, role, content, sequence_no, status, attachments, source_url, source_title, created_at, is_favorite, is_understood, is_review_later, user_note }
export const messagesAtom = atom(
  (get) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return []
    return get(messagesByConversationAtom)[activeId] || []
  },
  (get, set, updater) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return
    const currentMap = get(messagesByConversationAtom)
    const currentMessages = currentMap[activeId] || []
    const nextMessages = typeof updater === 'function' ? updater(currentMessages) : updater
    set(messagesByConversationAtom, { ...currentMap, [activeId]: nextMessages })
  }
)

// 更新指定会话消息，供流式回调使用。
export const updateConversationMessagesAtom = atom(null, (get, set, { conversationId, updater }) => {
  if (!conversationId) return
  const currentMap = get(messagesByConversationAtom)
  const currentMessages = currentMap[conversationId] || []
  const nextMessages = typeof updater === 'function' ? updater(currentMessages) : updater
  set(messagesByConversationAtom, { ...currentMap, [conversationId]: nextMessages })
})

// 临时会话拿到后端真实 ID 后，把本地消息迁移到真实会话下。
export const moveConversationMessagesAtom = atom(null, (get, set, { from, to }) => {
  if (!from || !to || from === to) return
  const currentMap = get(messagesByConversationAtom)
  const fromMessages = currentMap[from] || []
  const toMessages = currentMap[to] || []
  const nextMap = { ...currentMap, [to]: toMessages.length > 0 ? toMessages : fromMessages }
  delete nextMap[from]
  set(messagesByConversationAtom, nextMap)
})

// 按会话保存流式状态。一个会话生成中时，只锁住这个会话的发送入口。
export const streamingByConversationAtom = atom({})
export const streamingAtom = atom((get) => {
  return Object.values(get(streamingByConversationAtom)).some(Boolean)
})
export const activeConversationStreamingAtom = atom((get) => {
  const activeId = get(activeConversationIdAtom)
  if (!activeId) return false
  return Boolean(get(streamingByConversationAtom)[activeId])
})
export const setConversationStreamingAtom = atom(null, (get, set, { conversationId, streaming }) => {
  if (!conversationId) return
  const currentMap = get(streamingByConversationAtom)
  const nextMap = { ...currentMap }
  if (streaming) {
    nextMap[conversationId] = true
  } else {
    delete nextMap[conversationId]
  }
  set(streamingByConversationAtom, nextMap)
})

// 当前仍保留这个 atom，方便后续在侧边栏标记哪个会话正在生成。
export const activeStreamingConvIdAtom = atom(null)

// 按会话保存流式错误，避免旧会话失败提示显示到新会话。
export const streamErrorsByConversationAtom = atom({})
export const streamErrorAtom = atom(
  (get) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return null
    return get(streamErrorsByConversationAtom)[activeId] || null
  },
  (get, set, error) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return
    const currentMap = get(streamErrorsByConversationAtom)
    const nextMap = { ...currentMap }
    if (error) {
      nextMap[activeId] = error
    } else {
      delete nextMap[activeId]
    }
    set(streamErrorsByConversationAtom, nextMap)
  }
)
export const setConversationStreamErrorAtom = atom(null, (get, set, { conversationId, error }) => {
  if (!conversationId) return
  const currentMap = get(streamErrorsByConversationAtom)
  const nextMap = { ...currentMap }
  if (error) {
    nextMap[conversationId] = error
  } else {
    delete nextMap[conversationId]
  }
  set(streamErrorsByConversationAtom, nextMap)
})

// 按会话保存待发送图片草稿。切换会话不会互相清空图片。
export const pendingImagesByConversationAtom = atom({})
export const pendingImagesAtom = atom(
  (get) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return []
    return get(pendingImagesByConversationAtom)[activeId] || []
  },
  (get, set, updater) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return
    const currentMap = get(pendingImagesByConversationAtom)
    const currentImages = currentMap[activeId] || []
    const nextImages = typeof updater === 'function' ? updater(currentImages) : updater
    set(pendingImagesByConversationAtom, { ...currentMap, [activeId]: nextImages })
  }
)

// 更新指定会话的图片草稿，供异步上传完成后清理原会话草稿。
export const updateConversationPendingImagesAtom = atom(null, (get, set, { conversationId, updater }) => {
  if (!conversationId) return
  const currentMap = get(pendingImagesByConversationAtom)
  const currentImages = currentMap[conversationId] || []
  const nextImages = typeof updater === 'function' ? updater(currentImages) : updater
  const nextMap = { ...currentMap }
  if (nextImages.length > 0) {
    nextMap[conversationId] = nextImages
  } else {
    delete nextMap[conversationId]
  }
  set(pendingImagesByConversationAtom, nextMap)
})

// 按会话保存输入框文本草稿。不同会话上下文不同，输入内容也不应互相复用。
export const inputTextByConversationAtom = atom({})
export const inputTextAtom = atom(
  (get) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return ''
    return get(inputTextByConversationAtom)[activeId] || ''
  },
  (get, set, text) => {
    const activeId = get(activeConversationIdAtom)
    if (!activeId) return
    const currentMap = get(inputTextByConversationAtom)
    const nextMap = { ...currentMap }
    if (text) {
      nextMap[activeId] = text
    } else {
      delete nextMap[activeId]
    }
    set(inputTextByConversationAtom, nextMap)
  }
)

// 更新指定会话的输入框文本，供流式完成后只清理发起请求的会话。
export const setConversationInputTextAtom = atom(null, (get, set, { conversationId, text }) => {
  if (!conversationId) return
  const currentMap = get(inputTextByConversationAtom)
  const nextMap = { ...currentMap }
  if (text) {
    nextMap[conversationId] = text
  } else {
    delete nextMap[conversationId]
  }
  set(inputTextByConversationAtom, nextMap)
})

// Uploaded file IDs (result of confirm)
export const uploadedFileIdsAtom = atom([])

// Derived: has unsent content
export const hasUnsentContentAtom = atom((get) => {
  const pending = get(pendingImagesAtom)
  return pending.length > 0
})

// Derived: last N turns for context display
export const recentTurnsAtom = atom((get) => {
  const msgs = get(messagesAtom)
  if (msgs.length === 0) return 0
  return msgs[msgs.length - 1].turn_no || 0
})
