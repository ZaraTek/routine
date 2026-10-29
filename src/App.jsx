import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isConfigured, supabase } from './supabase'
import {
  addDays,
  describeDue,
  describeSchedule,
  fromDateKey,
  isActiveOn,
  nextDueOn,
  punchesInWeek,
  scoreMonth,
  toDateKey,
  WEEKDAY_NAMES,
  weekStart,
} from './schedule'
import Auth from './Auth'
import Calendar from './Calendar'
import Agenda, { AgendaForm, AgendaRow } from './Agenda'
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
                  <button key={m.date} onClick={() => onJump(m)}>
                    {m.week ? `Week of ${short(m.date)} · ${m.count} missed` : short(m.date)}
                  </button>
                ))}
              </div>
            </li>
          ))}
          <li className="muted strikes-hint">Tap a date to open it. Checking the task off, or punching that week, removes the strike.</li>
        </ul>
      )}
    </section>
  )
}

export function PunchTab({ tasks, doneKeys, weekKey, todayKey, onWeek, onPunch, onEdit }) {
  const ws = fromDateKey(weekKey)
  const weekEndKey = toDateKey(addDays(ws, 6))
  const isThisWeek = weekKey === toDateKey(weekStart(fromDateKey(todayKey)))
  const short = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const cards = tasks.filter((t) => t.frequency === 'punch' && isActiveOn(t, fromDateKey(weekEndKey)))

  return (
    <main>
      <div className="daynav">
        <button aria-label="Previous week" onClick={() => onWeek(toDateKey(addDays(ws, -7)))}>
          ‹
        </button>
        <div className="daytitle">
          <h1>{isThisWeek ? 'This week' : `Week of ${short(ws)}`}</h1>
          <span className="muted">
            {short(ws)} – {short(addDays(ws, 6))}
          </span>
        </div>
        <button aria-label="Next week" disabled={isThisWeek} onClick={() => onWeek(toDateKey(addDays(ws, 7)))}>
          ›
        </button>
      </div>
      {!isThisWeek && (
        <button className="link center" onClick={() => onWeek(toDateKey(weekStart(fromDateKey(todayKey))))}>
          Jump to this week
        </button>
      )}

      {cards.length === 0 ? (
        <p className="empty">
          {tasks.some((t) => t.frequency === 'punch')
            ? 'No punch cards existed this week.'
            : 'No punch cards yet. Tap + to add one, like “Go to the gym, 4× a week”.'}
        </p>
      ) : (
        <ul className="list">
          {cards.map((t) => (
            <PunchCard
              key={t.id}
              task={t}
              punches={punchesInWeek(t, doneKeys, ws)}
              weekKey={weekKey}
              todayKey={todayKey}
              isThisWeek={isThisWeek}
              onPunchDay={(key) => onPunch(t, key)}
              onEdit={() => onEdit(t)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

export function PunchCard({ task, punches, weekKey, todayKey, isThisWeek, onPunchDay, onEdit }) {
  const target = task.punch_target
  const punchedToday = punches.includes(todayKey)
  const holes = Math.max(target, punches.length)
  const complete = punches.length >= target
  const ws = fromDateKey(weekKey)
  const weekDays = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(ws, i)))
  return (
    <li className={complete ? 'punch complete' : 'punch'}>
      <div className="punch-head">
        <span className="label">{task.title}</span>
        <span className="muted">
          {punches.length}/{target} {isThisWeek ? 'this week' : 'that week'}
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
      {isThisWeek && (
        <button className={punchedToday ? 'punch-btn punched' : 'punch-btn primary'} onClick={() => onPunchDay(todayKey)}>
          {punchedToday ? 'Punched today ✓ (tap to undo)' : 'Punch today'}
        </button>
      )}
      <div className="punch-days">
        <span className="muted">{isThisWeek ? 'Forgot one? Tap a day this week:' : 'Tap a day to punch it:'}</span>
        <div className="days">
          {weekDays.map((key) => {
            const punched = punches.includes(key)
            const name = fromDateKey(key).toLocaleDateString(undefined, { weekday: 'long' })
            return (
              <button
                key={key}
                className={punched ? 'active' : ''}
                disabled={key > todayKey}
                aria-pressed={punched}
                aria-label={`${punched ? 'Remove punch for' : 'Punch'} ${name}`}
                onClick={() => onPunchDay(key)}
              >
                {WEEKDAY_NAMES[fromDateKey(key).getDay()].slice(0, 2)}
              </button>
            )
          })}
        </div>
      </div>
    </li>
  )
}

function HomeSection({ title, count, link, empty, children }) {
  const items = [children].flat().filter(Boolean)
  if (!items.length && !empty) return null
  return (
    <section className="home-section">
      <h2 className="section-title">
        {title}
        {count && <span className="section-count">{count}</span>}
        {link && (
          <button className="link section-link" onClick={link[1]}>
            {link[0]} ›
          </button>
        )}
      </h2>
      {items.length ? <ul className="list">{items}</ul> : <p className="muted section-empty">{empty}</p>}
    </section>
  )
}

function PunchRow({ task, punches, punched, onPunch }) {
  const target = task.punch_target
  const met = punches.length >= target
  return (
    <li className={met ? 'punch-row met' : 'punch-row'}>
      <span className="task-text">
        <span className="label">{task.title}</span>
        <span className="task-due">
          {punches.length}/{target} this week{met ? ' ✓' : ''}
        </span>
      </span>
      <span className="mini-holes" aria-hidden>
        {Array.from({ length: Math.max(target, punches.length) }, (_, i) => (
          <span key={i} className={i < punches.length ? 'punched' : ''} />
        ))}
      </span>
      <button className={punched ? 'punched' : 'primary'} onClick={onPunch} aria-pressed={punched}>
        {punched ? '✓' : 'Punch'}
      </button>
    </li>
  )
}

const TABS = [
  ['home', 'Home'],
  ['agenda', 'Agenda'],
  ['punch', 'Punch'],
  ['tasks', 'Tasks'],
  ['calendar', 'Calendar'],
]
const tabIndex = (id) => TABS.findIndex(([t]) => t === id)

// Tasks tab sections; weekly sorts by first day of the week it's due (Monday first), monthly by day
const SCHEDULE_GROUPS = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly', (t) => Math.min(...t.weekdays.map((d) => (d + 6) % 7))],
  ['monthly', 'Monthly', (t) => t.month_day],
  ['punch', 'Punch cards', (t) => -t.punch_target],
]

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
  const [punchWeekKey, setPunchWeekKey] = useState(() => toDateKey(weekStart(new Date()))) // Monday of the week on the Punch tab
  const [tab, setTab] = useState('home')
  const [slide, setSlide] = useState('') // direction of the last tab change, for the slide-in animation
  const swipe = useRef(null)
  const [editing, setEditing] = useState(null) // null | 'new' | 'new-punch' | task
  const [agenda, setAgenda] = useState([])
  const [agendaSetupNeeded, setAgendaSetupNeeded] = useState(false)
  const [editingAgenda, setEditingAgenda] = useState(null) // null | 'new' | item
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const dateKey = toDateKey(date)
  const todayKey = toDateKey(new Date())
  const monthStartKey = todayKey.slice(0, 8) + '01' // strikes and completion rate reset on the 1st

  // load completions covering this month's stats (back to the Monday before the 1st, for punch
  // weeks), the day being viewed plus its upcoming due dates, and the week on the Punch tab
  const minKey = (a, b) => (a < b ? a : b)
  const maxKey = (a, b) => (a > b ? a : b)
  const rangeStart = [toDateKey(weekStart(fromDateKey(monthStartKey))), toDateKey(weekStart(date)), punchWeekKey].reduce(minKey)
  const rangeEnd = maxKey(todayKey, toDateKey(addDays(date, 62)))

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

  // each day/weekly/monthly task's next occurrence as of the viewed day, soonest first
  const due = useMemo(
    () =>
      tasks
        .filter((t) => t.frequency !== 'punch')
        .map((task) => ({ task, dueKey: nextDueOn(task, date) }))
        .filter((o) => o.dueKey)
        .sort((a, b) => a.dueKey.localeCompare(b.dueKey)),
    [tasks, date],
  )
  const isDone = ({ task, dueKey }) => doneKeys.has(`${task.id}|${dueKey}`)
  const stats = useMemo(
    () => scoreMonth(tasks, doneKeys, monthStartKey, todayKey),
    [tasks, doneKeys, monthStartKey, todayKey],
  )

  // check off an occurrence (stored under its due date), or punch a punch card (stored under the day punched)
  const toggle = useCallback(
    async (task, onKey) => {
      const key = `${task.id}|${onKey}`
      const wasDone = doneKeys.has(key)
      const apply = (checked) =>
        setDoneKeys((cur) => {
          const next = new Set(cur)
          checked ? next.add(key) : next.delete(key)
          return next
        })
      apply(!wasDone)
      const { error } = wasDone
        ? await supabase.from('completions').delete().eq('task_id', task.id).eq('date', onKey)
        : await supabase.from('completions').upsert({ task_id: task.id, date: onKey }, { onConflict: 'task_id,date' })
      if (error) {
        setError(error.message)
        apply(wasDone)
      }
    },
    [doneKeys],
  )

  async function save(fields) {
    const existing = typeof editing === 'string' ? null : editing
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

  function goTo(id) {
    if (id === tab) return
    setSlide(tabIndex(id) > tabIndex(tab) ? 'left' : 'right')
    setTab(id)
  }

  // swipe left/right anywhere on the page to change tabs (mobile)
  function onTouchStart(e) {
    const t = e.touches[0]
    const fromEdge = t.clientX < 24 || t.clientX > window.innerWidth - 24 // leave the browser's edge-swipe back gesture alone
    const inField = e.target.closest('input, textarea, select')
    swipe.current = editing || editingAgenda || fromEdge || inField || e.touches.length > 1
      ? null
      : { x: t.clientX, y: t.clientY, time: Date.now() }
  }
  function onTouchEnd(e) {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - start.time > 700) return
    const next = TABS[tabIndex(tab) + (dx < 0 ? 1 : -1)]
    if (next) goTo(next[0])
  }
  const isStrike = (o) => o.dueKey >= monthStartKey && o.dueKey < todayKey && !isDone(o)
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })

  // Home dashboard, in priority order: due on the viewed day, punch cards, assignments, weekly, monthly
  const openDue = due.filter((o) => !isDone(o))
  const doneDue = due.filter(isDone)
  const todayOpen = openDue.filter((o) => o.dueKey === dateKey)
  const todayTotal = due.filter((o) => o.dueKey === dateKey).length
  const todayDone = todayTotal - todayOpen.length
  const weeklyOpen = openDue.filter((o) => o.dueKey !== dateKey && o.task.frequency === 'weekly')
  const monthlyOpen = openDue.filter((o) => o.dueKey !== dateKey && o.task.frequency === 'monthly')
  const homePunch = tasks
    .filter((t) => t.frequency === 'punch' && isActiveOn(t, addDays(weekStart(date), 6)))
    .map((task) => ({ task, punches: punchesInWeek(task, doneKeys, date) }))
    .sort((a, b) => (a.punches.length >= a.task.punch_target) - (b.punches.length >= b.task.punch_target))
  const weekAheadKey = toDateKey(addDays(new Date(), 7))
  const homeAgenda = agenda
    .filter((a) => !a.done_at && a.due_date <= weekAheadKey) // overdue + next 7 days
    .sort((a, b) => (a.due_date + (a.due_time ?? '99')).localeCompare(b.due_date + (b.due_time ?? '99')))

  const renderTaskRow = (o) => (
    <li key={o.task.id} className="check-row">
      <label className={isDone(o) ? 'check done' : 'check'}>
        <input type="checkbox" checked={isDone(o)} onChange={() => toggle(o.task, o.dueKey)} />
        <span className="box" aria-hidden />
        <span className="task-text">
          <span className="label">{o.task.title}</span>
          <span className="task-due">Due: {describeDue(o.dueKey, todayKey)}</span>
        </span>
        {isStrike(o) && <span className="strike-tag">Strike</span>}
      </label>
      <button className="edit" aria-label={`Edit ${o.task.title}`} onClick={() => setEditing(o.task)}>
        <PencilIcon />
      </button>
    </li>
  )

  return (
    <div className="app" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => goTo(id)}>
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

      <div key={tab} className={slide ? `tab-view slide-${slide}` : 'tab-view'}>
        {tab === 'home' ? (
          <main>
            {loaded && doneLoaded && (
              <>
                <RateCard due={stats.due} done={stats.done} month={monthName} />
                <StrikeCard
                  strikes={stats.misses}
                  month={monthName}
                  onJump={(miss) => {
                    // punch-card misses open that week on the Punch tab; others open the day here
                    if (miss.week) {
                      setPunchWeekKey(miss.date)
                      goTo('punch')
                    } else setDate(fromDateKey(miss.date))
                  }}
                />
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

            {!loaded ? (
              <p className="muted center">Loading…</p>
            ) : !tasks.length && !agenda.length ? (
              <p className="empty">Nothing here yet. Tap + to add your first task.</p>
            ) : (
              <>
                <HomeSection
                  title="Today"
                  count={todayOpen.length ? `${todayDone} of ${todayTotal} done` : null}
                  empty={todayTotal ? 'Everything due today is done ✓' : 'Nothing due today 🎉'}
                >
                  {todayOpen.map(renderTaskRow)}
                </HomeSection>

                {homePunch.length > 0 && (
                  <HomeSection title="Punch cards" link={['See all', () => goTo('punch')]}>
                    {homePunch.map(({ task, punches }) => (
                      <PunchRow
                        key={task.id}
                        task={task}
                        punches={punches}
                        punched={punches.includes(dateKey)}
                        onPunch={() => toggle(task, dateKey)}
                      />
                    ))}
                  </HomeSection>
                )}

                {!agendaSetupNeeded && (
                  <HomeSection title="Assignments" link={['Agenda', () => goTo('agenda')]} empty="Nothing due in the next week">
                    {homeAgenda.map((item) => (
                      <AgendaRow key={item.id} item={item} todayKey={todayKey} onToggle={toggleAgenda} onEdit={setEditingAgenda} />
                    ))}
                  </HomeSection>
                )}

                {weeklyOpen.length > 0 && <HomeSection title="Weekly">{weeklyOpen.map(renderTaskRow)}</HomeSection>}
                {monthlyOpen.length > 0 && <HomeSection title="Monthly">{monthlyOpen.map(renderTaskRow)}</HomeSection>}

                {doneDue.length > 0 && (
                  <section className="home-section">
                    <button className="link section-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                      {showDone ? 'Hide' : 'Show'} done ({doneDue.length})
                    </button>
                    {showDone && <ul className="list">{doneDue.map(renderTaskRow)}</ul>}
                  </section>
                )}
              </>
            )}
          </main>
        ) : tab === 'punch' ? (
          <PunchTab
            tasks={tasks}
            doneKeys={doneKeys}
            weekKey={punchWeekKey}
            todayKey={todayKey}
            onWeek={setPunchWeekKey}
            onPunch={toggle}
            onEdit={setEditing}
          />
        ) : tab === 'calendar' ? (
          <Calendar
            tasks={tasks}
            onError={setError}
            onOpenDay={(key) => {
              setDate(fromDateKey(key))
              goTo('home')
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
            {SCHEDULE_GROUPS.map(([frequency, title, sortKey]) => {
              const group = tasks.filter((t) => t.frequency === frequency)
              if (!sortKey) group.sort((a, b) => a.title.localeCompare(b.title))
              else group.sort((a, b) => sortKey(a) - sortKey(b) || a.title.localeCompare(b.title))
              return (
                <HomeSection key={frequency} title={title} count={group.length ? String(group.length) : null}>
                  {group.map((t) => (
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
                </HomeSection>
              )
            })}
            <div className="account">
              <span className="muted">Signed in as {user.email}</span>
              <button onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
          </main>
        )}
      </div>

      {!(tab === 'agenda' && agendaSetupNeeded) && (
        <button
          className="fab"
          aria-label={tab === 'agenda' ? 'Add agenda item' : tab === 'punch' ? 'Add punch card' : 'Add task'}
          onClick={() => (tab === 'agenda' ? setEditingAgenda('new') : setEditing(tab === 'punch' ? 'new-punch' : 'new'))}
        >
          +
        </button>
      )}

      {editing && (
        <TaskForm
          task={typeof editing === 'string' ? null : editing}
          defaultFrequency={editing === 'new-punch' ? 'punch' : 'daily'}
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
