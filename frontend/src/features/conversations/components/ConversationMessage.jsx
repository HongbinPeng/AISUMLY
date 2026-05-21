import MarkdownIt from 'markdown-it'
import { MessageStatusEditor } from '../../../components/common/MessageStatusEditor.jsx'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function ConversationMessage({ message, streaming, onMessageUpdated }) {
  const isUser = message.role === 'user'
  const isStreamingAssistant = !isUser && !message.content && streaming
  const images = (message.attachments || []).filter((item) => item.attachment_type === 'image')

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <Avatar label="AI" />}
      <div className={`max-w-[78%] rounded-lg px-4 py-3 shadow-sm ${isUser ? 'rounded-br-sm bg-blue-600 text-white shadow-blue-100' : 'rounded-bl-sm border border-slate-200 bg-slate-50 text-slate-900 shadow-slate-200/50'}`}>
        {images.length > 0 && (
          <div className="mb-2 grid max-w-[420px] grid-cols-2 gap-2">
            {images.map((image) => (
              image.preview_url ? (
                <img key={image.file_id || image.id} className="h-32 rounded-lg object-cover" src={image.preview_url} alt="消息图片" />
              ) : null
            ))}
          </div>
        )}

        {isStreamingAssistant && <span className="text-sm text-slate-500">正在思考...</span>}
        {message.content && (
          isUser ? (
            <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
          ) : (
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: md.render(message.content) }} />
          )
        )}

        {!isUser && <MessageStatusEditor message={message} onUpdated={onMessageUpdated} />}

        <div className={`mt-2 text-xs ${isUser ? 'text-blue-100' : 'text-slate-400'}`}>{formatTime(message.created_at)}</div>
      </div>
      {isUser && <Avatar label="我" />}
    </div>
  )
}

function Avatar({ label }) {
  return <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-600">{label}</div>
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
