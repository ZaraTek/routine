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

// Punch-card weeks run Monday to Sunday
export function weekStart(d) {
  return addDays(d, -((d.getDay() + 6) % 7))
}

// Date keys punched in the week containing `date`
export function punchesInWeek(task, doneKeys, date) {
  const out = []
  for (let i = 0, d = weekStart(date); i < 7; i++, d = addDays(d, 1)) {
    if (doneKeys.has(`${task.id}|${toDateKey(d)}`)) out.push(toDateKey(d))
  }
  return out
}

export function isActiveOn(task, date) {
  return toDateKey(date) >= toDateKey(new Date(task.created_at))
}

// Punch cards aren't due on a specific day, so this is false for them
export function isDueOn(task, date) {
  if (!isActiveOn(task, date)) return false
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

// Strikes and completion rate for the month starting `monthStartKey`, as of `todayKey`.
// `doneKeys` holds "taskId|YYYY-MM-DD" strings and must reach back to the Monday before the 1st.
//   - day tasks: each due day before today is one slot; unchecked = one strike
//   - punch cards: each week that ended this month (before today) has `punch_target` slots;
//     each missing punch = one strike. The week a card was created in is skipped.
//   - today only counts what's already checked, so the rate doesn't drop every morning
export function scoreMonth(tasks, doneKeys, monthStartKey, todayKey) {
  const misses = []
  let due = 0
  let done = 0

  for (let d = fromDateKey(monthStartKey); toDateKey(d) <= todayKey; d = addDays(d, 1)) {
    const key = toDateKey(d)
    for (const t of tasks) {
      if (!isDueOn(t, d)) continue
      const checked = doneKeys.has(`${t.id}|${key}`)
      if (key === todayKey) {
        if (checked) due++, done++
      } else {
        due++
        if (checked) done++
        else misses.push({ task: t, date: key, count: 1 })
      }
    }
  }

  for (const t of tasks) {
    if (t.frequency !== 'punch') continue
    for (let ws = weekStart(fromDateKey(monthStartKey)); ; ws = addDays(ws, 7)) {
      const endKey = toDateKey(addDays(ws, 6))
      if (endKey >= todayKey) break
      const week = endKey >= monthStartKey && punchWeek(t, doneKeys, ws)
      if (!week) continue
      due += week.target
      done += week.punched
      if (week.punched < week.target) misses.push({ task: t, date: toDateKey(ws), count: week.target - week.punched, week: true })
    }
  }

  return { misses, due, done }
}

// A punch card's result for the week starting Monday `ws`, or null if the card didn't exist
// for that whole week (the week it was created in doesn't count)
function punchWeek(task, doneKeys, ws) {
  if (toDateKey(ws) < toDateKey(new Date(task.created_at))) return null
  return { target: task.punch_target, punched: Math.min(punchesInWeek(task, doneKeys, ws).length, task.punch_target) }
}

// Day tasks due and done on one day (for the calendar)
export function dayResult(tasks, doneKeys, d) {
  const key = toDateKey(d)
  let due = 0
  let done = 0
  for (const t of tasks) {
    if (!isDueOn(t, d)) continue
    due++
    if (doneKeys.has(`${t.id}|${key}`)) done++
  }
  return { due, done }
}

// All punch cards' combined result for the week starting Monday `ws` (for the calendar)
export function weekResult(tasks, doneKeys, ws) {
  let target = 0
  let punched = 0
  for (const t of tasks) {
    const week = t.frequency === 'punch' && punchWeek(t, doneKeys, ws)
    if (!week) continue
    target += week.target
    punched += week.punched
  }
  return { target, punched }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function describeSchedule(task) {
  if (task.frequency === 'punch') return `${task.punch_target}× a week`
  if (task.frequency === 'daily') return 'Every day'
  if (task.frequency === 'weekly') {
    const days = [...task.weekdays].sort((a, b) => a - b)
    if (days.length === 7) return 'Every day'
    return days.map((d) => WEEKDAY_NAMES[d]).join(', ')
  }
  return `Monthly on the ${ordinal(task.month_day)}`
}
