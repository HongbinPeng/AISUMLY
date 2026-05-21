import { ChatMessage } from './ChatMessage.jsx'

export function ChatMessageList({ messages, loading, bottomRef }) {
  return (
    <section className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
        {loading && <div className="text-sm text-slate-500">正在加载复盘助手历史...</div>}
        {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}
