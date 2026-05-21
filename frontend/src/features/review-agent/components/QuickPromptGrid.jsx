import { quickPrompts } from '../constants.js'

export function QuickPromptGrid({ disabled, onSend }) {
  return (
    <section className="grid shrink-0 grid-cols-4 gap-2.5 border-b border-slate-100 bg-slate-50/40 px-6 py-3">
      {quickPrompts.map((item) => (
        <button
          key={item.title}
          className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm shadow-slate-200/40 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-60"
          onClick={() => onSend(item.text)}
          disabled={disabled}
          type="button"
        >
          <strong className="block truncate text-[13px]">{item.title}</strong>
          <span className="mt-1 block truncate text-xs text-slate-500">{item.desc}</span>
        </button>
      ))}
    </section>
  )
}
