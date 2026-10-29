import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { addDays, dayResult, toDateKey, weekResult, weekStart } from './schedule'

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export default function Calendar({ tasks, onOpenDay, onError, loadCompletions = defaultLoad }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [doneKeys, setDoneKeys] = useState(null)

  // Monday-to-Sunday rows covering the whole month
  const gridStart = weekStart(month)
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const gridEnd = addDays(weekStart(lastDay), 6)
  const startKey = toDateKey(gridStart)
  const endKey = toDateKey(gridEnd)

  useEffect(() => {
    let stale = false
    setDoneKeys(null)
    loadCompletions(startKey, endKey).then(({ data, error }) => {
      if (stale) return
      if (error) return onError(error.message)
      setDoneKeys(new Set(data.map((r) => `${r.task_id}|${r.date}`)))
    })
    return () => {
      stale = true
    }
  }, [startKey, endKey, loadCompletions, onError])

  const todayKey = toDateKey(new Date())
  const hasPunch = tasks.some((t) => t.frequency === 'punch')
  const weeks = []
  for (let ws = gridStart; toDateKey(ws) <= endKey; ws = addDays(ws, 7)) weeks.push(ws)

  return (
    <main>
      <div className="daynav">
        <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          ‹
        </button>
        <div className="daytitle">
          <h1>{month.toLocaleDateString(undefined, { month: 'long' })}</h1>
          <span className="muted">{month.getFullYear()}</span>
        </div>
        <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          ›
        </button>
      </div>

      <div className={hasPunch ? 'cal with-weeks' : 'cal'} aria-busy={!doneKeys}>
        {DAY_LABELS.map((l) => (
          <span key={l} className="cal-label">
            {l}
          </span>
        ))}
        {hasPunch && <span className="cal-label">Wk</span>}

        {weeks.map((ws) => (
          <Week
            key={toDateKey(ws)}
            ws={ws}
            month={month}
            tasks={tasks}
            doneKeys={doneKeys}
            todayKey={todayKey}
            hasPunch={hasPunch}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>

      <ul className="cal-legend">
        <li>
          <span className="swatch perfect" /> Everything done
        </li>
        <li>
          <span className="swatch missed" /> Strike (number = tasks missed)
        </li>
        {hasPunch && (
          <li>
            <span className="swatch week" /> Wk: punch cards for that week
          </li>
        )}
      </ul>
      <p className="muted center cal-hint">Tap a day to open it in the checklist.</p>
    </main>
  )
}

function Week({ ws, month, tasks, doneKeys, todayKey, hasPunch, onOpenDay }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const weekEndKey = toDateKey(days[6])
  const punch = doneKeys && hasPunch ? weekResult(tasks, doneKeys, ws) : null

  return (
    <>
      {days.map((d) => {
        const key = toDateKey(d)
        const inMonth = d.getMonth() === month.getMonth()
        let cls = 'cal-day'
        let mark = null
        if (!inMonth) cls += ' out'
        if (key === todayKey) cls += ' today'
        if (doneKeys && key <= todayKey) {
          const { due, done } = dayResult(tasks, doneKeys, d)
          if (due > 0 && done === due) cls += ' perfect'
          else if (due > done && key < todayKey) {
            cls += ' missed'
            mark = due - done
          }
        }
        return (
          <button key={key} className={cls} onClick={() => onOpenDay(key)} aria-label={d.toDateString()}>
            <span>{d.getDate()}</span>
            {mark && <small>{mark}</small>}
          </button>
        )
      })}
      {hasPunch && <WeekCell punch={punch} finished={weekEndKey < todayKey} started={toDateKey(ws) <= todayKey} />}
    </>
  )
}

function WeekCell({ punch, finished, started }) {
  if (!punch || punch.target === 0 || !started) return <span className="cal-week" />
  const missed = punch.target - punch.punched
  if (!finished) {
    return (
      <span className="cal-week pending" title="This week so far">
        {punch.punched}/{punch.target}
      </span>
    )
  }
  return missed ? (
    <span className="cal-week missed" title={`${missed} punches missed`}>
      −{missed}
    </span>
  ) : (
    <span className="cal-week perfect" title="All punches done">
      ✓
    </span>
  )
}

function defaultLoad(from, to) {
  return supabase.from('completions').select('task_id, date').gte('date', from).lte('date', to)
}
