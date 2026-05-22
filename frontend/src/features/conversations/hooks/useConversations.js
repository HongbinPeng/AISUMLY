import { useEffect, useMemo, useRef, useState } from 'react'
import { streamChat } from '../../../api/chat.js'
import { getConversationMessages, listConversations } from '../../../api/conversations.js'
import { uploadImageFiles } from '../../../api/files.js'

function keyOf(id) {
  return id == null ? '' : String(id)
}

function isTempId(id) {
  return typeof id === 'string' && id.startsWith('temp_')
}

export function useConversations() {
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState('')
  const [messagesByConversation, setMessagesByConversation] = useState({})
  const [inputByConversation, setInputByConversation] = useState({})
  const [streamingByConversation, setStreamingByConversation] = useState({})
  const [errorsByConversation, setErrorsByConversation] = useState({})
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const bottomRef = useRef(null)

  const activeKey = keyOf(activeConversationId)
  const activeConversation = useMemo(() => {
    return conversations.find((conversation) => keyOf(conversation.id) === activeKey) || null
  }, [conversations, activeKey])
  const activeMessages = messagesByConversation[activeKey] || []
  const activeInput = inputByConversation[activeKey] || ''
  const activeStreaming = Boolean(streamingByConversation[activeKey])
  const activeError = errorsByConversation[activeKey] || null

  useEffect(() => {
    refreshConversations()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: activeStreaming ? 'smooth' : 'auto', block: 'end' })
  })

  useEffect(() => {
    if (!activeKey || isTempId(activeConversationId) || messagesByConversation[activeKey]) return
    loadConversationHistory(activeConversationId)
  }, [activeKey])

  async function refreshConversations() {
    setLoadingConversations(true)
    try {
      const data = await listConversations(50)
      const items = data.items || []
      setConversations(items)
      if (items.length === 0) {
        createTempConversation()
      } else {
        setActiveConversationId((prev) => prev || items[0]?.id || '')
      }
    } finally {
      setLoadingConversations(false)
    }
  }

  async function selectConversation(conversationId) {
    const nextKey = keyOf(conversationId)
    setActiveConversationId(conversationId)
    if (!nextKey || isTempId(conversationId) || messagesByConversation[nextKey]) return
    await loadConversationHistory(conversationId)
  }

  async function loadConversationHistory(conversationId) {
    const nextKey = keyOf(conversationId)
    if (!nextKey) return

    setLoadingMessages(true)
    try {
      const data = await getConversationMessages(conversationId, 80)
      setMessagesByConversation((prev) => ({ ...prev, [nextKey]: data.messages || [] }))
    } finally {
      setLoadingMessages(false)
    }
  }

  function createTempConversation() {
    const tempId = `temp_${Date.now()}`
    const tempConversation = {
      id: tempId,
      title: '新会话',
      message_count: 0,
      last_active_at: new Date().toISOString(),
      is_temp: true,
    }
    setConversations((prev) => [tempConversation, ...prev])
    setMessagesByConversation((prev) => ({ ...prev, [tempId]: [] }))
    setActiveConversationId(tempId)
  }

  function setActiveInput(text) {
    if (!activeKey) return
    setInputByConversation((prev) => {
      const next = { ...prev }
      if (text) {
        next[activeKey] = text
      } else {
        delete next[activeKey]
      }
      return next
    })
  }

  async function send(text = activeInput, draftAttachments = []) {
    const content = text.trim()
    if ((!content && draftAttachments.length === 0) || activeStreaming) return

    let conversationID = 0
    let clientConversationID = ''
    let createConversation = false
    let conversationKey = activeKey

    if (!conversationKey || isTempId(activeConversationId)) {
      clientConversationID = conversationKey || `temp_${Date.now()}`
      createConversation = true
      conversationKey = clientConversationID
      if (!activeConversationId) {
        setActiveConversationId(clientConversationID)
        setConversations((prev) => [{ id: clientConversationID, title: '新会话', is_temp: true, last_active_at: new Date().toISOString() }, ...prev])
      }
    } else {
      conversationID = Number(activeConversationId)
    }

    const userTempId = `user_${Date.now()}`
    const assistantTempId = `assistant_${Date.now()}`
    let uploadedImages = []
    try {
      uploadedImages = await uploadImageFiles(draftAttachments.map((item) => item.file))
    } catch (err) {
      setErrorsByConversation((prev) => ({ ...prev, [conversationKey]: { message: err.message || '图片上传失败' } }))
      return
    }
    const optimisticAttachments = uploadedImages.map((item, index) => ({
      file_id: item.file_id,
      attachment_type: 'image',
      preview_url: draftAttachments[index]?.preview_url || '',
    }))
    setErrorsByConversation((prev) => ({ ...prev, [conversationKey]: null }))
    setStreamingByConversation((prev) => ({ ...prev, [conversationKey]: true }))
    setInputByConversation((prev) => {
      const next = { ...prev }
      delete next[conversationKey]
      return next
    })
    setMessagesByConversation((prev) => ({
      ...prev,
      [conversationKey]: [
        ...(prev[conversationKey] || []),
        { tempId: userTempId, role: 'user', content, created_at: new Date().toISOString(), attachments: optimisticAttachments },
        { tempId: assistantTempId, role: 'assistant', content: '', created_at: new Date().toISOString(), attachments: [] },
      ],
    }))

    let streamKey = conversationKey
    let fullContent = ''

    try {
      await streamChat({
        client_request_id: crypto.randomUUID?.() || String(Date.now()),
        conversation_id: conversationID || undefined,
        client_conversation_id: clientConversationID,
        create_conversation: createConversation,
        content,
        file_ids: uploadedImages.map((item) => item.file_id),
        source_url: window.location.href,
        source_title: document.title || 'AISUMLY Web',
        context_recent_turns: 5,
      }, {
        onEvent(event) {
          const data = event.data
          if (event.event === 'conversation_created' && data?.conversation_id) {
            const realId = data.conversation_id
            const oldKey = streamKey
            streamKey = keyOf(realId)
            setMessagesByConversation((prev) => {
              const oldMessages = prev[oldKey] || []
              const next = { ...prev, [streamKey]: oldMessages.map((msg) => ({ ...msg, conversation_id: realId })) }
              delete next[oldKey]
              return next
            })
            setStreamingByConversation((prev) => {
              const next = { ...prev, [streamKey]: true }
              delete next[oldKey]
              return next
            })
            setConversations((prev) => {
              const withoutTemp = prev.filter((conversation) => keyOf(conversation.id) !== oldKey && keyOf(conversation.id) !== streamKey)
              return [{ id: realId, title: data.title || '新会话', last_active_at: new Date().toISOString(), message_count: 0 }, ...withoutTemp]
            })
            setActiveConversationId((current) => (keyOf(current) === oldKey ? realId : current))
          }

          if (event.event === 'user_message_created' && data?.message_id) {
            patchLastMessage(streamKey, 'user', (msg) => ({
              ...msg,
              id: data.message_id,
              conversation_id: data.conversation_id,
              turn_no: data.turn_no,
              sequence_no: data.sequence_no,
              attachments: data.attachments || msg.attachments,
            }))
          }

          if (event.event === 'assistant_message_created' && data?.message_id) {
            patchLastMessage(streamKey, 'assistant', (msg) => ({
              ...msg,
              id: data.message_id,
              conversation_id: data.conversation_id,
              turn_no: data.turn_no,
              sequence_no: data.sequence_no,
            }))
          }

          if (event.event === 'delta' && data?.content) {
            fullContent += data.content
            patchLastMessage(streamKey, 'assistant', (msg) => ({ ...msg, content: fullContent }))
          }

          if (event.event === 'error') {
            setErrorsByConversation((prev) => ({ ...prev, [streamKey]: data }))
          }
        },
      })
      await refreshConversations().catch(() => {})
    } catch (err) {
      setErrorsByConversation((prev) => ({ ...prev, [streamKey]: { message: err.message || 'AI 回答出错' } }))
    } finally {
      setStreamingByConversation((prev) => {
        const next = { ...prev }
        delete next[streamKey]
        delete next[conversationKey]
        return next
      })
    }
  }

  function patchLastMessage(conversationKey, role, mapper) {
    setMessagesByConversation((prev) => {
      const messages = [...(prev[conversationKey] || [])]
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === role) {
          messages[i] = mapper(messages[i])
          break
        }
      }
      return { ...prev, [conversationKey]: messages }
    })
  }

  function updateLocalMessage(messageId, patch) {
    setMessagesByConversation((prev) => {
      const next = {}
      for (const [conversationId, messages] of Object.entries(prev)) {
        next[conversationId] = messages.map((message) => (
          message.id === messageId ? { ...message, ...patch } : message
        ))
      }
      return next
    })
  }

  return {
    conversations,
    activeConversation,
    activeConversationId,
    activeMessages,
    activeInput,
    activeStreaming,
    activeError,
    loadingConversations,
    loadingMessages,
    bottomRef,
    createTempConversation,
    refreshConversations,
    selectConversation,
    send,
    setActiveInput,
    updateLocalMessage,
  }
}
