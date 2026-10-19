import { formatDate } from './events-api'
import { ui } from './ui'

// Selector de evento; avisa al padre con el id elegido. La lista de eventos la carga el padre.
export default function EventSelect({ events, value, onChange, children }) {
  return (
    <div className={ui.toolbar}>
      <select
        className={ui.input}
        aria-label="Evento"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Seleccione evento</option>
        {events.map((ev) => (
          <option key={ev.idEvent} value={ev.idEvent}>
            {ev.name} — {formatDate(ev.eventDate)} · {ev.sede}
          </option>
        ))}
      </select>
      {children}
    </div>
  )
}
