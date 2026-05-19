import { useState, useRef, useEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useSSE } from '../hooks/useSSE'
import { useImageUpload } from '../hooks/useImageUpload'
import ImagePreview from './ImagePreview'
import { messagesAtom, streamingAtom, streamErrorAtom, pendingImagesAtom, uploadedFileIdsAtom } from '../store/chat'
import { activeConversationIdAtom, isTempConversationAtom, conversationsAtom } from '../store/conversation'
import { listConversations, getConversationMessages, getPreviewURL } from '../api/index.js'

export default function InputBar() {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [pendingImages, setPendingImages] = useAtom(pendingImagesAtom)
  const [streaming, setStreaming] = useAtom(streamingAtom)
  const setStreamError = useSetAtom(streamErrorAtom)
  const setMessages = useSetAtom(messagesAtom)
  const activeId = useAtomValue(activeConversationIdAtom)
  const isTemp = useAtomValue(isTempConversationAtom)
  const setConversations = useSetAtom(conversationsAtom)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const { startStream } = useSSE()
  const { uploadImages } = useImageUpload()

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
    // Clear file input
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
    if (streaming) return

    setError('')
    setStreamError(null)
    setStreaming(true)

    try {
      let fileIDs = []

      // Upload images if any
      if (pendingImages.length > 0) {
        // Deduplicate by SHA256
        const shaMap = new Map()
        for (const img of pendingImages) {
          const sha = await computeSHA256(img.blob)
          if (!shaMap.has(sha)) {
            shaMap.set(sha, { ...img, sha256: sha })
          }
        }
        const uniqueImages = Array.from(shaMap.values())

        // Upload
        fileIDs = await uploadImages(uniqueImages)

        // Clean up blob URLs
        pendingImages.forEach(img => URL.revokeObjectURL(img.url))
        setPendingImages([])
      }

      // Determine conversation ID
      let conversationID = activeId
      let clientConversationID = null
      let createConversation = false

      if (isTemp) {
        clientConversationID = activeId
        createConversation = true
      } else if (!activeId) {
        clientConversationID = `temp_${Date.now()}`
        createConversation = true
      }

      // Get current page info
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentTab = tabs[0]
      const sourceURL = currentTab?.url || ''
      const sourceTitle = currentTab?.title || ''

      const clientRequestID = crypto.randomUUID()

      // Start SSE stream
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
        attachments: pendingImages.map((img, i) => ({
          attachment_type: 'image',
          preview_url: img.url,
          file_id: fileIDs[i],
        })),
        source_url: sourceURL,
        source_title: sourceTitle,
      }
      setMessages(prev => [...prev, userMsg])

      // Add assistant placeholder
      const assistantMsg = {
        tempId: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
        turn_no: 0,
      }
      setMessages(prev => [...prev, assistantMsg])

      let fullContent = ''

      await startStream(requestBody, {
        onEvent(event, data) {
          if (event === 'delta' && data?.content) {
            fullContent += data.content
            setMessages(prev => {
              const next = [...prev]
              const lastIdx = next.length - 1
              if (next[lastIdx]?.role === 'assistant') {
                next[lastIdx] = { ...next[lastIdx], content: fullContent }
              }
              return next
            })
          }
          if (event === 'conversation_created' && data?.conversation_id) {
            // Update temp conversation to real ID
            const realId = data.conversation_id
            setMessages(prev => prev.map(m => ({
              ...m,
              conversation_id: realId,
            })))
          }
          if (event === 'user_message_created' && data?.message_id) {
            // Update user message with real ID and attachments
            setMessages(prev => {
              const next = [...prev]
              // Find the last user message
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'user' && !next[i].id) {
                  next[i] = {
                    ...next[i],
                    id: data.message_id,
                    turn_no: data.turn_no,
                    attachments: data.attachments || next[i].attachments,
                  }
                  break
                }
              }
              return next
            })
          }
          if (event === 'assistant_message_created' && data?.message_id) {
            // Update assistant message with real ID
            setMessages(prev => {
              const next = [...prev]
              const lastIdx = next.length - 1
              if (next[lastIdx]?.role === 'assistant' && !next[lastIdx].id) {
                next[lastIdx] = {
                  ...next[lastIdx],
                  id: data.message_id,
                  turn_no: data.turn_no,
                }
              }
              return next
            })
          }
        },
        onComplete(data) {
          setStreaming(false)
          // Refresh conversation list
          listConversations().then(data => setConversations(data.items || [])).catch(() => {})
          // Clear text
          setText('')
        },
        onError(data) {
          setStreaming(false)
          setStreamError({ code: data?.code, message: data?.message || 'AI 回答出错' })
        },
      })

    } catch (err) {
      console.error('发送失败:', err)
      setError(err.message || '发送失败，请重试')
      setStreaming(false)
    }
  }, [text, pendingImages, streaming, activeId, isTemp, startStream, uploadImages, setMessages, setStreaming, setStreamError, setConversations, setPendingImages])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="input-bar">
      {/* Pending image previews */}
      <ImagePreview images={pendingImages} onRemove={removeImage} />

      {/* Error */}
      {error && <div className="error-banner">{error}</div>}

      {/* Input row */}
      <div className="input-row">
        <div className="input-actions">
          <button className="btn-paste-image" onClick={() => fileInputRef.current?.click()}>
            📎 图片
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
          disabled={streaming}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={streaming || (!text.trim() && pendingImages.length === 0)}
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
