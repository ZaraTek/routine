import { useState } from 'react'
import { addDays, fromDateKey, toDateKey, weekStart } from './schedule'

// Group open items by how soon they're due; done items go last
export function groupAgenda(items, todayKey) {
  const tomorrowKey = toDateKey(addDays(fromDateKey(todayKey), 1))
  const weekEndKey = toDateKey(addDays(weekStart(fromDateKey(todayKey)), 6))
  const groups = { overdue: [], today: [], tomorrow: [], week: [], later: [], done: [] }
  const sorted = [...items].sort((a, b) =>
    (a.due_date + (a.due_time ?? '99')).localeCompare(b.due_date + (b.due_time ?? '99')),
  )
  for (const item of sorted) {
    if (item.done_at) groups.done.push(item)
    else if (item.due_date < todayKey) groups.overdue.push(item)
    else if (item.due_date === todayKey) groups.today.push(item)
    else if (item.due_date === tomorrowKey) groups.tomorrow.push(item)
    else if (item.due_date <= weekEndKey) groups.week.push(item)
    else groups.later.push(item)
  }
  groups.done.reverse() // most recently due first
  return groups
}

const SECTIONS = [
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['week', 'Later this week'],
  ['later', 'Coming up'],
]

function formatTime(t) {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dueLabel(item, todayKey) {
  const days = Math.round((fromDateKey(item.due_date) - fromDateKey(todayKey)) / 86400000)
  const date = fromDateKey(item.due_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = item.due_time ? ` · ${formatTime(item.due_time)}` : ''
  if (item.done_at) return `${date}${time}`
  if (days < 0) return `${date}${time} · ${-days} day${days === -1 ? '' : 's'} late`
  if (days > 1) return `${date}${time} · in ${days} days`
  return `${date}${time}`
}

export default function Agenda({ items, todayKey, setupNeeded, onToggle, onEdit }) {
  const [showDone, setShowDone] = useState(false)

  if (setupNeeded) {
    return (
      <main>
        <h1>Agenda</h1>
        <p className="empty">
          The agenda needs one more database table. Run <code>supabase/003_agenda.sql</code> in the Supabase SQL Editor,
          then reload.
        </p>
      </main>
    )
  }

  const groups = groupAgenda(items, todayKey)
  const open = items.length - groups.done.length

  return (
    <main>
      <h1>Agenda</h1>
      <p className="muted agenda-sub">One-off tasks and assignments</p>
      {open === 0 && (
        <p className="empty">{items.length ? 'All caught up 🎉' : 'Nothing on your agenda. Tap + to add an assignment.'}</p>
      )}

      {SECTIONS.map(
        ([key, title]) =>
          groups[key].length > 0 && (
            <section key={key} className={`agenda-group ${key}`}>
              <h2 className="section-title">
                {title} <span>{groups[key].length}</span>
              </h2>
              <ul className="list">
                {groups[key].map((item) => (
                  <AgendaRow key={item.id} item={item} todayKey={todayKey} onToggle={onToggle} onEdit={onEdit} />
                ))}
              </ul>
            </section>
          ),
      )}

      {groups.done.length > 0 && (
        <section className="agenda-group done">
          <button className="link section-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            {showDone ? 'Hide' : 'Show'} done ({groups.done.length})
          </button>
          {showDone && (
            <ul className="list">
              {groups.done.map((item) => (
                <AgendaRow key={item.id} item={item} todayKey={todayKey} onToggle={onToggle} onEdit={onEdit} />
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}

function AgendaRow({ item, todayKey, onToggle, onEdit }) {
  const done = Boolean(item.done_at)
  return (
    <li className="check-row">
      <label className={done ? 'check done' : 'check'}>
        <input type="checkbox" checked={done} onChange={() => onToggle(item)} />
        <span className="box" aria-hidden />
        <span className="agenda-text">
          <span className="label">{item.title}</span>
          <span className={!done && item.due_date < todayKey ? 'agenda-due late' : 'agenda-due'}>{dueLabel(item, todayKey)}</span>
          {item.notes && <span className="agenda-notes">{item.notes}</span>}
        </span>
      </label>
      <button className="edit" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </li>
  )
}

export function AgendaForm({ item, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [dueDate, setDueDate] = useState(item?.due_date ?? toDateKey(new Date()))
  const [dueTime, setDueTime] = useState(item?.due_time?.slice(0, 5) ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')

  const invalid = !title.trim() || !dueDate

  function submit(e) {
    e.preventDefault()
    if (invalid) return
    onSave({ title: title.trim(), due_date: dueDate, due_time: dueTime || null, notes: notes.trim() || null })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{item ? 'Edit agenda item' : 'New agenda item'}</h2>
        <label>
          What
          <input autoFocus={!item} placeholder="e.g. Chem problem set 4" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </label>
          <label>
            Time (optional)
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </label>
        </div>
        <label>
          Notes (optional)
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Links, details…" />
        </label>
        <div className="actions">
          {item && (
            <button type="button" className="danger" onClick={() => confirm(`Delete "${item.title}"?`) && onDelete()}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={invalid}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
