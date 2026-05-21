const navItems = [
  { key: 'home', label: '首页' },
  { key: 'conversations', label: '会话' },
  { key: 'review', label: '学习复盘助手' },
]

export function Sidebar({ user, activeNav, onChangeNav, onLogout }) {
  return (
    <aside className="flex min-h-0 flex-col bg-[#050b1a] px-3 py-5 text-slate-100">
      <div className="mb-8 flex items-center gap-3 px-1.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-yellow-400 text-sm font-black text-slate-950">S</div>
        <span className="text-sm font-black tracking-wide">AISUMLY</span>
      </div>
      <nav className="grid gap-1">
        {navItems.map((item) => {
          const selected = activeNav === item.key
          return (
            <button
              key={item.key}
              className={`rounded-lg px-3 py-2.5 text-left text-sm font-black ${selected ? 'bg-slate-800 text-white' : 'text-blue-100 hover:bg-slate-900'}`}
              onClick={() => onChangeNav(item.key)}
              type="button"
            >
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="mt-auto grid gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs">
        <strong>{user?.nickname || user?.email || '已登录用户'}</strong>
        <span className="leading-5 text-blue-100">根据收藏、已理解和待复习状态整理学习记录。</span>
        <button className="rounded-md border border-white/10 px-3 py-2 font-bold text-blue-100 hover:bg-white/5" onClick={onLogout} type="button">
          退出登录
        </button>
      </div>
    </aside>
  )
}
