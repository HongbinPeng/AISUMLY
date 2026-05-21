import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadImageFiles } from '../../../api/files.js'
import { updateMessageState } from '../../../api/messages.js'
import { listReviewAgentMessages, streamReviewAgent } from '../../../api/reviewAgent.js'

/**
 * useReviewAgent — 复盘助手页面的自定义 Hook
 *
 * 作用：把"数据"和"操作"打包在一起，让页面组件只需
 * const review = useReviewAgent() 一行代码就能拿到一切。
 *
 * 包含的数据：messages（消息列表）、cards（卡片列表）、
 *             input（输入框文字）、loading（加载状态）等。
 * 包含的操作：send（发送消息）、toggleCardState（切换卡片状态）等。
 */

/** 页面初次打开时显示的欢迎消息 */
const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是学习复盘助手。你可以问我今天有哪些待复习、哪些内容没理解，或者让我根据薄弱点出题。',
  tools: [],
}

export function useReviewAgent(initialPrompt = '') {
  // ==================== 数据状态 ====================

  /**
   * useState: 声明响应式状态
   * 返回 [当前值, 修改函数]
   * 调用修改函数会触发组件重新渲染
   */
  // 聊天消息列表，初始只有欢迎语
  const [messages, setMessages] = useState([welcomeMessage])
  // 右侧面板的消息卡片数据
  const [cards, setCards] = useState([])
  // 输入框文字
  const [input, setInput] = useState('')
  // 是否正在请求（控制发送按钮禁用状态）
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  // 右侧面板当前筛选条件：all | review | unread | favorite | image
  const [activeFilter, setActiveFilter] = useState('all')
  // 正在更新中的卡片 messageId 集合，防止重复点击
  const [updatingMessageIds, setUpdatingMessageIds] = useState({})

  /**
   * useRef: 创建一个"可变但不触发重新渲染"的引用
   * 常用于保存 DOM 元素引用或不需要触发 UI 更新的值
   */
  // 指向消息列表底部空白 div 的引用，用于自动滚动
  const bottomRef = useRef(null)

  // ==================== 副作用 ====================

  /**
   * useEffect: 副作用，相当于 Vue 的 watch / onMounted
   * 第二个参数是依赖数组，数组里的值变了就执行回调
   * [] = 只执行一次（onMounted）；不传 = 每次渲染都执行
   */
  // 每次 messages 更新，滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages]) // 依赖 messages，消息列表变化时触发

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
      if (items.length > 0) {
        setMessages(items)
      }
    } catch {
      setMessages((prev) => prev)
    } finally {
      setLoadingHistory(false)
    }
  }

  // ==================== 派生数据 ====================

  /**
   * useMemo: 缓存计算结果，依赖变了才重新计算
   * 相当于 Vue 的 computed，避免每次渲染都重复 filter
   */
  const filteredCards = useMemo(() => {
    if (activeFilter === 'review') return cards.filter((card) => card.is_review_later)
    if (activeFilter === 'unread') return cards.filter((card) => !card.is_understood)
    if (activeFilter === 'favorite') return cards.filter((card) => card.is_favorite)
    if (activeFilter === 'image') return cards.filter((card) => card.has_file)
    return cards // 'all' 返回全部
  }, [cards, activeFilter]) // 卡片列表或筛选条件变了才重新计算

  // ==================== 发送消息 ====================

  /**
   * 发送消息给 AI，参数 text 可以不传（默认用 input 状态）
   *
   * 流程：
   * 1. 清空输入框，标记 loading
   * 2. 往 messages 追加两条：用户消息 + 空 AI 占位消息
   * 3. 调用流式 API，通过回调逐步更新 AI 消息的 content
   * 4. 无论成功失败，解除 loading
   */
  async function send(text = input, draftAttachments = []) {
    const content = text.trim()
    if ((!content && draftAttachments.length === 0) || loading) return // 空内容或正在加载就忽略
    setInput('')                       // 清空输入框
    setLoading(true)                   // 标记为加载中

    // 生成唯一的 AI 消息 ID，后续回调用这个 ID 定位并更新这条消息
    const assistantId = `assistant-${Date.now()}`
    let uploadedImages = []
    try {
      uploadedImages = await uploadImageFiles(draftAttachments.map((item) => item.file))
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: err.message || '图片上传失败', tools: [] },
      ])
      setLoading(false)
      return
    }
    const imageAttachments = uploadedImages.map((item, index) => ({
      file_id: item.file_id,
      attachment_type: 'image',
      preview_url: draftAttachments[index]?.preview_url || '',
    }))
    const messageForAgent = content || '请根据我上传的截图，帮助我定位相关学习记录并做复盘。'

    // 同时往 messages 数组追加两条
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: messageForAgent, attachments: imageAttachments },
      { id: assistantId, role: 'assistant', content: '', tools: [] },
    ])

    try {
      // 调用流式 API
      await streamReviewAgent(messageForAgent, { file_ids: uploadedImages.map((item) => item.file_id) }, {
        /**
         * onToolResult: 后端返回工具查询结果（消息卡片列表）
         * setCards 更新右侧面板，同时标记 AI 消息已调用工具
         */
        onToolResult(data) {
          setCards(data?.items || [])
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId ? { ...message, tools: ['QueryMessages'], content: '' } : message
          )))
        },

        /**
         * onClarification: 后端需要向用户澄清问题
         * 比如用户问"今天学了什么"，后端可能反问"哪个科目？"
         */
        onClarification(question) {
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId
              ? { ...message, content: question, type: 'clarification' }
              : message
          )))
        },

        /**
         * onDelta: 收到流式文本片段，拼接到 AI 消息的 content 上
         * prev.map(...) 找到 assistantId 对应的消息，替换为新内容
         */
        onDelta(delta) {
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId
              ? { ...message, content: (message.content || '') + delta }
              : message
          )))
        },

        /** 流式请求报错 */
        onError(err) {
          setMessages((prev) => prev.map((message) => (
            message.id === assistantId
              ? { ...message, content: err?.message || '复盘助手请求失败' }
              : message
          )))
        },
      })
    } catch (err) {
      // 网络异常等未进入流式的错误
      setMessages((prev) => prev.map((message) => (
        message.id === assistantId ? { ...message, content: err.message || '请求失败' } : message
      )))
    } finally {
      // 无论成功失败，都解除 loading
      setLoading(false)
    }
  }

  // ==================== 切换卡片状态 ====================

  /**
   * 点击卡片上的收藏/已理解/待复习按钮时调用
   *
   * 参数：
   *  - card: 卡片对象
   *  - field: 要切换的字段名（'is_favorite' / 'is_understood' / 'is_review_later'）
   *  - explicitValue: 可选，显式指定目标值；不传则取反
   *
   * 策略：乐观更新（先改 UI，再调 API，失败则回滚）
   */
  async function toggleCardState(card, field, explicitValue) {
    const messageId = card.assistant_message_id
    // 没有消息 ID 或正在更新中，直接忽略
    if (!messageId || updatingMessageIds[messageId]) return

    // 如果没有显式传值，就取反；否则用传入的值
    const nextValue = explicitValue !== undefined ? explicitValue : !card[field]

    // 标记这条消息正在更新（按钮变禁用态，防重复点击）
    setUpdatingMessageIds((prev) => ({ ...prev, [messageId]: true }))

    // 乐观更新：先改前端显示，不等后端返回
    setCards((prev) => prev.map((item) => (
      item.assistant_message_id === messageId ? { ...item, [field]: nextValue } : item
    )))

    try {
      // 调用后端 API 持久化
      const updated = await updateMessageState(messageId, { [field]: nextValue })

      // 用后端返回的真实数据覆盖前端显示
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
      // 失败了回滚前端显示
      setCards((prev) => prev.map((item) => (
        item.assistant_message_id === messageId ? { ...item, [field]: !nextValue } : item
      )))
      alert(err.message || '更新消息状态失败')
    } finally {
      // 解除正在更新标记
      setUpdatingMessageIds((prev) => {
        const next = { ...prev }
        delete next[messageId]
        return next
      })
    }
  }

  // ==================== 导出 ====================

  /**
   * 把上面所有数据和操作打包成一个对象返回给页面组件
   * 页面组件只需要 const review = useReviewAgent() 即可使用
   */
  return {
    messages,           // 消息列表（数据）
    cards,              // 卡片列表（数据）
    filteredCards,      // 过滤后的卡片（派生数据）
    input,              // 输入框文字（数据）
    loading,            // 加载状态（数据）
    loadingHistory,     // 历史消息加载状态（数据）
    activeFilter,       // 当前筛选条件（数据）
    updatingMessageIds, // 正在更新的 ID 集合（数据）
    bottomRef,          // 滚动锚点（DOM 引用）
    send,               // 发送消息（方法）
    setInput,           // 修改输入框（方法）
    setActiveFilter,    // 切换筛选条件（方法）
    toggleCardState,    // 切换卡片状态（方法）
  }
}
