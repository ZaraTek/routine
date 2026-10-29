import { useState } from 'react'
import { WEEKDAYS, WEEKDAY_NAMES } from './schedule'

export default function TaskForm({ task, defaultFrequency = 'daily', onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [frequency, setFrequency] = useState(task?.frequency ?? defaultFrequency)
  const [weekdays, setWeekdays] = useState(task?.weekdays ?? [new Date().getDay()])
  const [monthDay, setMonthDay] = useState(task?.month_day ?? new Date().getDate())
  const [punchTarget, setPunchTarget] = useState(task?.punch_target ?? 3)

  function toggleDay(d) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  }

  const invalid = !title.trim() || (frequency === 'weekly' && weekdays.length === 0)

  function submit(e) {
    e.preventDefault()
    if (invalid) return
    const fields = {
      title: title.trim(),
      frequency,
      weekdays: frequency === 'weekly' ? weekdays : [],
      month_day: frequency === 'monthly' ? Number(monthDay) : null,
    }
    // only send punch_target when punch cards are involved, so other tasks still save
    // if the punch-card migration hasn't been run yet
    if (frequency === 'punch' || task?.frequency === 'punch') {
      fields.punch_target = frequency === 'punch' ? Number(punchTarget) : null
    }
    onSave(fields)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{task ? 'Edit task' : 'New task'}</h2>

        <label>
          Task
          <input
            autoFocus={!task}
            placeholder="e.g. Take creatine"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="field">
          <span>Repeats</span>
          <div className="segmented">
            {['daily', 'weekly', 'monthly', 'punch'].map((f) => (
              <button
                type="button"
                key={f}
                className={frequency === f ? 'active' : ''}
                onClick={() => setFrequency(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {frequency === 'punch' && (
          <div className="field">
            <span>Times per week</span>
            <div className="days">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-pressed={punchTarget === n}
                  className={punchTarget === n ? 'active' : ''}
                  onClick={() => setPunchTarget(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <small className="muted">Punch any day you do it. Weeks run Monday to Sunday; each missed punch is a strike.</small>
          </div>
        )}

        {frequency === 'weekly' && (
          <div className="field">
            <span>On</span>
            <div className="days">
              {WEEKDAYS.map((label, d) => (
                <button
                  type="button"
                  key={d}
                  aria-label={WEEKDAY_NAMES[d]}
                  aria-pressed={weekdays.includes(d)}
                  className={weekdays.includes(d) ? 'active' : ''}
                  onClick={() => toggleDay(d)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {frequency === 'monthly' && (
          <label>
            Day of month
            <select value={monthDay} onChange={(e) => setMonthDay(e.target.value)}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {monthDay > 28 && <small className="muted">Shorter months use their last day.</small>}
          </label>
        )}

        <div className="actions">
          {task && (
            <button
              type="button"
              className="danger"
              onClick={() => confirm(`Delete "${task.title}"?`) && onDelete()}
            >
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
