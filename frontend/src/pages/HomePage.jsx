import { useEffect, useState } from 'react'
import { getTodayDashboard } from '../api/dashboard.js'

const emptyDashboard = {
  date: '',
  question_count: 0,
  screenshot_count: 0,
  multi_image_question_count: 0,
  conversation_count: 0,
  active_conversation_count: 0,
  understood_count: 0,
  understood_rate: 0,
  review_later_count: 0,
  recent_conversations: [],
  unresolved_questions: [],
  top_topics: [],
  review_assistant: {
    badge: '可咨询',
    title: '咨询学习复盘小助手',
    description: '把今天的问题、截图和待复习状态交给复盘助手，让它帮你整理薄弱点、生成复习顺序和下一步建议。',
    prompt: '帮我复盘今天的学习记录，整理待复习问题、未理解内容和优先复习顺序。',
  },
}

export function HomePage({ onConsultReview }) {
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getTodayDashboard()
      .then((data) => {
        if (alive) setDashboard(normalizeDashboard(data))
      })
      .catch(() => {
        if (alive) setDashboard(emptyDashboard)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const date = dashboard.date
    ? new Date(dashboard.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  return (
    <main className="col-span-2 min-h-0 w-full overflow-y-auto bg-[#f4f7fb] px-6 py-6">
      <div className="grid w-full gap-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[25px] font-black tracking-tight">今天的学习记录</h1>
            <p className="mt-1 text-sm text-slate-500">
              {date || '今天'} · {loading ? '正在加载...' : `已沉淀 ${dashboard.conversation_count} 个会话`}
            </p>
          </div>
          <input
            className="h-10 w-[260px] rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            placeholder="搜索问题、回答、来源页面"
            disabled
          />
        </header>

        <section className="grid grid-cols-4 gap-4">
          <MetricCard title="今日提问" value={dashboard.question_count} hint={dashboard.review_later_count ? `待复习 ${dashboard.review_later_count} 条` : '继续记录问题'} />
          <MetricCard title="截图数量" value={dashboard.screenshot_count} hint={dashboard.multi_image_question_count ? `多图问题 ${dashboard.multi_image_question_count} 次` : '支持截图复盘'} />
          <MetricCard title="会话" value={dashboard.conversation_count} hint={`${dashboard.active_conversation_count} 个仍在追问`} />
          <MetricCard title="已理解" value={dashboard.understood_count} hint={`完成率 ${Math.round((dashboard.understood_rate || 0) * 100)}%`} />
        </section>

        <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] gap-4">
          <Panel title="最近会话" action="查看全部">
            <div className="grid gap-3">
              {dashboard.recent_conversations.length === 0 && <EmptyLine text="今天还没有会话记录" />}
              {dashboard.recent_conversations.map((item) => (
                <div className="flex items-center gap-3" key={item.id}>
                  <div className="h-10 w-14 rounded-lg bg-slate-800" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{item.title || '新会话'}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{item.message_count} 条消息 · {item.last_message_preview || '暂无摘要'}</div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{item.status_label || '继续'}</span>
                </div>
              ))}
            </div>
          </Panel>

          <section className="rounded-lg bg-slate-900 p-5 text-white shadow-sm">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">{dashboard.review_assistant.badge}</span>
            <h2 className="mt-3 text-2xl font-black">{dashboard.review_assistant.title}</h2>
            <p className="mt-3 text-sm leading-6 text-blue-100">{dashboard.review_assistant.description}</p>
            <button
              className="mt-8 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-blue-950/30"
              type="button"
              onClick={() => onConsultReview(dashboard.review_assistant.prompt)}
            >
              咨询助手
            </button>
          </section>
        </section>

        <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] gap-4">
          <Panel title="未解决问题池" action="整理">
            <div className="grid gap-3">
              {dashboard.unresolved_questions.length === 0 && <EmptyLine text="今天暂时没有未解决问题" />}
              {dashboard.unresolved_questions.map((item) => (
                <div key={item.assistant_message_id}>
                  <div className="line-clamp-1 text-sm font-black">{item.question || '未记录原始问题'}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    来自 {item.conversation_title || '未命名会话'} · {item.is_review_later ? '标记待复习' : '未标记已理解'}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="高频主题" action="本周">
            <div className="flex flex-wrap gap-2">
              {dashboard.top_topics.length === 0 && <EmptyLine text="主题会随学习记录自动出现" />}
              {dashboard.top_topics.map((topic) => (
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700" key={topic.name}>{topic.name}</span>
              ))}
            </div>
            {dashboard.top_topics.length > 0 && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[68%] rounded-full bg-emerald-600" />
              </div>
            )}
          </Panel>
        </section>
      </div>
    </main>
  )
}

function normalizeDashboard(data) {
  const next = { ...emptyDashboard, ...(data || {}) }
  return {
    ...next,
    recent_conversations: Array.isArray(next.recent_conversations) ? next.recent_conversations : [],
    unresolved_questions: Array.isArray(next.unresolved_questions) ? next.unresolved_questions : [],
    top_topics: Array.isArray(next.top_topics) ? next.top_topics : [],
    review_assistant: { ...emptyDashboard.review_assistant, ...(next.review_assistant || {}) },
  }
}

function MetricCard({ title, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <div className="mt-2 text-xs font-black text-emerald-700">{hint}</div>
    </div>
  )
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-sm font-black">{title}</h2>
        <span className="text-xs font-black text-blue-700">{action}</span>
      </div>
      {children}
    </section>
  )
}

function EmptyLine({ text }) {
  return <div className="text-sm text-slate-500">{text}</div>
}
