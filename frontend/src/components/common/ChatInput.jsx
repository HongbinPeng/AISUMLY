import { useEffect, useRef, useState } from 'react'

const supportedImageTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

export function ChatInput({
  value,
  disabled,
  placeholder,
  submitLabel = '发送',
  pendingLabel = '生成中',
  enableImages = false,
  onChange,
  onSend,
}) {
  const fileInputRef = useRef(null)
  const rootRef = useRef(null)
  const attachmentsRef = useRef([])
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const isBusy = disabled || sending
  const canSend = !isBusy && (value.trim() || attachments.length > 0)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => () => {
    attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.preview_url))
  }, [])

  useEffect(() => {
    if (!enableImages) return undefined
    function handleDocumentPaste(event) {
      if (disabled || sending) return
      const active = document.activeElement
      const isInsideComposer = rootRef.current?.contains(active)
      const isTypingOutside = active && ['INPUT', 'TEXTAREA'].includes(active.tagName) && !isInsideComposer
      if (isTypingOutside) return
      const imageFiles = imageFilesFromDataTransfer(event.clipboardData)
      if (imageFiles.length === 0) return
      event.preventDefault()
      addFiles(imageFiles)
    }
    document.addEventListener('paste', handleDocumentPaste)
    return () => document.removeEventListener('paste', handleDocumentPaste)
  }, [disabled, enableImages, sending, attachments.length])

  function addFiles(files) {
    if (!enableImages) return
    const nextFiles = Array.from(files || [])
      .filter((file) => supportedImageTypes.has(file.type))
      .slice(0, Math.max(0, 5 - attachments.length))
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID?.() || Date.now()}`,
        file,
        preview_url: URL.createObjectURL(file),
      }))
    if (nextFiles.length === 0) return
    setAttachments((prev) => [...prev, ...nextFiles])
  }

  function removeAttachment(id) {
    setAttachments((prev) => {
      const removing = prev.find((item) => item.id === id)
      if (removing) URL.revokeObjectURL(removing.preview_url)
      return prev.filter((item) => item.id !== id)
    })
  }

  async function submit() {
    if (!canSend) return
    const currentAttachments = attachments
    setSending(true)
    try {
      await onSend(value, currentAttachments)
      setAttachments([])
    } finally {
      setSending(false)
    }
  }

  return (
    <footer
      ref={rootRef}
      className="shrink-0 border-t border-slate-200 bg-white px-4 py-3"
      onDragOver={(e) => {
        if (!enableImages) return
        e.preventDefault()
      }}
      onDrop={(e) => {
        if (!enableImages) return
        const imageFiles = imageFilesFromDataTransfer(e.dataTransfer)
        if (imageFiles.length === 0) return
        e.preventDefault()
        addFiles(imageFiles)
      }}
      onPaste={(e) => {
        if (!enableImages) return
        const imageFiles = imageFilesFromDataTransfer(e.clipboardData)
        if (imageFiles.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        addFiles(imageFiles)
      }}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_88px] items-end gap-3">
        {enableImages && (
          <>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              multiple
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              className="grid h-[58px] w-[58px] place-items-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-black text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={isBusy || attachments.length >= 5}
              onClick={() => fileInputRef.current?.click()}
              title="上传图片"
              aria-label="上传图片"
            >
              图片
            </button>
          </>
        )}

        <div className={enableImages ? 'min-w-0' : 'col-span-2 min-w-0'}>
          {attachments.length > 0 && (
            <div className="mb-2 flex max-w-full gap-2 overflow-x-auto pb-1">
              {attachments.map((item) => (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100" key={item.id}>
                  <img className="h-full w-full object-cover" src={item.preview_url} alt="待发送图片" />
                  <button
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-slate-950/80 text-xs font-black text-white"
                    type="button"
                    onClick={() => removeAttachment(item.id)}
                    aria-label="移除图片"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            className="max-h-56 min-h-[72px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
            value={value}
            disabled={isBusy}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            onPaste={(e) => {
              if (!enableImages) return
              const imageFiles = imageFilesFromDataTransfer(e.clipboardData)
              if (imageFiles.length === 0) return
              e.preventDefault()
              e.stopPropagation()
              addFiles(imageFiles)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
        </div>

        <button
          className="h-[58px] rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={submit}
          disabled={!canSend}
          type="button"
        >
          {isBusy ? pendingLabel : submitLabel}
        </button>
      </div>
    </footer>
  )
}

function imageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return []
  const files = Array.from(dataTransfer.files || []).filter(isSupportedImage)
  if (files.length > 0) return files

  return Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === 'file' && supportedImageTypes.has(item.type))
    .map((item) => item.getAsFile())
    .filter(isSupportedImage)
}

function isSupportedImage(file) {
  return file && supportedImageTypes.has(file.type)
}
