import MarkdownRender from './MarkdownRender'
import MessageStatusEditor from './MessageStatusEditor'

export default function MessageBubble({ message, previewURLs }) {
  if (!message) return null

  const isUser = message.role === 'user'
  const time = message.created_at ? formatTime(message.created_at) : ''

  // Get image preview URLs for this message
  const attachments = message.attachments || []
  const images = attachments
    .filter(a => a.attachment_type === 'image')
    .map(a => ({
      file_id: a.file_id,
      url: a.preview_url || previewURLs?.[a.file_id] || '',
    }))

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-avatar">
        {isUser ? '我' : 'AI'}
      </div>
      <div className="message-content">
        {/* Images */}
        {images.length > 0 && (
          <div className="bubble-images">
            {images.map((img, i) => (
              img.url ? (
                <img
                  key={i}
                  src={img.url}
                  alt={`图片 ${i + 1}`}
                  onClick={() => window.open(img.url, '_blank')}
                />
              ) : null
            ))}
          </div>
        )}

        {/* Text */}
        {message.content && (
          <div className="bubble-text">
            {isUser ? (
              <span>{message.content}</span>
            ) : (
              <MarkdownRender content={message.content} />
            )}
          </div>
        )}

        {/* Status bar (assistant only) */}
        {!isUser && <MessageStatusEditor message={message} />}

        {/* Meta */}
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

function formatTime(dateStr) {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '...' : str
}
