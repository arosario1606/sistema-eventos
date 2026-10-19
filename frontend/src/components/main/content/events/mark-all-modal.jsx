import { useEffect, useState } from 'react'
import { api } from './events-api'
import { ui } from './ui'

// Confirmación para marcar a todos como presentes.
export default function MarkAllModal({ idEvent, total, pending, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const confirm = async () => {
    setError('')
    setBusy(true)
    try {
      onDone((await api.marcarTodos(idEvent)).marked)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="markall-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="markall-title" className="text-xl font-semibold text-primary">Marcar a todos como asistentes</h2>
        <p className="mt-2 text-sm text-gray-800">
          Se {pending === 1 ? 'marcará como asistente' : 'marcarán como asistentes'}{' '}
          <b>{pending === 1 ? '1 persona pendiente' : `${pending} personas pendientes`}</b> de las {total} del evento.
          Quienes ya estaban marcados no cambian.
        </p>
        {error && <p className={ui.error}>{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className={ui.btnOutline} onClick={onClose} disabled={busy} autoFocus>Cancelar</button>
          <button type="button" className={ui.btnPrimary} onClick={confirm} disabled={busy}>
            {busy ? 'Marcando…' : 'Sí, marcar a todos'}
          </button>
        </div>
      </div>
    </div>
  )
}
