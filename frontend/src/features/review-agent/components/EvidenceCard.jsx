import { StatusButton } from '../../../components/common/StatusButton.jsx'

export function EvidenceCard({ card, disabled, onToggle, onOpenDetail, onSaveNote }) {
  return (
    <article className="grid cursor-pointer grid-cols-[132px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60 transition hover:border-blue-200 hover:shadow-md" onClick={() => onOpenDetail(card)}>
      <div className="relative grid h-[96px] place-items-center overflow-hidden rounded-lg bg-slate-300 text-xs font-black text-slate-700">
        {card.has_file && card.first_file_preview_url ? (
          <>
            <img className="h-full w-full object-cover" src={card.first_file_preview_url} alt="截图缩略图" />
            <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/80 px-2 py-1 text-[11px] font-black text-white">file_id: {card.first_file_id}</span>
          </>
        ) : (
          <span>无截图记录</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex justify-between gap-3 text-xs text-slate-400">
          <span className="max-w-[230px] truncate">{card.conversation_title || '未命名会话'}</span>
          <time className="shrink-0">{formatTime(card.created_at)}</time>
        </div>
        <h3 className="line-clamp-2 text-[15px] font-black leading-5">{card.question || '无用户问题文本'}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-600">{card.answer_preview || '暂无回答摘要'}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <StatusButton
            active={card.is_favorite}
            disabled={disabled}
            activeClass="border-yellow-200 bg-yellow-100 text-yellow-800"
            inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-yellow-200 hover:bg-yellow-50"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(card, 'is_favorite')
            }}
          >
            {card.is_favorite ? '已收藏' : '收藏'}
          </StatusButton>
          <StatusButton
            active={card.is_review_later}
            disabled={disabled}
            activeClass="border-amber-200 bg-amber-100 text-amber-800"
            inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(card, 'is_review_later')
            }}
          >
            {card.is_review_later ? '待复习' : '加入复习'}
          </StatusButton>
          <StatusButton
            active={card.is_understood}
            disabled={disabled}
            activeClass="border-emerald-200 bg-emerald-100 text-emerald-700"
            inactiveClass="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(card, 'is_understood')
            }}
          >
            {card.is_understood ? '已理解' : '未理解'}
          </StatusButton>
          <button
            className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            onClick={(e) => {
              e.stopPropagation()
              onSaveNote(card)
            }}
            type="button"
          >
            备注
          </button>
          <button className="ml-auto rounded-md px-1.5 py-1 text-xs font-black text-blue-600 hover:bg-blue-50" onClick={(e) => {
            e.stopPropagation()
            alert(`后续接入会话详情：${card.conversation_id}`)
          }} type="button">
            打开会话
          </button>
        </div>
      </div>
    </article>
  )
}

function formatTime(value) {
  if (!value) return ''
  const d = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
