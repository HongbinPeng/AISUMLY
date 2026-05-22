import { useEffect, useMemo, useRef, useState } from 'react'
import { updateMessageState } from '../../../api/messages.js'
import { listReviewAgentMessages, streamReviewAgent } from '../../../api/reviewAgent.js'

const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是学习复盘助手。你可以问我今天有哪些待复习、哪些内容没理解，或者让我根据薄弱点出题。',
  tools: [],
}

export function useReviewAgent(initialPrompt = '') {
  const [messages, setMessages] = useState([welcomeMessage])
  const [cards, setCards] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [updatingMessageIds, setUpdatingMessageIds] = useState({})
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    if (initialPrompt) setInput(initialPrompt)
  }, [initialPrompt])

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const data = await listReviewAgentMessages(20)
      const items = (data.items || []).map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        type: item.message_type,
        tools: [],
        created_at: item.created_at,
      }))
      if (items.length > 0) setMessages(items)
    } catch {
      setMessages((prev) => prev)
    } finally {
      setLoadingHistory(false)
    }
  }

  const filteredCards = useMemo(() => {
    if (activeFilter === 'review') return cards.filter((card) => card.is_review_later)
    if (activeFilter === 'unread') return cards.filter((card) => !card.is_understood)
    if (activeFilter === 'favorite') return cards.filter((card) => card.is_favorite)
    if (activeFilter === 'image') return cards.filter((card) => card.has_file)
    return cards
  }, [cards, activeFilter])

  async function send(text = input) {
    const content = text.trim()
    if (!content || loading) return

    setInput('')
    setLoading(true)

    const assistantId = `assistant-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content },
      { id: assistantId, role: 'assistant', content: '', tools: [] },
    ])

    try {
      await streamReviewAgent(content, {}, {
        onToolResult(data) {
          setCards(data?.items || [])
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId ? { ...message, tools: ['QueryMessages'], content: '' } : message
          )))
        },
        onClarification(question) {
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId ? { ...message, content: question, type: 'clarification' } : message
          )))
        },
        onDelta(delta) {
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId ? { ...message, content: (message.content || '') + delta } : message
          )))
        },
        onError(err) {
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId ? { ...message, content: err?.message || '复盘助手请求失败' } : message
          )))
        },
      })
    } catch (err) {
      setMessages((prev) => prev.map((message) => (
        message.id === assistantId ? { ...message, content: err.message || '请求失败' } : message
      )))
    } finally {
      setLoading(false)
    }
  }

  async function toggleCardState(card, field, explicitValue) {
    const messageId = card.assistant_message_id
    if (!messageId || updatingMessageIds[messageId]) return

    const nextValue = explicitValue !== undefined ? explicitValue : !card[field]
    setUpdatingMessageIds((prev) => ({ ...prev, [messageId]: true }))
    setCards((prev) => prev.map((item) => (
      item.assistant_message_id === messageId ? { ...item, [field]: nextValue } : item
    )))

    try {
      const updated = await updateMessageState(messageId, { [field]: nextValue })
      setCards((prev) => prev.map((item) => (
        item.assistant_message_id === messageId
          ? {
              ...item,
              is_favorite: updated.is_favorite,
              is_understood: updated.is_understood,
              is_review_later: updated.is_review_later,
              user_note: updated.user_note,
            }
          : item
      )))
    } catch (err) {
      setCards((prev) => prev.map((item) => (
        item.assistant_message_id === messageId ? { ...item, [field]: !nextValue } : item
      )))
      alert(err.message || '更新消息状态失败')
    } finally {
      setUpdatingMessageIds((prev) => {
        const next = { ...prev }
        delete next[messageId]
        return next
      })
    }
  }

  return {
    messages,
    cards,
    filteredCards,
    input,
    loading,
    loadingHistory,
    activeFilter,
    updatingMessageIds,
    bottomRef,
    send,
    setInput,
    setActiveFilter,
    toggleCardState,
  }
}
