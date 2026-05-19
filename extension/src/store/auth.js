import { atom, useSetAtom } from 'jotai'

// Simple atoms (no persistence middleware — we manage chrome.storage manually)
export const accessTokenAtom = atom('')
export const refreshTokenAtom = atom('')
export const userAtom = atom(null)

// Derived: is logged in
export const isLoggedInAtom = atom((get) => {
  return !!get(accessTokenAtom)
})

// Load auth state from chrome.storage on init
async function loadAuthState() {
  try {
    const data = await chrome.storage.local.get(['access_token', 'refresh_token', 'user_info'])
    return {
      accessToken: data.access_token || '',
      refreshToken: data.refresh_token || '',
      user: data.user_info || null,
    }
  } catch {
    return { accessToken: '', refreshToken: '', user: null }
  }
}

export function useAuthInit() {
  const setAccessToken = useSetAtom(accessTokenAtom)
  const setRefreshToken = useSetAtom(refreshTokenAtom)
  const setUser = useSetAtom(userAtom)

  return async function init() {
    const state = await loadAuthState()
    setAccessToken(state.accessToken)
    setRefreshToken(state.refreshToken)
    setUser(state.user)
  }
}

// Actions
export async function doLogin(email, password) {
  const { login } = await import('../api/index.js')
  const result = await login(email, password)
  const { access_token, refresh_token, user } = result
  await chrome.storage.local.set({
    access_token,
    refresh_token,
    user_info: user,
  })
  // Dispatch event so App.jsx can react
  window.dispatchEvent(new CustomEvent('auth:login', {
    detail: { access_token, refresh_token, user },
  }))
  return { access_token, refresh_token, user }
}

export async function doRegister(email, password, nickname) {
  const { register } = await import('../api/index.js')
  const result = await register(email, password, nickname || '')
  const { access_token, refresh_token, user } = result
  await chrome.storage.local.set({
    access_token,
    refresh_token,
    user_info: user,
  })
  window.dispatchEvent(new CustomEvent('auth:login', {
    detail: { access_token, refresh_token, user },
  }))
  return { access_token, refresh_token, user }
}

export async function doLogout() {
  await chrome.storage.local.remove(['access_token', 'refresh_token', 'user_info'])
  window.dispatchEvent(new CustomEvent('auth:logout'))
}
