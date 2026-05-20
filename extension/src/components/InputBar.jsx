import { useState, useRef, useEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useSSE } from '../hooks/useSSE'
import { useImageUpload } from '../hooks/useImageUpload'
import ImagePreview from './ImagePreview'
import {
  activeConversationStreamingAtom,
  activeStreamingConvIdAtom,
  inputTextAtom,
  moveConversationMessagesAtom,
  pendingImagesAtom,
  setConversationInputTextAtom,
  setConversationStreamErrorAtom,
  setConversationStreamingAtom,
  updateConversationMessagesAtom,
  updateConversationPendingImagesAtom,
} from '../store/chat'
import { activeConversationIdAtom, isTempConversationAtom, conversationsAtom } from '../store/conversation'
import { listConversations } from '../api/index.js'

export default function InputBar() {
  const [text, setText] = useAtom(inputTextAtom)
  const [error, setError] = useState('')
  const [pendingImages, setPendingImages] = useAtom(pendingImagesAtom)
  const activeIsStreaming = useAtomValue(activeConversationStreamingAtom)
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom)
  const isTemp = useAtomValue(isTempConversationAtom)
  const setConversations = useSetAtom(conversationsAtom)
  const setActiveStreamingConvId = useSetAtom(activeStreamingConvIdAtom)
  const setConversationStreaming = useSetAtom(setConversationStreamingAtom)
  const setConversationInputText = useSetAtom(setConversationInputTextAtom)
  const setConversationStreamError = useSetAtom(setConversationStreamErrorAtom)
  const updateConversationMessages = useSetAtom(updateConversationMessagesAtom)
  const moveConversationMessages = useSetAtom(moveConversationMessagesAtom)
  const updateConversationPendingImages = useSetAtom(updateConversationPendingImagesAtom)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const { startStream } = useSSE()
  const { uploadImages } = useImageUpload()

  // 当前激活会话引用，避免异步回调清空用户已经切换到的新会话输入。
  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [text])

  // Handle paste (text and images)
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageItems = []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (blob) {
          const url = URL.createObjectURL(blob)
          imageItems.push({
            blob,
            url,
            filename: `paste-${Date.now()}.${blob.type.split('/')[1] || 'png'}`,
            mimeType: blob.type,
            size: blob.size,
          })
        }
      }
    }

    if (imageItems.length > 0) {
      setPendingImages(prev => [...prev, ...imageItems])
    }
  }, [setPendingImages])

  // Handle file selection
  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files || [])
    const newImages = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const url = URL.createObjectURL(file)
      newImages.push({
        blob: file,
        url,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      })
    }
    setPendingImages(prev => [...prev, ...newImages])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [setPendingImages])

  const removeImage = useCallback((index) => {
    setPendingImages(prev => {
      const next = [...prev]
      if (next[index]?.url) URL.revokeObjectURL(next[index].url)
      next.splice(index, 1)
      return next
    })
  }, [setPendingImages])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed && pendingImages.length === 0) return
    if (activeIsStreaming) return

    setError('')

    // 先确定本次请求所属会话。后续即使用户切换会话，所有回调也只更新这个会话。
    let conversationID = null
    let clientConversationID = null
    let createConversation = false

    if (isTemp) {
      clientConversationID = activeId
      createConversation = true
    } else if (!activeId) {
      clientConversationID = `temp_${Date.now()}`
      createConversation = true
    } else {
      conversationID = activeId
    }

    let conversationKey = conversationID || clientConversationID
    if (!conversationKey) return

    // 每次发送都拥有独立的流式会话 key，允许多个会话同时生成。
    let streamConversationKey = conversationKey
    setConversationStreamError({ conversationId: conversationKey, error: null })
    setConversationStreaming({ conversationId: conversationKey, streaming: true })
    setActiveStreamingConvId(conversationKey)

    try {
      let fileIDs = []
      const localPendingImages = pendingImages

      if (localPendingImages.length > 0) {
        const shaMap = new Map()
        for (const img of localPendingImages) {
          const sha = await computeSHA256(img.blob)
          if (!shaMap.has(sha)) {
            shaMap.set(sha, { ...img, sha256: sha })
          }
        }
        const uniqueImages = Array.from(shaMap.values())

        fileIDs = await uploadImages(uniqueImages)

        localPendingImages.forEach(img => URL.revokeObjectURL(img.url))
        updateConversationPendingImages({ conversationId: conversationKey, updater: [] })
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentTab = tabs[0]
      const sourceURL = currentTab?.url || ''
      const sourceTitle = currentTab?.title || ''

      const clientRequestID = crypto.randomUUID()

      const requestBody = {
        client_request_id: clientRequestID,
        conversation_id: conversationID || undefined,
        client_conversation_id: clientConversationID,
        create_conversation: createConversation,
        content: trimmed || '请解释这些图片中的内容，并结合上下文回答。',
        file_ids: fileIDs,
        source_url: sourceURL,
        source_title: sourceTitle,
        context_recent_turns: 5,
      }

      // Add user message immediately
      const userMsg = {
        tempId: `user_${Date.now()}`,
        role: 'user',
        content: trimmed || '[图片]',
        turn_no: 0,
        attachments: localPendingImages.map((img, i) => ({
          attachment_type: 'image',
          preview_url: img.url,
          file_id: fileIDs[i],
        })),
        source_url: sourceURL,
        source_title: sourceTitle,
      }
      updateConversationMessages({ conversationId: conversationKey, updater: prev => [...prev, userMsg] })

      // Add assistant placeholder
      const assistantMsg = {
        tempId: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
        turn_no: 0,
      }
      updateConversationMessages({ conversationId: conversationKey, updater: prev => [...prev, assistantMsg] })
      setConversationInputText({ conversationId: conversationKey, text: '' })

      let fullContent = ''

      await startStream(requestBody, {
        onEvent(event, data) {
          if (event === 'conversation_created' && data?.conversation_id) {
            const realId = data.conversation_id
            const oldKey = streamConversationKey
            streamConversationKey = realId
            conversationKey = realId
            moveConversationMessages({ from: oldKey, to: realId })
            setConversationStreaming({ conversationId: oldKey, streaming: false })
            setConversationStreaming({ conversationId: realId, streaming: true })
            setConversationStreamError({ conversationId: oldKey, error: null })
            setActiveStreamingConvId(realId)
            setConversations(prev => {
              if (prev.some(conv => conv.id === realId)) return prev
              return [{
                id: realId,
                title: data.title || '新会话',
                message_count: 0,
                last_active_at: new Date().toISOString(),
              }, ...prev]
            })
            if (activeIdRef.current === oldKey) {
              setActiveId(realId)
            }
            updateConversationMessages({
              conversationId: realId,
              updater: prev => prev.map(m => ({ ...m, conversation_id: realId })),
            })
          }
          if (event === 'user_message_created' && data?.message_id) {
            updateConversationMessages({ conversationId: streamConversationKey, updater: prev => {
              const next = [...prev]
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'user' && !next[i].id) {
                  next[i] = {
                    ...next[i],
                    id: data.message_id,
                    turn_no: data.turn_no,
                    attachments: data.attachments || next[i].attachments,
                    conversation_id: data.conversation_id,
                  }
                  break
                }
              }
              return next
            }})
          }
          if (event === 'assistant_message_created' && data?.message_id) {
            updateConversationMessages({ conversationId: streamConversationKey, updater: prev => {
              const next = [...prev]
              const lastIdx = next.length - 1
              if (next[lastIdx]?.role === 'assistant' && !next[lastIdx].id) {
                next[lastIdx] = {
                  ...next[lastIdx],
                  id: data.message_id,
                  turn_no: data.turn_no,
                  conversation_id: data.conversation_id,
                }
              }
              return next
            }})
          }
          if (event === 'delta' && data?.content) {
            fullContent += data.content
            updateConversationMessages({ conversationId: streamConversationKey, updater: prev => {
              const next = [...prev]
              const lastIdx = next.length - 1
              if (next[lastIdx]?.role === 'assistant') {
                next[lastIdx] = { ...next[lastIdx], content: fullContent }
              }
              return next
            }})
          }
        },
        onComplete() {
          const finishedKey = streamConversationKey
          setConversationStreaming({ conversationId: finishedKey, streaming: false })
          setActiveStreamingConvId(null)
          listConversations().then(data => setConversations(data.items || [])).catch(() => {})
          setConversationInputText({ conversationId: finishedKey, text: '' })
        },
        onError(data) {
          const failedKey = streamConversationKey
          setConversationStreaming({ conversationId: failedKey, streaming: false })
          setActiveStreamingConvId(null)
          setConversationStreamError({
            conversationId: failedKey,
            error: { code: data?.code, message: data?.message || 'AI 回答出错' },
          })
        },
      })

    } catch (err) {
      console.error('发送失败:', err)
      setError(err.message || '发送失败，请重试')
      setConversationStreaming({ conversationId: conversationKey, streaming: false })
      setActiveStreamingConvId(null)
    }
  }, [text, pendingImages, activeIsStreaming, activeId, isTemp, startStream, uploadImages, setConversations, setActiveStreamingConvId, setConversationStreaming, setConversationInputText, setConversationStreamError, updateConversationMessages, moveConversationMessages, updateConversationPendingImages, setActiveId])

  // 只在当前会话生成中时禁用发送，其他会话可以继续输入和发起新请求。
  const isSendDisabled = activeIsStreaming || (!text.trim() && pendingImages.length === 0)

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="input-bar">
      <ImagePreview images={pendingImages} onRemove={removeImage} />

      {error && <div className="error-banner">{error}</div>}

      <div className="input-row">
        <div className="input-actions">
          <button className="btn-paste-image" onClick={() => fileInputRef.current?.click()} title="插入图片">
            <img src="/icons/插入链接.png" alt="图片" width="18" height="18" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
        <textarea
          ref={textareaRef}
          placeholder="继续追问，Shift+Enter 换行"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={isSendDisabled}
          title="发送"
        >
          ↑
        </button>
      </div>
    </div>
  )
}

// Compute SHA-256 hash of a blob using Web Crypto API
async function computeSHA256(blob) {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
