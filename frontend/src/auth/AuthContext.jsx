import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, login as loginAPI, logout as logoutAPI, register as registerAPI } from '../api/auth.js'
import { clearStoredAuth, getStoredAuth, setStoredAuth } from '../utils/request.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const stored = getStoredAuth()
  const [user, setUser] = useState(stored.user)
  const [booting, setBooting] = useState(Boolean(stored.accessToken))

  useEffect(() => {
    let cancelled = false
    if (!stored.accessToken) {
      setBooting(false)
      return undefined
    }
    getMe()
      .then((me) => {
        if (cancelled) return
        localStorage.setItem('user_info', JSON.stringify(me))
        setUser(me)
      })
      .catch(() => {
        if (cancelled) return
        clearStoredAuth()
        setUser(null)
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => ({
    user,
    booting,
    async login(email, password) {
      const data = await loginAPI(email, password)
      setStoredAuth(data)
      setUser(data.user || await getMe())
    },
    async register(email, password, nickname) {
      const data = await registerAPI(email, password, nickname)
      setStoredAuth(data)
      setUser(data.user || await getMe())
    },
    async logout() {
      const { refreshToken } = getStoredAuth()
      if (refreshToken) {
        await logoutAPI(refreshToken).catch(() => {})
      }
      clearStoredAuth()
      setUser(null)
    },
  }), [user, booting])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
