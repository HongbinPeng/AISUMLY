import { useAtomValue } from 'jotai'
import MarkdownRender from './MarkdownRender'
import MessageStatusEditor from './MessageStatusEditor'
import { activeConversationStreamingAtom } from '../store/chat'
import { formatRelativeTime } from '../utils/time'

export default function MessageBubble({ message, previewURLs }) {
  if (!message) return null

  const isUser = message.role === 'user'
  const time = message.created_at ? formatRelativeTime(message.created_at) : ''
  const streaming = useAtomValue(activeConversationStreamingAtom)

  const attachments = message.attachments || []
  const images = attachments
    .filter((item) => item.attachment_type === 'image')
    .map((item) => ({
      file_id: item.file_id,
      url: item.preview_url || previewURLs?.[item.file_id] || '',
    }))

  const isStreamingAssistant = !isUser && !message.content && streaming

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-avatar">{isUser ? '我' : 'AI'}</div>
      <div className="message-content">
        {images.length > 0 && (
          <div className="bubble-images">
            {images.map((image, index) => (
              image.url ? (
                <img
                  key={image.file_id || index}
                  src={image.url}
                  alt={`图片 ${index + 1}`}
                  onClick={() => window.open(image.url, '_blank')}
                />
              ) : null
            ))}
          </div>
        )}

        {isStreamingAssistant && (
          <div className="bubble-text">
            <div className="loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}

        {message.content && (
          <div className="bubble-text">
            {isUser ? <span>{message.content}</span> : <MarkdownRender content={message.content} />}
          </div>
        )}

        {!isUser && <MessageStatusEditor message={message} />}

        <div className="message-meta">
          {time && <span>{time}</span>}
          {message.source_title && (
            <span title={message.source_url}>{truncate(message.source_title, 30)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? `${str.slice(0, max)}...` : str
}
