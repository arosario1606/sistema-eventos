import { useEffect, useState } from 'react'
import EventSelect from './event-select'
import { api, formatDate } from './events-api'
import FileUpload from './file-upload'
import FinalizeModal from './finalize-modal'
import NewEventForm from './new-event-form'
import { readLastEvent, saveLastEvent } from './last-event'
import { ui } from './ui'

// Módulo 1 — Registrar evento: crea el evento, carga su lista de asistentes y lo finaliza al terminar.
// (La asistencia en sí se marca en el módulo «Asistencia», pensado para quien atiende la puerta.)
const EventsReg = () => {
  const [sedes, setSedes] = useState([])
  const [events, setEvents] = useState([])
  const [eventsKey, setEventsKey] = useState(0)
  const [idEvent, setIdEvent] = useState(null)
  const [info, setInfo] = useState(null)
  const [infoKey, setInfoKey] = useState(0)
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.me().then((me) => setSedes(me.sedes)).catch((e) => setError(e.message))
  }, [])

  // Al cargar la lista se recupera el último evento usado, si todavía existe.
  useEffect(() => {
    api.eventos().then((list) => {
      setEvents(list)
      setIdEvent((current) => {
        const wanted = current ?? readLastEvent()
        return list.some((e) => e.idEvent === wanted) ? wanted : null
      })
    }).catch((e) => setError(e.message))
  }, [eventsKey])

  useEffect(() => {
    if (!idEvent) return
    api.evento(idEvent).then(setInfo).catch(() => setInfo(null))
  }, [idEvent, infoKey])

  // Solo se muestra la información del evento elegido (no la del anterior mientras carga la nueva).
  const current = info?.idEvent === idEvent ? info : null

  const selectEvent = (id) => {
    setNotice('')
    setIdEvent(id)
    saveLastEvent(id)
  }

  return (
    <>
      {error && <p className={ui.error}>{error}</p>}
      <NewEventForm
        sedes={sedes}
        onCreated={(id) => {
          setEventsKey((k) => k + 1)
          selectEvent(id)
          setNotice('Evento creado. Ahora cargue su lista de asistentes.')
        }}
      />

      <div className={ui.card}>
        <h2 className={ui.title}>Evento a configurar</h2>
        <EventSelect events={events} value={idEvent} onChange={selectEvent} />
        {notice && <p className={ui.success} role="status">{notice}</p>}
      </div>

      {idEvent && current && (
        <div className={ui.card}>
          <h2 className={ui.title}>2. Cargar asistentes de «{current.name}»</h2>
          <p className={ui.hint}>{formatDate(current.eventDate)} · Sede: {current.sede}</p>
          <FileUpload
            label="Lista de asistentes (CSV)"
            help="Columnas (con encabezado o, si no lo trae, en este orden): cédula; nombre completo; empresa; cargo; asiento; grupo. Solo cédula y nombre son obligatorios. Si vuelve a subir el archivo se actualizan los datos, pero no se pierden las asistencias ya marcadas."
            onUpload={async (f) => {
              const result = await api.subirAsistentes(idEvent, f)
              setInfoKey((k) => k + 1)
              setEventsKey((k) => k + 1)
              return result
            }}
            summary={(r) => `${r.created} asistentes nuevos y ${r.updated} actualizados.`}
          />
          <div className={ui.stats}>
            <span>Invitados cargados: <b>{current.attendees}</b></span>
            <span>Con asistencia marcada: <b>{current.attended}</b></span>
          </div>
          <div className={ui.toolbar}>
            <button className={ui.btnDanger} onClick={() => setFinalizing(true)}>Finalizar evento</button>
            <span className={ui.hint}>Borra el evento y su lista de forma definitiva (antes permite descargar a los asistentes).</span>
          </div>
        </div>
      )}

      {finalizing && current && (
        <FinalizeModal
          event={current}
          onClose={() => setFinalizing(false)}
          onDone={() => {
            setFinalizing(false)
            setIdEvent(null)
            saveLastEvent(null)
            setEventsKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}

export default EventsReg
