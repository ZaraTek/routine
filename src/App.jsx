import { useCallback, useEffect, useMemo, useState } from 'react'
import { isConfigured, supabase } from './supabase'
import { addDays, describeSchedule, isDueOn, toDateKey } from './schedule'
import Auth from './Auth'
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
  const [done, setDone] = useState(new Set()) // task ids completed on `date`
  const [date, setDate] = useState(() => new Date())
  const [tab, setTab] = useState('today')
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const dateKey = toDateKey(date)

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
      .select('task_id')
      .eq('date', dateKey)
      .then(({ data, error }) => {
        if (stale) return
        if (error) setError(error.message)
        else setDone(new Set(data.map((r) => r.task_id)))
      })
    return () => {
      stale = true
    }
  }, [dateKey])

  const due = useMemo(() => tasks.filter((t) => isDueOn(t, date)), [tasks, date])
  const completed = due.filter((t) => done.has(t.id)).length

  const toggle = useCallback(
    async (task) => {
      const wasDone = done.has(task.id)
      setDone((cur) => {
        const next = new Set(cur)
        wasDone ? next.delete(task.id) : next.add(task.id)
        return next
      })
      const { error } = wasDone
        ? await supabase.from('completions').delete().eq('task_id', task.id).eq('date', dateKey)
        : await supabase.from('completions').upsert({ task_id: task.id, date: dateKey }, { onConflict: 'task_id,date' })
      if (error) {
        setError(error.message)
        setDone((cur) => {
          const next = new Set(cur)
          wasDone ? next.add(task.id) : next.delete(task.id)
          return next
        })
      }
    },
    [done, dateKey],
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

  return (
    <div className="app">
      <header>
        <nav className="tabs">
          <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
            Checklist
          </button>
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
            All tasks
          </button>
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()} title={user.email}>
          Sign out
        </button>
      </header>

      {error && (
        <p className="error banner" onClick={() => setError('')}>
          {error} (tap to dismiss)
        </p>
      )}

      {tab === 'today' ? (
        <main>
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
            <p className="empty">{tasks.length ? 'Nothing due this day 🎉' : 'No tasks yet — add your first one.'}</p>
          ) : (
            <ul className="list">
              {due.map((t) => (
                <li key={t.id} className="check-row">
                  <label className={done.has(t.id) ? 'check done' : 'check'}>
                    <input type="checkbox" checked={done.has(t.id)} onChange={() => toggle(t)} />
                    <span className="box" aria-hidden />
                    <span className="label">{t.title}</span>
                  </label>
                  <button className="edit" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>
                    <PencilIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {due.length > 0 && completed === due.length && <p className="center muted">All done ✓</p>}
        </main>
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
        </main>
      )}

      <button className="fab" aria-label="Add task" onClick={() => setEditing('new')}>
        +
      </button>

      {editing && (
        <TaskForm
          task={editing === 'new' ? null : editing}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
