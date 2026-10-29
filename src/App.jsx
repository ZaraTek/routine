import { useCallback, useEffect, useMemo, useState } from 'react'
import { isConfigured, supabase } from './supabase'
import {
  addDays,
  describeDue,
  describeSchedule,
  fromDateKey,
  isActiveOn,
  isDueOn,
  punchesInWeek,
  scoreMonth,
  toDateKey,
  WEEKDAY_NAMES,
  weekStart,
} from './schedule'
import Auth from './Auth'
import Calendar from './Calendar'
import Agenda, { AgendaForm } from './Agenda'
import TaskForm from './TaskForm'

export default function App() {
  if (!isConfigured) return <Setup />
  return <Gate />
}

function Setup() {
  return (
    <main className="auth">
      <h1>Almost there</h1>
      <p className="muted">
        Copy <code>.env.example</code> to <code>.env</code>, fill in your Supabase URL and anon key, then restart{' '}
        <code>npm run dev</code>.
      </p>
    </main>
  )
}

function Gate() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <main className="auth muted">Loading…</main>
  return session ? <Checklist user={session.user} /> : <Auth />
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function RateCard({ due, done, month }) {
  const pct = due ? Math.round((done / due) * 100) : null
  const tone = pct === null ? '' : pct >= 80 ? 'good' : pct >= 50 ? 'ok' : 'bad'
  return (
    <section className={`rate ${tone}`}>
      <div className="rate-head">
        <strong>{month} completion</strong>
        <span className="rate-pct">{pct === null ? '–' : `${pct}%`}</span>
      </div>
      <div className="rate-bar" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct ?? 0}%` }} />
      </div>
      <span className="muted">{due ? `${done} of ${due} done this month` : 'Nothing due yet this month'}</span>
    </section>
  )
}

export function StrikeCard({ strikes, month, onJump }) {
  const [open, setOpen] = useState(false)
  const n = strikes.reduce((sum, s) => sum + s.count, 0)

  // group misses by task, worst first
  const byTask = new Map()
  for (const s of strikes) {
    if (!byTask.has(s.task.id)) byTask.set(s.task.id, { task: s.task, misses: [], total: 0 })
    const g = byTask.get(s.task.id)
    g.misses.push(s)
    g.total += s.count
  }
  const groups = [...byTask.values()].sort((a, b) => b.total - a.total)
  const short = (key) => fromDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <section className={n ? 'strikes has-strikes' : 'strikes'}>
      <button className="strikes-head" onClick={() => n && setOpen(!open)} aria-expanded={n ? open : undefined}>
        <span className="strikes-count">{n}</span>
        <span className="strikes-text">
          <strong>{n === 1 ? 'strike' : 'strikes'} in {month}</strong>
          <span className="muted">{n ? 'Missed tasks this month' : 'Nothing missed so far. Keep it up'}</span>
        </span>
        {n > 0 && <span className="chevron">{open ? '⌃' : '⌄'}</span>}
      </button>
      {open && (
        <ul className="strikes-list">
          {groups.map(({ task, misses, total }) => (
            <li key={task.id}>
              <div className="strikes-task">
                <span>{task.title}</span>
                <span className="strikes-badge">{total}</span>
              </div>
              <div className="strikes-dates">
                {misses.map((m) => (
                  <button key={m.date} onClick={() => onJump(m.date)}>
                    {m.week ? `Week of ${short(m.date)} · ${m.count} missed` : short(m.date)}
                  </button>
                ))}
              </div>
            </li>
          ))}
          <li className="muted strikes-hint">Tap a date to open that day. Checking a task off or punching there removes the strike.</li>
        </ul>
      )}
    </section>
  )
}

export function PunchCard({ task, punches, dateKey, onPunch, onEdit }) {
  const target = task.punch_target
  const punchedToday = punches.includes(dateKey)
  const holes = Math.max(target, punches.length)
  const complete = punches.length >= target
  return (
    <li className={complete ? 'punch complete' : 'punch'}>
      <div className="punch-head">
        <span className="label">{task.title}</span>
        <span className="muted">
          {punches.length}/{target} this week
        </span>
        <button className="edit" aria-label={`Edit ${task.title}`} onClick={onEdit}>
          <PencilIcon />
        </button>
      </div>
      <div className="holes" aria-hidden>
        {Array.from({ length: holes }, (_, i) => (
          <span key={i} className={i < punches.length ? 'hole punched' : 'hole'}>
            {i < punches.length ? WEEKDAY_NAMES[fromDateKey(punches[i]).getDay()].slice(0, 2) : ''}
          </span>
        ))}
      </div>
      <button className={punchedToday ? 'punch-btn punched' : 'punch-btn primary'} onClick={onPunch}>
        {punchedToday ? 'Punched ✓ (tap to undo)' : 'Punch'}
      </button>
    </li>
  )
}

function formatDay(date) {
  const today = toDateKey(new Date())
  const key = toDateKey(date)
  if (key === today) return 'Today'
  if (key === toDateKey(addDays(new Date(), -1))) return 'Yesterday'
  if (key === toDateKey(addDays(new Date(), 1))) return 'Tomorrow'
  return date.toLocaleDateString(undefined, { weekday: 'long' })
}

function Checklist({ user }) {
  const [tasks, setTasks] = useState([])
  const [doneKeys, setDoneKeys] = useState(new Set()) // "taskId|date" for every completion in [rangeStart, rangeEnd]
  const [doneLoaded, setDoneLoaded] = useState(false)
  const [date, setDate] = useState(() => new Date())
  const [tab, setTab] = useState('today')
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const [agenda, setAgenda] = useState([])
  const [agendaSetupNeeded, setAgendaSetupNeeded] = useState(false)
  const [editingAgenda, setEditingAgenda] = useState(null) // null | 'new' | item
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const dateKey = toDateKey(date)
  const todayKey = toDateKey(new Date())
  const monthStartKey = todayKey.slice(0, 8) + '01' // strikes and completion rate reset on the 1st

  // load completions covering this month's stats (back to the Monday before the 1st, for punch
  // weeks) and the whole week being viewed
  const viewWeekStart = weekStart(date)
  const minKey = (a, b) => (a < b ? a : b)
  const maxKey = (a, b) => (a > b ? a : b)
  const rangeStart = minKey(toDateKey(weekStart(fromDateKey(monthStartKey))), toDateKey(viewWeekStart))
  const viewWeekEndKey = toDateKey(addDays(viewWeekStart, 6))
  const rangeEnd = maxKey(todayKey, viewWeekEndKey)

  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .order('created_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setTasks(data)
        setLoaded(true)
      })
  }, [])

  useEffect(() => {
    let stale = false
    supabase
      .from('completions')
      .select('task_id, date')
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .then(({ data, error }) => {
        if (stale) return
        if (error) setError(error.message)
        else setDoneKeys(new Set(data.map((r) => `${r.task_id}|${r.date}`)))
        setDoneLoaded(true)
      })
    return () => {
      stale = true
    }
  }, [rangeStart, rangeEnd])

  useEffect(() => {
    supabase
      .from('agenda')
      .select('*')
      .then(({ data, error }) => {
        // the agenda table comes from a later migration; prompt for it instead of erroring
        if (error && /agenda/.test(error.message)) setAgendaSetupNeeded(true)
        else if (error) setError(error.message)
        else setAgenda(data)
      })
  }, [])

  async function toggleAgenda(item) {
    const done_at = item.done_at ? null : new Date().toISOString()
    const apply = (value) => setAgenda((cur) => cur.map((a) => (a.id === item.id ? { ...a, done_at: value } : a)))
    apply(done_at)
    const { error } = await supabase.from('agenda').update({ done_at }).eq('id', item.id)
    if (error) {
      setError(error.message)
      apply(item.done_at)
    }
  }

  async function saveAgenda(fields) {
    const existing = editingAgenda !== 'new' ? editingAgenda : null
    const { data, error } = existing
      ? await supabase.from('agenda').update(fields).eq('id', existing.id).select().single()
      : await supabase.from('agenda').insert(fields).select().single()
    if (error) return setError(error.message)
    setAgenda((cur) => (existing ? cur.map((a) => (a.id === data.id ? data : a)) : [...cur, data]))
    setEditingAgenda(null)
  }

  async function removeAgenda() {
    const { error } = await supabase.from('agenda').delete().eq('id', editingAgenda.id)
    if (error) return setError(error.message)
    setAgenda((cur) => cur.filter((a) => a.id !== editingAgenda.id))
    setEditingAgenda(null)
  }

  const agendaDueCount = agenda.filter((a) => !a.done_at && a.due_date <= todayKey).length

  const isDone = (task) => doneKeys.has(`${task.id}|${dateKey}`)
  const due = useMemo(() => tasks.filter((t) => isDueOn(t, date)), [tasks, date])
  const punchCards = useMemo(
    () => tasks.filter((t) => t.frequency === 'punch' && isActiveOn(t, fromDateKey(viewWeekEndKey))),
    [tasks, viewWeekEndKey],
  )
  const completed = due.filter(isDone).length
  const stats = useMemo(
    () => scoreMonth(tasks, doneKeys, monthStartKey, todayKey),
    [tasks, doneKeys, monthStartKey, todayKey],
  )

  // check off a day task, or punch a punch card, on the day being viewed
  const toggle = useCallback(
    async (task) => {
      const key = `${task.id}|${dateKey}`
      const wasDone = doneKeys.has(key)
      const apply = (checked) =>
        setDoneKeys((cur) => {
          const next = new Set(cur)
          checked ? next.add(key) : next.delete(key)
          return next
        })
      apply(!wasDone)
      const { error } = wasDone
        ? await supabase.from('completions').delete().eq('task_id', task.id).eq('date', dateKey)
        : await supabase.from('completions').upsert({ task_id: task.id, date: dateKey }, { onConflict: 'task_id,date' })
      if (error) {
        setError(error.message)
        apply(wasDone)
      }
    },
    [doneKeys, dateKey],
  )

  async function save(fields) {
    const existing = editing !== 'new' ? editing : null
    const { data, error } = existing
      ? await supabase.from('tasks').update(fields).eq('id', existing.id).select().single()
      : await supabase.from('tasks').insert(fields).select().single()
    if (error) return setError(error.message)
    setTasks((cur) => (existing ? cur.map((t) => (t.id === data.id ? data : t)) : [...cur, data]))
    setEditing(null)
  }

  async function remove() {
    const { error } = await supabase.from('tasks').delete().eq('id', editing.id)
    if (error) return setError(error.message)
    setTasks((cur) => cur.filter((t) => t.id !== editing.id))
    setEditing(null)
  }

  const isToday = dateKey === toDateKey(new Date())
  const pct = due.length ? Math.round((completed / due.length) * 100) : 0
  const isStrikeDay = dateKey >= monthStartKey && dateKey < todayKey
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })

  return (
    <div className="app">
      <header>
        <nav className="tabs">
          {[
            ['today', 'Today'],
            ['calendar', 'Calendar'],
            ['agenda', 'Agenda'],
            ['tasks', 'Tasks'],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
              {id === 'agenda' && agendaDueCount > 0 && (
                <span className="tab-badge" aria-label={`${agendaDueCount} due`}>
                  {agendaDueCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <p className="error banner" onClick={() => setError('')}>
          {error} (tap to dismiss)
        </p>
      )}

      {tab === 'today' ? (
        <main>
          {loaded && doneLoaded && (
            <>
              <RateCard due={stats.due} done={stats.done} month={monthName} />
              <StrikeCard strikes={stats.misses} month={monthName} onJump={(key) => setDate(fromDateKey(key))} />
            </>
          )}
          <div className="daynav">
            <button aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              ‹
            </button>
            <div className="daytitle">
              <h1>{formatDay(date)}</h1>
              <span className="muted">
                {date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <button aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
              ›
            </button>
          </div>
          {!isToday && (
            <button className="link center" onClick={() => setDate(new Date())}>
              Jump to today
            </button>
          )}

          {due.length > 0 && (
            <div className="progress" aria-label={`${completed} of ${due.length} done`}>
              <div style={{ width: `${pct}%` }} />
            </div>
          )}

          {!loaded ? (
            <p className="muted center">Loading…</p>
          ) : due.length === 0 ? (
            punchCards.length === 0 && (
              <p className="empty">{tasks.length ? 'Nothing due this day 🎉' : 'No tasks yet — add your first one.'}</p>
            )
          ) : (
            <ul className="list">
              {due.map((t) => (
                <li key={t.id} className="check-row">
                  <label className={isDone(t) ? 'check done' : 'check'}>
                    <input type="checkbox" checked={isDone(t)} onChange={() => toggle(t)} />
                    <span className="box" aria-hidden />
                    <span className="task-text">
                      <span className="label">{t.title}</span>
                      <span className="task-due">Due: {describeDue(t, date, todayKey)}</span>
                    </span>
                    {isStrikeDay && !isDone(t) && <span className="strike-tag">Strike</span>}
                  </label>
                  <button className="edit" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>
                    <PencilIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {due.length > 0 && completed === due.length && <p className="center muted">All done ✓</p>}

          {loaded && punchCards.length > 0 && (
            <>
              <h2 className="section-title">Punch cards</h2>
              <ul className="list">
                {punchCards.map((t) => (
                  <PunchCard
                    key={t.id}
                    task={t}
                    punches={punchesInWeek(t, doneKeys, date)}
                    dateKey={dateKey}
                    onPunch={() => toggle(t)}
                    onEdit={() => setEditing(t)}
                  />
                ))}
              </ul>
            </>
          )}
        </main>
      ) : tab === 'calendar' ? (
        <Calendar
          tasks={tasks}
          onError={setError}
          onOpenDay={(key) => {
            setDate(fromDateKey(key))
            setTab('today')
          }}
        />
      ) : tab === 'agenda' ? (
        <Agenda
          items={agenda}
          todayKey={todayKey}
          setupNeeded={agendaSetupNeeded}
          onToggle={toggleAgenda}
          onEdit={setEditingAgenda}
        />
      ) : (
        <main>
          <h1>All tasks</h1>
          {tasks.length === 0 && <p className="empty">No tasks yet — add your first one.</p>}
          <ul className="list">
            {tasks.map((t) => (
              <li key={t.id}>
                <button className="row" onClick={() => setEditing(t)}>
                  <span className="label">{t.title}</span>
                  <span className="muted">{describeSchedule(t)}</span>
                  <span className="chevron" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="account">
            <span className="muted">Signed in as {user.email}</span>
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </main>
      )}

      {!(tab === 'agenda' && agendaSetupNeeded) && (
        <button
          className="fab"
          aria-label={tab === 'agenda' ? 'Add agenda item' : 'Add task'}
          onClick={() => (tab === 'agenda' ? setEditingAgenda('new') : setEditing('new'))}
        >
          +
        </button>
      )}

      {editing && (
        <TaskForm
          task={editing === 'new' ? null : editing}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
      {editingAgenda && (
        <AgendaForm
          item={editingAgenda === 'new' ? null : editingAgenda}
          onSave={saveAgenda}
          onDelete={removeAgenda}
          onClose={() => setEditingAgenda(null)}
        />
      )}
    </div>
  )
}
