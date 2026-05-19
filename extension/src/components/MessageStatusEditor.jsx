import { useState, useEffect } from 'react'
import { updateMessage } from '../api/index.js'

export default function MessageStatusEditor({ message, onUpdated }) {
  const [isFavorite, setIsFavorite] = useState(message?.is_favorite === 1)
  const [isUnderstood, setIsUnderstood] = useState(message?.is_understood === 1)
  const [isReviewLater, setIsReviewLater] = useState(message?.is_review_later === 1)
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const [noteText, setNoteText] = useState(message?.user_note || '')
  const [saving, setSaving] = useState(false)

  // Sync when message changes (e.g. after API response)
  useEffect(() => {
    if (!message) return
    setIsFavorite(message.is_favorite === 1)
    setIsUnderstood(message.is_understood === 1)
    setIsReviewLater(message.is_review_later === 1)
    setNoteText(message.user_note || '')
    setShowNoteEditor(false)
  }, [message])

  async function sendUpdate(updates) {
    if (!message?.id) return
    setSaving(true)
    try {
      await updateMessage(message.id, {
        is_favorite: isFavorite,
        is_understood: isUnderstood,
        is_review_later: isReviewLater,
        user_note: noteText || null,
        ...updates,
      })
      // Force re-sync from message prop (parent should refetch)
      onUpdated?.()
    } catch (err) {
      console.error('更新消息状态失败:', err)
    } finally {
      setSaving(false)
    }
  }

  async function toggleFavorite() {
    const next = !isFavorite
    setIsFavorite(next)
    await sendUpdate({ is_favorite: next })
  }

  async function toggleUnderstood() {
    const next = !isUnderstood
    setIsUnderstood(next)
    await sendUpdate({ is_understood: next })
  }

  async function toggleReviewLater() {
    const next = !isReviewLater
    setIsReviewLater(next)
    await sendUpdate({ is_review_later: next })
  }

  async function saveNote() {
    await sendUpdate({ user_note: noteText || null })
    setShowNoteEditor(false)
  }

  function handleNoteButtonClick() {
    if (showNoteEditor) {
      // Currently editing → save
      if (noteText.trim()) {
        saveNote()
      } else {
        setShowNoteEditor(false)
      }
    } else {
      // Not editing → open editor
      setShowNoteEditor(true)
    }
  }

  if (!message || message.role !== 'assistant') return null

  return (
    <div className="message-status-bar">
      <button
        className={`status-btn ${isFavorite ? 'active' : ''}`}
        onClick={toggleFavorite}
        disabled={saving}
        title="收藏"
      >
        {isFavorite ? '★' : '☆'} 收藏
      </button>
      <button
        className={`status-btn ${isUnderstood ? 'active' : ''}`}
        onClick={toggleUnderstood}
        disabled={saving}
        title="已理解"
      >
        {isUnderstood ? '✓' : '○'} 已理解
      </button>
      <button
        className={`status-btn ${isReviewLater ? 'active' : ''}`}
        onClick={toggleReviewLater}
        disabled={saving}
        title="待复习"
      >
        {isReviewLater ? '★' : '☆'} 待复习
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          className="status-btn note-btn"
          onClick={handleNoteButtonClick}
          disabled={saving}
          title="备注"
        >
          {showNoteEditor ? '完成' : '备注'}
        </button>
        {/* Show saved note as small text */}
        {message.user_note && !showNoteEditor && (
          <span className="note-preview" title={message.user_note}>
            {truncate(message.user_note, 20)}
          </span>
        )}
      </div>

      {showNoteEditor && (
        <div className="note-editor">
          <textarea
            placeholder="添加备注..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                saveNote()
              }
            }}
          />
          <button className="btn-complete" onClick={saveNote} disabled={saving}>
            完成
          </button>
        </div>
      )}
    </div>
  )
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}
