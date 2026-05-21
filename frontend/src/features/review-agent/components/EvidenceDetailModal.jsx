import MarkdownIt from 'markdown-it'
import { StatusButton } from '../../../components/common/StatusButton.jsx'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function EvidenceDetailModal({ card, disabled, onClose, onToggle, onSaveNote }) {
  if (!card) return null
  const answer = card.answer_content || card.answer || card.answer_preview || '暂无回答内容'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-6" onMouseDown={onClose}>
      <section className="max-h-[82vh] w-full max-w-[920px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/20" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-400">{card.conversation_title || '未命名会话'} · 第 {card.turn_no || '-'} 轮</div>
            <h3 className="mt-1 text-xl font-black leading-7 text-slate-950">{card.question || '无用户问题文本'}</h3>
          </div>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            关闭
          </button>
        </header>

        <div className="app-scroll max-h-[calc(82vh-150px)] overflow-y-auto px-5 py-4">
          {card.has_file && card.first_file_preview_url && (
            <img className="mb-4 max-h-72 rounded-lg border border-slate-200 object-contain" src={card.first_file_preview_url} alt="关联截图" />
          )}

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="mb-2 text-sm font-black text-slate-700">用户问题</h4>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{card.question || '无用户问题文本'}</p>
          </section>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-sm font-black text-slate-700">AI 回答</h4>
              {!card.answer_content && !card.answer && <span className="text-xs text-amber-600">当前为摘要，完整回答需要后端返回 answer_content</span>}
            </div>
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: md.render(answer) }} />
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3">
          <StatusButton
            active={card.is_favorite}
            disabled={disabled}
            activeClass="border-yellow-200 bg-yellow-100 text-yellow-800"
            inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-yellow-200 hover:bg-yellow-50"
            onClick={() => onToggle(card, 'is_favorite')}
          >
            {card.is_favorite ? '★ 已收藏' : '☆ 收藏'}
          </StatusButton>
          <StatusButton
            active={card.is_understood}
            disabled={disabled}
            activeClass="border-emerald-200 bg-emerald-100 text-emerald-700"
            inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50"
            onClick={() => onToggle(card, 'is_understood')}
          >
            {card.is_understood ? '✓ 已理解' : '○ 已理解'}
          </StatusButton>
          <StatusButton
            active={card.is_review_later}
            disabled={disabled}
            activeClass="border-amber-200 bg-amber-100 text-amber-800"
            inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50"
            onClick={() => onToggle(card, 'is_review_later')}
          >
            {card.is_review_later ? '★ 待复习' : '☆ 待复习'}
          </StatusButton>
          <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700" onClick={() => onSaveNote(card)} type="button">
            备注
          </button>
          {card.user_note && <span className="max-w-[360px] truncate text-xs text-slate-500" title={card.user_note}>{card.user_note}</span>}
        </footer>
      </section>
    </div>
  )
}
