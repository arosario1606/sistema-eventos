import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddAttendeeForm from './add-attendee-form'
import { attendeesFileName, buildAttendeesCsv, downloadCsv } from './attendees-csv'
import EventSelect from './event-select'
import { api, formatDate } from './events-api'
import FileUpload from './file-upload'
import FinalizeModal from './finalize-modal'
import MarkAllModal from './mark-all-modal'
import NewEventForm from './new-event-form'
import { ui } from './ui'

// Cada cuántos milisegundos se vuelve a pedir la lista para ver las marcas hechas desde otras puertas o equipos.
const REFRESH_MS = 10000

// Eventos: crear el evento, cargar su lista de asistentes y marcar la asistencia (cada check se guarda al instante).
const Events = () => {
  const [sedes, setSedes] = useState([])
  const [events, setEvents] = useState([])
  const [eventsKey, setEventsKey] = useState(0)
  const [idEvent, setIdEvent] = useState(null)
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [offline, setOffline] = useState(false)
  const [panel, setPanel] = useState(null) // 'new' | 'add' | null
  const [modal, setModal] = useState(null) // 'markAll' | 'finalize' | null

  // Marcas en vuelo y cambios locales: evitan que un refresco lento pise un check recién hecho.
  const pendingRef = useRef(new Set())
  const mutations = useRef(0)

  useEffect(() => {
    api.me().then((me) => setSedes(me.sedes)).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    api.eventos().then(setEvents).catch((e) => setError(e.message))
  }, [eventsKey])

  const event = events.find((e) => e.idEvent === idEvent)

  const selectEvent = (id) => {
    setRows([])
    setLoaded(false)
    setError('')
    setNotice('')
    setOffline(false)
    setSearch('')
    setPanel(null)
    setIdEvent(id)
  }

  // El evento ya no existe (otra persona lo finalizó): se limpia la pantalla.
  const eventGone = useCallback(() => {
    setIdEvent(null)
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      `${r.fullName} ${r.cedula} ${r.company ?? ''} ${r.jobTitle ?? ''} ${r.seat ?? ''}`.toLowerCase().includes(q))
  }, [rows, search])

  const attendedCount = rows.filter((r) => r.attended).length
  const pendingCount = rows.length - attendedCount

  const setAttended = (id, attended) =>
    setRows((rs) => rs.map((r) => (r.idAttendee === id ? { ...r, attended } : r)))

  // Se marca de inmediato; si el servidor falla se revierte.
  const toggle = async (row) => {
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
    setEventsKey((k) => k + 1)
  }

  const markedAll = (marked) => {
    setModal(null)
    setNotice(marked === 1 ? 'Se marcó 1 persona como asistente.' : `Se marcaron ${marked} personas como asistentes.`)
    refreshAll()
  }

  const added = (attendee) => {
    setPanel(null)
    setNotice(`Se agregó a ${attendee.fullName}.`)
    refreshAll()
  }

  const finished = () => {
    setModal(null)
    setIdEvent(null)
    setRows([])
    setLoaded(false)
    setNotice('')
    setEventsKey((k) => k + 1)
  }

  return (
    <>
      <div className={ui.card}>
        <h2 className={ui.title}>Eventos</h2>
        <EventSelect events={events} value={idEvent} onChange={selectEvent}>
          <button className={ui.btnPrimary} onClick={() => setPanel(panel === 'new' ? null : 'new')}>Nuevo evento</button>
        </EventSelect>
        {panel === 'new' && (
          <NewEventForm
            sedes={sedes}
            onCancel={() => setPanel(null)}
            onCreated={(id) => {
              setEventsKey((k) => k + 1)
              selectEvent(id)
            }}
          />
        )}
        {error && <p className={ui.error}>{error}</p>}
        {notice && <p className={ui.success} role="status">{notice}</p>}
      </div>

      {idEvent && event && (
        <>
          <div className={ui.card}>
            <h2 className={ui.title}>Asistentes de «{event.name}»</h2>
            <p className={ui.hint}>{formatDate(event.eventDate)} · Sede: {event.sede}</p>
            <FileUpload
              label="Lista de asistentes (CSV)"
              help="Columnas (con encabezado o, si no lo trae, en este orden): cédula; nombre completo; empresa; cargo; asiento; grupo. Solo cédula y nombre son obligatorios. Si vuelve a subir el archivo se actualizan los datos, pero no se pierden las asistencias ya marcadas."
              onUpload={async (f) => {
                const result = await api.subirAsistentes(idEvent, f)
                refreshAll()
                return result
              }}
              summary={(r) => `${r.created} asistentes nuevos y ${r.updated} actualizados.`}
            />
          </div>

          <div className={ui.card}>
            <h2 className={ui.title}>Listado de asistencia</h2>
            <div className={ui.toolbar}>
              <input
                type="search"
                className={`${ui.input} w-full sm:w-80`}
                placeholder="Buscar por nombre, cédula, empresa, cargo o asiento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className={ui.btnOutline} onClick={() => setPanel(panel === 'add' ? null : 'add')}>Agregar asistente</button>
              <button className={ui.btnOutline} onClick={() => setModal('markAll')} disabled={pendingCount === 0}>
                Marcar a todos como asistentes
              </button>
              <button
                className={ui.btnOutline}
                onClick={() => downloadCsv(attendeesFileName(event.name), buildAttendeesCsv(rows))}
                disabled={attendedCount === 0}
              >
                Exportar asistentes (CSV)
              </button>
              <button className={ui.btnDanger} onClick={() => setModal('finalize')}>Finalizar evento</button>
            </div>
            {panel === 'add' && <AddAttendeeForm idEvent={idEvent} onAdded={added} onCancel={() => setPanel(null)} />}
            <div className={ui.stats}>
              <span>Cantidad asistentes: <b>{attendedCount}</b></span>
              <span>Invitados: <b>{rows.length}</b></span>
              <span className={offline ? 'text-red-600' : ''} role="status">
                {offline ? 'Sin conexión: reintentando…' : 'Se actualiza solo cada 10 s'}
              </span>
            </div>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th className={ui.th}>Cédula</th>
                    <th className={ui.th}>Nombre</th>
                    <th className={ui.th}>Empresa</th>
                    <th className={ui.th}>Cargo</th>
                    <th className={ui.th}>Asiento</th>
                    <th className={ui.th}>Grupo</th>
                    <th className={`${ui.th} ${ui.center}`}>Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.idAttendee} className={r.attended ? 'bg-green-50' : ''}>
                      <td className={ui.td}>{r.cedula}</td>
                      <td className={ui.td}>{r.fullName}</td>
                      <td className={ui.td}>{r.company}</td>
                      <td className={ui.td}>{r.jobTitle}</td>
                      <td className={ui.td}>{r.seat}</td>
                      <td className={ui.td}>{r.companyGroup}</td>
                      <td className={`${ui.td} ${ui.center}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-accent"
                          aria-label={`Asistencia de ${r.fullName}`}
                          checked={r.attended}
                          disabled={pending.has(r.idAttendee)}
                          onChange={() => toggle(r)}
                        />
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan="7" className={`${ui.td} ${ui.center} ${ui.hint}`}>
                        {loaded ? (rows.length === 0 ? 'Aún no hay asistentes: suba el archivo o agregue uno.' : 'Sin resultados') : 'Cargando…'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modal === 'markAll' && (
        <MarkAllModal idEvent={idEvent} total={rows.length} pending={pendingCount} onClose={() => setModal(null)} onDone={markedAll} />
      )}
      {modal === 'finalize' && event && (
        <FinalizeModal event={event} rows={rows} onClose={() => setModal(null)} onDone={finished} />
      )}
    </>
  )
}

export default Events
