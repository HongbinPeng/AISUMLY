import { ConversationChat } from '../features/conversations/components/ConversationChat.jsx'
import { ConversationList } from '../features/conversations/components/ConversationList.jsx'
import { useConversations } from '../features/conversations/hooks/useConversations.js'

export function ConversationsPage() {
  const chat = useConversations()

  return (
    <main className="col-span-2 grid min-h-0 min-w-0 grid-cols-[300px_minmax(0,1fr)] bg-white">
      <ConversationList
        conversations={chat.conversations}
        activeConversationId={chat.activeConversationId}
        loading={chat.loadingConversations}
        onNewConversation={chat.createTempConversation}
        onSelectConversation={chat.selectConversation}
      />
      <ConversationChat
        conversation={chat.activeConversation}
        messages={chat.activeMessages}
        input={chat.activeInput}
        streaming={chat.activeStreaming}
        error={chat.activeError}
        loadingMessages={chat.loadingMessages}
        loadingMoreMessages={chat.activeLoadingMore}
        hasMoreMessages={chat.activeHasMore}
        bottomRef={chat.bottomRef}
        onInputChange={chat.setActiveInput}
        onSend={chat.send}
        onLoadMoreMessages={chat.loadMoreMessages}
        onMessageUpdated={chat.updateLocalMessage}
      />
    </main>
  )
}
