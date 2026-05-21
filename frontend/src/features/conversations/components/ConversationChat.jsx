import { EmptyState } from '../../../components/common/EmptyState.jsx'
import { ConversationComposer } from './ConversationComposer.jsx'
import { ConversationMessage } from './ConversationMessage.jsx'

export function ConversationChat({ conversation, messages, input, streaming, error, loadingMessages, bottomRef, onInputChange, onSend, onMessageUpdated }) {
  return (
    <main className="flex min-h-0 min-w-0 flex-col bg-white">
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[25px] font-black tracking-tight">{conversation?.title || '新会话'}</h1>
          <p className="mt-1 text-sm text-slate-500">Web 端普通会话，支持基于历史上下文的流式讨论。</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">{messages.length} 条消息</span>
      </header>

      <section className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
          {loadingMessages && <div className="text-sm text-slate-500">正在加载历史消息...</div>}
          {!loadingMessages && messages.length === 0 && (
            <EmptyState title="暂无消息" description="发送第一条消息，开始一个新的讨论。" />
          )}
          {messages.map((message) => (
            <ConversationMessage key={message.id || message.tempId} message={message} streaming={streaming} onMessageUpdated={onMessageUpdated} />
          ))}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message || 'AI 回答出错，请稍后重试'}</div>
          )}
          <div ref={bottomRef} />
        </div>
      </section>

      <ConversationComposer value={input} disabled={streaming} onChange={onInputChange} onSend={onSend} />
    </main>
  )
}
