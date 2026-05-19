import { useEffect } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { isLoggedInAtom, userAtom, accessTokenAtom, refreshTokenAtom, useAuthInit } from './store/auth.js'
import { activeConversationAtom } from './store/conversation.js'
import Sidebar from './components/Sidebar.jsx'
import ChatArea from './components/ChatArea.jsx'
import LoginScreen from './components/LoginScreen.jsx'

export default function App() {
  const isLoggedIn = useAtomValue(isLoggedInAtom)
  const conversation = useAtomValue(activeConversationAtom)
  const setAccessToken = useSetAtom(accessTokenAtom)
  const setRefreshToken = useSetAtom(refreshTokenAtom)
  const setUser = useSetAtom(userAtom)

  // Init auth state on mount
  const initAuth = useAuthInit()
  useEffect(() => {
    initAuth()
  }, [])

  // Listen for login/logout events
  useEffect(() => {
    function onLogin(e) {
      const { access_token, refresh_token, user } = e.detail
      setAccessToken(access_token)
      setRefreshToken(refresh_token)
      setUser(user)
    }
    function onLogout() {
      setAccessToken('')
      setRefreshToken('')
      setUser(null)
    }
    window.addEventListener('auth:login', onLogin)
    window.addEventListener('auth:logout', onLogout)
    return () => {
      window.removeEventListener('auth:login', onLogin)
      window.removeEventListener('auth:logout', onLogout)
    }
  }, [])

  if (!isLoggedIn) {
    return <LoginScreen />
  }

  return (
    <div className="app-layout">
      <Sidebar setAccessToken={setAccessToken} setRefreshToken={setRefreshToken} setUser={setUser} />
      <ChatArea conversation={conversation} />
    </div>
  )
}
