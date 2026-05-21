export function EmptyState({ title, description }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-slate-300 bg-white/70 text-center">
      <div>
        <strong className="block text-slate-900">{title}</strong>
        {description && <span className="mt-1 block text-sm text-slate-500">{description}</span>}
      </div>
    </div>
  )
}
