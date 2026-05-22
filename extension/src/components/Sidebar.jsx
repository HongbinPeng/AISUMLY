import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { conversationsAtom, activeConversationIdAtom, isTempConversationAtom } from '../store/conversation'
import {
  activeConversationStreamingAtom,
  messagesAtom,
  pendingImagesAtom,
  updateConversationMessagesAtom,
  updateConversationPendingImagesAtom,
  uploadedFileIdsAtom,
} from '../store/chat'
import { listConversations, getConversationMessages, logout as logoutAPI } from '../api/index.js'
import { doLogout } from '../store/auth.js'
import { formatRelativeDate } from '../utils/time'

export default function Sidebar({ setAccessToken, setRefreshToken, setUser }) {
  const [conversations, setConversations] = useAtom(conversationsAtom)
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom)
  const isTemp = useAtomValue(isTempConversationAtom)
  const setMessages = useSetAtom(messagesAtom)
  const setPendingImages = useSetAtom(pendingImagesAtom)
  const updateConversationMessages = useSetAtom(updateConversationMessagesAtom)
  const updateConversationPendingImages = useSetAtom(updateConversationPendingImagesAtom)
  const setUploadedFileIds = useSetAtom(uploadedFileIdsAtom)
  const activeIsStreaming = useAtomValue(activeConversationStreamingAtom)
  const [pageInfo, setPageInfo] = useStatePageInfo()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')

  useEffect(() => {
    listConversations()
      .then((data) => setConversations(data.items || []))
      .catch(() => {})
  }, [setConversations])

  useEffect(() => {
    chrome.tabs?.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs?.[0]
      if (tab) setPageInfo({ url: tab.url, title: tab.title })
    })
  }, [setPageInfo])

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  async function selectConversation(id) {
    if (id === activeId) return

    setActiveId(id)
    setUploadedFileIds([])

    if (typeof id === 'string' && id.startsWith('temp_')) return

    try {
      const data = await getConversationMessages(id, 50, 0)
      updateConversationMessages({ conversationId: id, updater: data.messages || [] })
    } catch (err) {
      console.error('加载消息失败:', err)
    }
  }

  function createTempConversation() {
    const tempId = `temp_${Date.now()}`
    updateConversationMessages({ conversationId: tempId, updater: [] })
    updateConversationPendingImages({ conversationId: tempId, updater: [] })
    setActiveId(tempId)
    setUploadedFileIds([])
  }

  function clearContext() {
    if (activeIsStreaming) return
    setMessages([])
    setPendingImages([])
    setUploadedFileIds([])
  }

  async function handleLogout() {
    try {
      const data = await chrome.storage.local.get(['refresh_token'])
      if (data.refresh_token) await logoutAPI(data.refresh_token)
    } catch {
      // Ignore logout API failure and clear local auth state.
    }

    await doLogout()
    setAccessToken('')
    setRefreshToken('')
    setUser(null)
  }

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button className="btn-toggle-sidebar" onClick={toggleCollapse} title={collapsed ? '展开侧边栏' : '收起侧边栏'} type="button">
          <svg viewBox="0 0 1024 1024" width="20" height="20">
            <path d="M62 505.97c0-0.64 0.64-1.91 0.64-2.54 3.18-16.51 11.43-29.22 26.04-37.47 6.35-3.81 13.34-5.08 20.32-5.72H906.74c17.78 0 31.12 7.62 41.28 21.59 7.62 10.8 10.8 22.23 9.53 35.57-2.54 20.32-16.51 38.11-37.47 43.19-5.72 1.27-11.43 1.91-17.78 1.91H113.45c-20.96 0-34.93-10.16-45.09-27.31-3.18-5.08-4.45-10.8-5.72-16.51-0-0.64-0.64-1.91-0.64-2.54v-10.16zM62 242.38c0-0.64 0.64-1.91 0.64-2.54 3.18-16.51 11.43-29.22 26.04-37.47 6.35-3.81 13.34-5.08 20.32-5.72H906.74c17.78 0 31.12 7.62 41.28 21.59 7.62 10.8 10.8 22.23 9.53 35.57-2.54 20.32-16.51 38.11-37.47 43.19-5.72 1.27-11.43 1.91-17.78 1.91H113.45c-20.96 0-34.93-10.16-45.09-27.31-3.18-5.08-4.45-10.8-5.72-16.51-0-1.27-0.64-2.54-0.64-3.18v-9.53zM107.09 820.36c-1.27 0-1.91-0.64-3.18-0.64-14.61-3.18-24.77-11.43-32.39-24.14-5.72-9.53-8.26-19.69-7.62-30.49 1.91-21.59 17.15-40.65 39.38-45.73 4.45-1.27 9.53-1.27 14.61-1.27h790.75c17.15 0 30.49 7.62 40.65 20.96 6.35 8.89 10.16 19.69 10.16 30.49 0 12.7-4.45 24.13-12.7 33.66-8.26 9.53-19.05 15.24-31.76 16.51-0.64 0-1.27 0-1.91 0.64H107.09z" fill="currentColor" />
          </svg>
        </button>

        {!collapsed && (
          <>
            {pageInfo?.title && (
              <div className="page-source">
                <div className="page-title">{truncate(pageInfo.title, 24)}</div>
                <div>{truncate(pageInfo.url, 40)}</div>
              </div>
            )}
            <div className="sidebar-actions">
              <button className="btn-new-chat" onClick={createTempConversation} type="button">
                + 新会话
              </button>
              <button className="btn-clear-context" onClick={clearContext} title="清空当前上下文" type="button">
                清空
              </button>
            </div>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="conversation-list">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${conv.id === activeId && !isTemp ? 'active' : ''}`}
              onClick={() => selectConversation(conv.id)}
            >
              <div className="conv-icon">{conv.id === activeId && !isTemp ? '●' : '○'}</div>
              <div className="conv-info">
                <div className="conv-title" title={conv.title}>
                  {conv.title || '新会话'}
                </div>
                <div className="conv-meta">
                  <span>{conv.message_count || 0} 条</span>
                  <span>{formatRelativeDate(conv.last_active_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="sidebar-footer">
          <button className="btn-logout" onClick={handleLogout} type="button">
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? `${str.slice(0, max)}...` : str
}

function useStatePageInfo() {
  const [info, setInfo] = useState(() => {
    return JSON.parse(localStorage.getItem('page_info') || 'null')
  })

  function setPageInfo(newInfo) {
    setInfo(newInfo)
    localStorage.setItem('page_info', JSON.stringify(newInfo))
  }

  return [info, setPageInfo]
}
