import { atom } from 'jotai'

// Messages in current conversation
// Each message: { id, turn_no, role, content, sequence_no, status, attachments, source_url, source_title, created_at, is_favorite, is_understood, is_review_later, user_note }
export const messagesAtom = atom([])

// Streaming state
export const streamingAtom = atom(false)
export const streamErrorAtom = atom(null)

// Pending images (local preview blobs before upload)
export const pendingImagesAtom = atom([])

// Uploaded file IDs (result of confirm)
export const uploadedFileIdsAtom = atom([])

// Derived: has unsent content
export const hasUnsentContentAtom = atom((get) => {
  const msgs = get(messagesAtom)
  const pending = get(pendingImagesAtom)
  // Check if there's a pending user message that hasn't been sent yet
  return pending.length > 0
})

// Derived: last N turns for context display
export const recentTurnsAtom = atom((get) => {
  const msgs = get(messagesAtom)
  if (msgs.length === 0) return 0
  return msgs[msgs.length - 1].turn_no || 0
})
