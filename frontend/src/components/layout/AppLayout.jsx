import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Sidebar } from './Sidebar.jsx'

export function AppLayout({ activeNav, onChangeNav, children }) {
  const { user, logout } = useAuth()
  const [evidenceWidth, setEvidenceWidth] = useState(520)
  const [resizingEvidence, setResizingEvidence] = useState(false)

  useEffect(() => {
    if (!resizingEvidence) return undefined
    const minWidth = 430
    const maxWidth = Math.max(minWidth, Math.min(760, window.innerWidth - 216 - 640))

    function resize(e) {
      const nextWidth = window.innerWidth - e.clientX
      setEvidenceWidth(Math.max(minWidth, Math.min(maxWidth, nextWidth)))
    }

    function stopResize() {
      setResizingEvidence(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stopResize)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stopResize)
    }
  }, [resizingEvidence])

  return (
    <div className="grid h-screen overflow-hidden bg-[#eef3f9]" style={{ gridTemplateColumns: `216px minmax(0, 1fr) ${evidenceWidth}px` }}>
      <Sidebar user={user} activeNav={activeNav} onChangeNav={onChangeNav} onLogout={logout} />
      {children({ onResizeEvidence: () => setResizingEvidence(true) })}
    </div>
  )
}
