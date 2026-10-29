export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Local-time YYYY-MM-DD (toISOString would shift the day for evening users east of UTC-0)
export function toDateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d, n) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export function isDueOn(task, date) {
  if (toDateKey(date) < toDateKey(new Date(task.created_at))) return false
  switch (task.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return task.weekdays.includes(date.getDay())
    case 'monthly':
      // a task set for the 31st is due on the last day of shorter months
      return date.getDate() === Math.min(task.month_day, daysInMonth(date))
    default:
      return false
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function describeSchedule(task) {
  if (task.frequency === 'daily') return 'Every day'
  if (task.frequency === 'weekly') {
    const days = [...task.weekdays].sort((a, b) => a - b)
    if (days.length === 7) return 'Every day'
    return days.map((d) => WEEKDAY_NAMES[d]).join(', ')
  }
  return `Monthly on the ${ordinal(task.month_day)}`
}
