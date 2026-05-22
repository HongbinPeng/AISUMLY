import { useEffect, useState } from 'react'
import { updateMessageState } from '../../api/messages.js'
import { StatusButton } from './StatusButton.jsx'

export function MessageStatusEditor({ message, compact = false, onUpdated }) {
  const [draft, setDraft] = useState(toDraft(message))
  const [saving, setSaving] = useState(false)
  const [editingNote, setEditingNote] = useState(false)

  useEffect(() => {
    setDraft(toDraft(message))
    setEditingNote(false)
  }, [message?.id])

  if (!message?.id || message.role !== 'assistant') return null

  async function patch(updates) {
    const nextDraft = { ...draft, ...updates }
    setDraft(nextDraft)
    setSaving(true)
    try {
      const updated = await updateMessageState(message.id, updates)
      setDraft(toDraft(updated))
      onUpdated?.(message.id, updated)
    } catch (err) {
      setDraft(toDraft(message))
      alert(err.message || '更新消息状态失败')
    } finally {
      setSaving(false)
    }
  }

  async function saveNote() {
    await patch({ user_note: draft.user_note || '' })
    setEditingNote(false)
  }

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${compact ? 'text-xs' : ''}`}>
      <StatusButton
        active={draft.is_favorite}
        disabled={saving}
        activeClass="border-yellow-200 bg-yellow-100 text-yellow-800"
        inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-yellow-200 hover:bg-yellow-50"
        onClick={() => patch({ is_favorite: !draft.is_favorite })}
      >
        {draft.is_favorite ? '已收藏' : '收藏'}
      </StatusButton>
      <StatusButton
        active={draft.is_understood}
        disabled={saving}
        activeClass="border-emerald-200 bg-emerald-100 text-emerald-700"
        inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50"
        onClick={() => patch({ is_understood: !draft.is_understood })}
      >
        {draft.is_understood ? '已理解' : '标记已理解'}
      </StatusButton>
      <StatusButton
        active={draft.is_review_later}
        disabled={saving}
        activeClass="border-amber-200 bg-amber-100 text-amber-800"
        inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50"
        onClick={() => patch({ is_review_later: !draft.is_review_later })}
      >
        {draft.is_review_later ? '待复习' : '加入复习'}
      </StatusButton>
      <StatusButton
        active={Boolean(draft.user_note)}
        disabled={saving}
        activeClass="border-indigo-200 bg-indigo-50 text-indigo-700"
        inactiveClass="border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50"
        onClick={() => setEditingNote((value) => !value)}
      >
        备注
      </StatusButton>
      {draft.user_note && !editingNote && (
        <span className="max-w-[220px] truncate text-xs text-slate-500" title={draft.user_note}>{draft.user_note}</span>
      )}
      {editingNote && (
        <div className="mt-2 grid w-full grid-cols-[1fr_56px] gap-2">
          <textarea
            className="min-h-[54px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            value={draft.user_note}
            onChange={(e) => setDraft((prev) => ({ ...prev, user_note: e.target.value }))}
            placeholder="添加备注..."
          />
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white disabled:opacity-60" onClick={saveNote} disabled={saving} type="button">
            完成
          </button>
        </div>
      )}
    </div>
  )
}

function toDraft(message) {
  return {
    is_favorite: Boolean(message?.is_favorite),
    is_understood: Boolean(message?.is_understood),
    is_review_later: Boolean(message?.is_review_later),
    user_note: message?.user_note || '',
  }
}
