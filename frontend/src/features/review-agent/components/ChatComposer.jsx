export function ChatComposer({ value, loading, onChange, onSend }) {
  return (
    <footer className="grid shrink-0 grid-cols-[minmax(0,1fr)_88px] gap-3 border-t border-slate-200 bg-white px-4 py-3">
      <textarea
        className="max-h-56 min-h-[72px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
        value={value}
        disabled={loading}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例如：帮我整理今天待复习的问题，并按难度排序..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
      />
      <button
        className="h-[58px] rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => onSend()}
        disabled={loading || !value.trim()}
        type="button"
      >
        {loading ? '生成中' : '发送'}
      </button>
    </footer>
  )
}
