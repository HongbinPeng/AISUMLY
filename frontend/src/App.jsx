import { Component, useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { AppLayout } from './components/layout/AppLayout.jsx'
import { ConversationsPage } from './pages/ConversationsPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { PlaceholderPage } from './pages/PlaceholderPage.jsx'
import { ReviewAssistantPage } from './pages/ReviewAssistantPage.jsx'

function AppShell() {
  const { user, booting } = useAuth()
  const [activeNav, setActiveNav] = useState('home')
  const [reviewDraft, setReviewDraft] = useState('')

  if (booting) {
    return <div className="grid h-screen place-items-center text-slate-500">正在恢复登录状态...</div>
  }
  if (!user) return <LoginPage />

  return (
    <AppLayout activeNav={activeNav} onChangeNav={setActiveNav}>
      {({ onResizeEvidence }) => (
        activeNav === 'home'
          ? <HomePage onConsultReview={(prompt) => {
              setReviewDraft(prompt)
              setActiveNav('review')
            }} />
          : activeNav === 'review'
            ? <ReviewAssistantPage initialPrompt={reviewDraft} onResizeEvidence={onResizeEvidence} />
            : activeNav === 'conversations'
              ? <ConversationsPage />
              : <PlaceholderPage />
      )}
    </AppLayout>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  )
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-8 text-slate-900">
        <section className="w-full max-w-[520px] rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-black text-slate-950">页面暂时无法显示</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">页面加载时遇到了一点问题，可以先重新加载试试。</p>
          <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-black text-white" type="button" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </section>
      </main>
    )
  }
}
