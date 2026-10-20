import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddAttendeeForm from './add-attendee-form'
import { attendeesFileName, buildAttendeesCsv, downloadCsv } from './attendees-csv'
import EventSelect from './event-select'
import { api, formatDate } from './events-api'
import { readLastEvent, saveLastEvent } from './last-event'
import { ui } from './ui'

// Cada cuántos milisegundos se vuelve a pedir la lista para ver las marcas hechas desde otras puertas o equipos.
const REFRESH_MS = 10000

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'present', label: 'Presentes' },
]

// Módulo 2 — Asistencia: pensado para quien atiende la puerta. Recuerda el último evento, deja el buscador a mano y
// cada check se guarda al instante. La lista se actualiza sola para ver lo que marcan las demás puertas.
const EventsAssist = () => {
  const [events, setEvents] = useState([])
  const [eventsKey, setEventsKey] = useState(0)
  const [idEvent, setIdEvent] = useState(null)
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [pending, setPending] = useState(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [offline, setOffline] = useState(false)
  const [adding, setAdding] = useState(false)
  const searchRef = useRef(null)

  // Marcas en vuelo y cambios locales: evitan que un refresco lento pise un check recién hecho.
  const pendingRef = useRef(new Set())
  const mutations = useRef(0)

  // Eventos disponibles; el último usado en este navegador se abre solo si todavía existe.
  useEffect(() => {
    api.eventos().then((list) => {
      setEvents(list)
      setIdEvent((current) => {
        const wanted = current ?? readLastEvent()
        return list.some((e) => e.idEvent === wanted) ? wanted : null
      })
    }).catch((e) => setError(e.message))
  }, [eventsKey])

  const event = events.find((e) => e.idEvent === idEvent)

  const selectEvent = (id) => {
    setRows([])
    setLoaded(false)
    setError('')
    setNotice('')
    setOffline(false)
    setSearch('')
    setFilter('all')
    setAdding(false)
    setIdEvent(id)
    saveLastEvent(id)
  }

  // El evento ya no existe (otra persona lo finalizó): se limpia la pantalla.
  const eventGone = useCallback(() => {
    setIdEvent(null)
    saveLastEvent(null)
    setRows([])
    setLoaded(false)
    setEventsKey((k) => k + 1)
    setNotice('Este evento ya fue finalizado o no está disponible.')
  }, [])

  // Carga inicial y refresco automático. Un refresco que termina después de un cambio local se descarta.
  useEffect(() => {
    if (!idEvent) return undefined
    let cancelled = false
    const load = async (silent) => {
      const version = mutations.current
      try {
        const data = await api.asistentes(idEvent)
        if (cancelled || version !== mutations.current) return
        setRows((prev) => {
          const local = new Map(prev.map((r) => [r.idAttendee, r]))
          // Lo que se está guardando ahora mismo conserva su valor local hasta que el servidor responda.
          return data.rows.map((r) => (pendingRef.current.has(r.idAttendee) ? local.get(r.idAttendee) ?? r : r))
        })
        setLoaded(true)
        setOffline(false)
      } catch (e) {
        if (cancelled) return
        if (e.status === 404) eventGone()
        else if (silent) setOffline(true)
        else setError(e.message)
      }
    }
    load(false)
    const timer = setInterval(() => !document.hidden && load(true), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [idEvent, reloadKey, eventGone])

  // Al terminar de cargar la lista el cursor queda en el buscador.
  useEffect(() => {
    if (loaded) searchRef.current?.focus()
  }, [loaded, idEvent])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'pending' && r.attended) return false
      if (filter === 'present' && !r.attended) return false
      return !q || `${r.fullName} ${r.cedula} ${r.company ?? ''} ${r.jobTitle ?? ''} ${r.seat ?? ''}`.toLowerCase().includes(q)
    })
  }, [rows, search, filter])

  const emptyText = !loaded
    ? 'Cargando…'
    : rows.length === 0
      ? 'Este evento aún no tiene asistentes: se cargan en «Registrar evento».'
      : 'Sin resultados'

  const attendedCount = rows.filter((r) => r.attended).length
  const pendingCount = rows.length - attendedCount

  const setAttended = (id, attended) =>
    setRows((rs) => rs.map((r) => (r.idAttendee === id ? { ...r, attended } : r)))

  // Se marca de inmediato; si el servidor falla se revierte.
  const toggle = async (row) => {
    if (pendingRef.current.has(row.idAttendee)) return
    const next = !row.attended
    setError('')
    mutations.current += 1
    pendingRef.current.add(row.idAttendee)
    setAttended(row.idAttendee, next)
    setPending(new Set(pendingRef.current))
    try {
      await api.marcar(idEvent, row.idAttendee, next)
    } catch (e) {
      setAttended(row.idAttendee, !next)
      if (e.status === 404) eventGone()
      else setError(e.message)
    } finally {
      mutations.current += 1
      pendingRef.current.delete(row.idAttendee)
      setPending(new Set(pendingRef.current))
    }
  }

  const refreshAll = () => {
    mutations.current += 1
    setReloadKey((k) => k + 1)
  }

  return (
    <>
      <div className={ui.card}>
        <h2 className={ui.title}>Asistencia</h2>
        <EventSelect events={events} value={idEvent} onChange={selectEvent} />
        {events.length === 0 && !error && <p className={ui.hint}>No hay eventos disponibles para sus sedes.</p>}
        {error && <p className={ui.error}>{error}</p>}
        {notice && <p className={ui.success} role="status">{notice}</p>}
      </div>

      {idEvent && event && (
        <div className={ui.card}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-primary">{event.name}</h2>
              <p className={ui.hint}>{formatDate(event.eventDate)} · {event.sede}</p>
            </div>
            <div className="text-right" aria-live="polite">
              <p className="text-4xl font-bold text-accent">{attendedCount}<span className="text-2xl font-medium text-gray-500"> / {rows.length}</span></p>
              <p className={ui.hint}>presentes · {pendingCount} pendientes</p>
            </div>
          </div>

          <div className="sticky top-0 z-10 -mx-5 mt-4 border-y border-gray-200 bg-white px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={searchRef}
                type="search"
                className={`${ui.input} min-w-0 flex-1 basis-full py-3 text-base sm:basis-64`}
                placeholder="Buscar por nombre, cédula, empresa, cargo o asiento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {/* En teléfono los textos se acortan para que ambos botones quepan en una sola fila. */}
              <button
                className={`${ui.btnOutline} flex-1 py-3 sm:flex-none`}
                onClick={() => setAdding(!adding)}
                aria-expanded={adding}
                aria-label="Agregar asistente"
              >
                <span className="sm:hidden">Agregar</span>
                <span className="hidden sm:inline">Agregar asistente</span>
              </button>
              <button
                className={`${ui.btnOutline} flex-1 py-3 sm:flex-none`}
                onClick={() => downloadCsv(attendeesFileName(event.name), buildAttendeesCsv(rows))}
                disabled={attendedCount === 0}
                aria-label="Exportar asistentes (CSV)"
              >
                <span className="sm:hidden">Exportar</span>
                <span className="hidden sm:inline">Exportar asistentes (CSV)</span>
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`rounded-full border px-4 py-1.5 text-sm ${
                    filter === f.key ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white text-gray-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className={`ml-auto text-sm ${offline ? 'text-red-600' : 'text-gray-500'}`} role="status">
                {offline ? 'Sin conexión: reintentando…' : 'Se actualiza solo'}
              </span>
            </div>
          </div>

          {adding && (
            <AddAttendeeForm
              idEvent={idEvent}
              onCancel={() => setAdding(false)}
              onAdded={(a) => {
                setAdding(false)
                setNotice(`Se agregó a ${a.fullName}.`)
                refreshAll()
              }}
            />
          )}

          {/* Teléfono y tablet vertical: tarjetas con el check grande. Pantallas anchas: tabla completa. */}
          <ul className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200 md:hidden">
            {visible.map((r) => (
              <li key={r.idAttendee}>
                <button
                  type="button"
                  onClick={() => toggle(r)}
                  disabled={pending.has(r.idAttendee)}
                  aria-pressed={r.attended}
                  aria-label={`Asistencia de ${r.fullName}`}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left ${r.attended ? 'bg-green-50' : 'bg-white'}`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-800">{r.fullName}</span>
                    <span className="block text-sm text-gray-600">
                      {r.cedula}{r.seat ? ` · ${r.seat}` : ''}
                    </span>
                    {r.jobTitle && <span className="block truncate text-xs text-gray-500">{r.jobTitle}</span>}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 text-xl ${
                      r.attended ? 'border-accent bg-accent text-white' : 'border-gray-300 bg-white text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className={`${ui.hint} ${ui.center} px-3 py-6`}>{emptyText}</li>}
          </ul>

          <div className={`${ui.tableWrap} mt-3 hidden md:block`}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th className={ui.th}>Nombre</th>
                  <th className={ui.th}>Cédula</th>
                  <th className={ui.th}>Empresa</th>
                  <th className={ui.th}>Cargo</th>
                  <th className={ui.th}>Asiento</th>
                  <th className={`${ui.th} ${ui.center}`}>Asistió</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.idAttendee} className={r.attended ? 'bg-green-50' : ''}>
                    <td className={`${ui.td} py-3 font-medium`}>{r.fullName}</td>
                    <td className={`${ui.td} py-3`}>{r.cedula}</td>
                    <td className={`${ui.td} py-3`}>{r.company}</td>
                    <td className={`${ui.td} py-3`}>{r.jobTitle}</td>
                    <td className={`${ui.td} py-3`}>{r.seat}</td>
                    {/* Toda la celda es el botón: es fácil acertar con el dedo en una tablet. */}
                    <td className={`${ui.td} ${ui.center} w-28 cursor-pointer`} onClick={() => toggle(r)}>
                      <input
                        type="checkbox"
                        className="h-7 w-7 cursor-pointer accent-accent"
                        aria-label={`Asistencia de ${r.fullName}`}
                        checked={r.attended}
                        disabled={pending.has(r.idAttendee)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(r)}
                      />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan="6" className={`${ui.td} ${ui.center} ${ui.hint} py-6`}>{emptyText}</td></tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </>
  )
}

export default EventsAssist
