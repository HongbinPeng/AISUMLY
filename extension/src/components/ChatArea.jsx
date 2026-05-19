import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import MessageBubble from './MessageBubble'
import InputBar from './InputBar'
import { messagesAtom, streamingAtom, streamErrorAtom } from '../store/chat'
import { isTempConversationAtom } from '../store/conversation'

export default function ChatArea({ conversation, previewURLs }) {
  const messages = useAtomValue(messagesAtom)
  const streaming = useAtomValue(streamingAtom)
  const streamError = useAtomValue(streamErrorAtom)
  const isTemp = useAtomValue(isTempConversationAtom)
  const messagesEndRef = useRef(null)

  // Auto-scroll to bottom
  // Use smooth scroll during streaming, instant when loading history
  useEffect(() => {
    const behavior = streaming ? 'smooth' : 'instant'
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [messages, streaming])

  // No conversation selected AND not a temp conversation
  if (!conversation && !isTemp) {
    return (
      <div className="chat-area">
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <div className="empty-text">选择一个会话开始对话</div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <span className="chat-title">{conversation?.title || '新会话'}</span>
        <span className="chat-context-info">
          {messages.length > 0 && `共 ${messages.length} 条消息`}
        </span>
      </div>

      <div className="messages-container">
        {messages.length === 0 && !streaming && (
          <div className="empty-state">
            <div className="empty-icon">✨</div>
            <div className="empty-text">暂无消息，发送一条开始对话吧</div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id || msg.tempId}
            message={msg}
            previewURLs={previewURLs}
          />
        ))}

        {/* Error banner */}
        {streamError && (
          <div className="error-banner">
            {streamError.message || 'AI 回答出错，请稍后重试'}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar inside chat area, below messages */}
      <InputBar />
    </div>
  )
}
