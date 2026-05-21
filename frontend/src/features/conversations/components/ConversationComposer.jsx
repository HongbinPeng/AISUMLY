import { ChatInput } from '../../../components/common/ChatInput.jsx'

export function ConversationComposer({ value, disabled, onChange, onSend }) {
  return (
    <ChatInput
      value={value}
      disabled={disabled}
      enableImages
      placeholder="继续追问，Shift+Enter 换行，可粘贴截图..."
      onChange={onChange}
      onSend={onSend}
    />
  )
}
