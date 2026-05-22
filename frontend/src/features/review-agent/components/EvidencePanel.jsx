import { useState } from 'react'
import { EmptyState } from '../../../components/common/EmptyState.jsx'
import { cardFilters } from '../constants.js'
import { EvidenceCard } from './EvidenceCard.jsx'
import { EvidenceDetailModal } from './EvidenceDetailModal.jsx'

export function EvidencePanel({ cards, filteredCards, activeFilter, updatingMessageIds, onChangeFilter, onResize, onToggleCardState }) {
  const [detailCard, setDetailCard] = useState(null)
  const latestDetailCard = detailCard
    ? cards.find((card) => card.assistant_message_id === detailCard.assistant_message_id) || detailCard
    : null

  function saveNote(card) {
    const note = window.prompt('添加备注', card.user_note || '')
    if (note === null) return
    onToggleCardState(card, 'user_note', note)
  }

  return (
    <aside className="relative flex min-h-0 min-w-0 flex-col bg-[#eef3f9]">
      <button
        aria-label="拖动调整问答记录侧栏宽度"
        className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1 cursor-col-resize border-l border-transparent hover:border-blue-300 hover:bg-blue-100/60"
        onPointerDown={(e) => {
          e.preventDefault()
          onResize()
        }}
        type="button"
      />
      <header className="flex h-[76px] shrink-0 justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-black">本次查询到的问答记录</h2>
          <p className="mt-1 line-clamp-1 text-sm text-slate-500">来自复盘助手调用工具后返回的 message 卡片。</p>
        </div>
        <span className="shrink-0 self-start rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black leading-5 text-blue-700">
          {cards.length} 条
        </span>
      </header>

      <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 px-5 py-3">
        {cardFilters.map((filter) => (
          <FilterButton key={filter.key} active={activeFilter === filter.key} onClick={() => onChangeFilter(filter.key)}>
            {filter.label}
          </FilterButton>
        ))}
      </div>

      <div className="app-scroll min-h-0 flex-1 space-y-3 overflow-y-auto py-4 pl-4 pr-7">
        {filteredCards.length === 0 ? (
          <EmptyState title="暂无查询卡片" description="向复盘助手提问“我今天有哪些待复习？”试试看。" />
        ) : (
          filteredCards.map((card) => (
            <EvidenceCard
              key={card.assistant_message_id}
              card={card}
              disabled={Boolean(updatingMessageIds[card.assistant_message_id])}
              onToggle={onToggleCardState}
              onOpenDetail={setDetailCard}
              onSaveNote={saveNote}
            />
          ))
        )}
      </div>
      <EvidenceDetailModal
        card={latestDetailCard}
        disabled={latestDetailCard ? Boolean(updatingMessageIds[latestDetailCard.assistant_message_id]) : false}
        onClose={() => setDetailCard(null)}
        onToggle={onToggleCardState}
        onSaveNote={saveNote}
      />
    </aside>
  )
}

function FilterButton({ active, children, onClick }) {
  return (
    <button className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${active ? 'border-blue-200 bg-blue-100 text-blue-700' : 'border-slate-200 bg-white text-slate-500'}`} onClick={onClick} type="button">
      {children}
    </button>
  )
}
