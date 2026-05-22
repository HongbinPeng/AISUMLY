const APP_TIME_ZONE = 'Asia/Shanghai'

function parseAppTime(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const text = String(value).trim()
  if (!text) return null

  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text)
  const normalized = hasTimezone ? text : text.replace(' ', 'T')
  const date = new Date(normalized)

  return Number.isNaN(date.getTime()) ? null : date
}

export function formatMonthDayTime(value) {
  const date = parseAppTime(value)
  if (!date) return ''
  return date.toLocaleString('zh-CN', {
    timeZone: APP_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatClockTime(value) {
  const date = parseAppTime(value)
  if (!date) return ''
  return date.toLocaleTimeString('zh-CN', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(value) {
  const date = parseAppTime(value)
  if (!date) return ''

  const diff = Date.now() - date.getTime()
  if (diff >= 0 && diff < 60000) return '刚刚'
  if (diff >= 0 && diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff >= 0 && diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`

  return formatMonthDayTime(date)
}

export function formatRelativeDate(value) {
  const date = parseAppTime(value)
  if (!date) return ''

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff >= 0 && diff < 60000) return '刚刚'
  if (diff >= 0 && diff < 86400000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff >= 0 && diff < 172800000) return '昨天'

  return date.toLocaleDateString('zh-CN', {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  })
}
