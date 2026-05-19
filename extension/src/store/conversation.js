import { atom } from 'jotai'

// List of conversations
export const conversationsAtom = atom([])

// Currently selected conversation ID (null = none)
export const activeConversationIdAtom = atom(null)

// Current conversation detail
export const activeConversationAtom = atom((get) => {
  const convs = get(conversationsAtom)
  const id = get(activeConversationIdAtom)
  if (!id) return null
  return convs.find(c => c.id === id) || null
})

// Derived: is active conversation a temporary one
export const isTempConversationAtom = atom((get) => {
  const id = get(activeConversationIdAtom)
  return typeof id === 'string' && id.startsWith('temp_')
})
