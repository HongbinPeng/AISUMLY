export function ConversationList({ conversations, activeConversationId, loading, onNewConversation, onSelectConversation }) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50">
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div>
          <h2 className="text-lg font-black">会话</h2>
          <p className="mt-1 text-xs text-slate-500">普通 AI 对话记录</p>
        </div>
        <button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm shadow-blue-100" onClick={onNewConversation} type="button">
          新建
        </button>
      </header>

      <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {loading && <div className="px-3 py-4 text-sm text-slate-500">正在加载会话...</div>}
        {!loading && conversations.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">还没有会话，点击右上角新建。</div>
        )}
        <div className="grid gap-2">
          {conversations.map((conversation) => {
            const active = String(conversation.id) === String(activeConversationId)
            return (
              <button
                key={conversation.id}
                className={`min-w-0 rounded-lg border px-3 py-3 text-left transition ${active ? 'border-blue-200 bg-blue-50 shadow-sm shadow-blue-100' : 'border-transparent bg-white hover:border-slate-200'}`}
                onClick={() => onSelectConversation(conversation.id)}
                type="button"
              >
                <div className="truncate text-sm font-black text-slate-900">{conversation.title || '新会话'}</div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{conversation.message_count || 0} 条</span>
                  <span className="truncate">{formatTime(conversation.last_active_at)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
