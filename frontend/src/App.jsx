import { useState } from 'react'
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
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
