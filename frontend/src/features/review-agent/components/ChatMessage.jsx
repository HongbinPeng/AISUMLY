import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function ChatMessage({ message }) {
  const images = (message.attachments || []).filter((item) => item.attachment_type === 'image')

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[68%] rounded-lg rounded-br-sm bg-blue-600 px-4 py-3 text-sm leading-7 text-white shadow-sm shadow-blue-200">
          {images.length > 0 && <ImageGrid images={images} />}
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-600">AI</div>
      <div className="max-w-[88%] rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 shadow-sm shadow-slate-200/40">
        {message.content ? (
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: md.render(message.content) }} />
        ) : (
          <span className="text-sm text-slate-500">正在思考...</span>
        )}
        {message.tools?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.tools.map((tool) => <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700" key={tool}>{tool}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

function ImageGrid({ images }) {
  return (
    <div className="mb-2 grid max-w-[420px] grid-cols-2 gap-2">
      {images.map((image) => (
        image.preview_url ? (
          <img key={image.file_id || image.id} className="h-32 rounded-lg object-cover" src={image.preview_url} alt="消息图片" />
        ) : null
      ))}
    </div>
  )
}
