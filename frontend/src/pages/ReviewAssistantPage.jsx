import { ChatComposer } from '../features/review-agent/components/ChatComposer.jsx'
import { ChatMessageList } from '../features/review-agent/components/ChatMessageList.jsx'
import { EvidencePanel } from '../features/review-agent/components/EvidencePanel.jsx'
import { QuickPromptGrid } from '../features/review-agent/components/QuickPromptGrid.jsx'
import { useReviewAgent } from '../features/review-agent/hooks/useReviewAgent.js'

export function ReviewAssistantPage({ initialPrompt, onResizeEvidence }) {
  const review = useReviewAgent(initialPrompt)

  return (
    <>
      <main className="flex min-h-0 min-w-0 flex-col border-r border-slate-200 bg-white">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 px-6">
          <div>
            <h1 className="text-[25px] font-black tracking-tight">学习复盘助手</h1>
            <p className="mt-1 text-sm text-slate-500">用自然语言查询你的学习记录，并基于收藏、已理解、待复习状态生成复盘回答。</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </header>

        <QuickPromptGrid disabled={review.loading} onSend={review.send} />
        <ChatMessageList messages={review.messages} loading={review.loadingHistory} bottomRef={review.bottomRef} />
        <ChatComposer value={review.input} loading={review.loading} onChange={review.setInput} onSend={review.send} />
      </main>

      <EvidencePanel
        cards={review.cards}
        filteredCards={review.filteredCards}
        activeFilter={review.activeFilter}
        updatingMessageIds={review.updatingMessageIds}
        onChangeFilter={review.setActiveFilter}
        onResize={onResizeEvidence}
        onToggleCardState={review.toggleCardState}
      />
    </>
  )
}
