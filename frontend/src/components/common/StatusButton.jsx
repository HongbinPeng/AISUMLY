/**
 * 小型状态按钮，用于卡片状态切换。
 */
export function StatusButton({ active, activeClass, inactiveClass, disabled, children, onClick }) {
  return (
    <button
      className={`rounded-full border px-2 py-1 text-xs font-black transition disabled:cursor-wait disabled:opacity-60 ${active ? activeClass : inactiveClass}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}
