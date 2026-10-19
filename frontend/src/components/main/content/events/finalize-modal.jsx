import { useEffect, useRef, useState } from 'react'
import { api } from './events-api'
import { attendeesFileName, buildAttendeesCsv, downloadCsv } from './attendees-csv'
import { ui } from './ui'

// Confirmación para finalizar un evento: borra el evento y su lista de forma definitiva. Ofrece descargar antes
// a los asistentes en CSV (única copia que queda fuera de la base de datos). Se confirma con un botón, sin escribir nada.
export default function FinalizeModal({ event, rows, onClose, onDone }) {
  const [phase, setPhase] = useState('confirm') // confirm | deleting | done
  const [error, setError] = useState('')
  const doneTimer = useRef(null)
  const attended = rows.filter((r) => r.attended).length

  useEffect(() => () => clearTimeout(doneTimer.current), [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && phase === 'confirm' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  const confirm = async () => {
    setError('')
    setPhase('deleting')
    try {
      await api.finalizar(event.idEvent)
      setPhase('done')
      doneTimer.current = setTimeout(onDone, 1800)
    } catch (e) {
      setError(e.message)
      setPhase('confirm')
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="finalize-title" className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        {phase === 'done' ? (
          <div className="py-8 text-center" aria-live="polite">
            <div className="relative mx-auto mb-4 h-20 w-20">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-30" />
              <span className="absolute inset-0 flex animate-bounce items-center justify-center rounded-full bg-accent text-4xl text-white">✓</span>
            </div>
            <h2 className="text-xl font-semibold text-accent">Evento finalizado</h2>
            <p className={ui.hint}>Los datos del evento fueron eliminados.</p>
          </div>
        ) : (
          <>
            <h2 id="finalize-title" className="text-xl font-semibold text-red-600">Finalizar evento «{event.name}»</h2>
            <p className="mt-2 text-sm text-gray-800">
              Se <b>borrarán de forma definitiva</b> el evento y sus <b>{rows.length} invitados</b> ({attended} con asistencia
              marcada). Esta acción no se puede deshacer.
            </p>
            <div className="my-4 rounded-md bg-sky-50 p-3">
              <p className={ui.hint}>Descargue a los asistentes antes de finalizar: después no habrá forma de recuperarlos.</p>
              <button
                type="button"
                className={`${ui.btnOutline} mt-2`}
                disabled={attended === 0}
                onClick={() => downloadCsv(attendeesFileName(event.name), buildAttendeesCsv(rows))}
              >
                Descargar asistentes (CSV)
              </button>
              {attended === 0 && <span className={`${ui.hint} ml-2`}>Aún no hay asistentes marcados.</span>}
            </div>
            {error && <p className={ui.error}>{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" className={ui.btnOutline} onClick={onClose} disabled={phase === 'deleting'} autoFocus>Cancelar</button>
              <button type="button" className={ui.btnDanger} onClick={confirm} disabled={phase === 'deleting'}>
                {phase === 'deleting' ? 'Borrando…' : 'Finalizar y borrar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
