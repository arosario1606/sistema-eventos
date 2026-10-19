import { useState } from 'react'
import { api } from './events-api'
import { ui } from './ui'

const today = () => new Date().toISOString().slice(0, 10)

// Paso 1: nombre, fecha y la sede donde se realiza el evento (solo sedes activas con permiso del usuario).
export default function NewEventForm({ sedes, onCreated }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(today())
  const [idSede, setIdSede] = useState(sedes.length === 1 ? String(sedes[0].idSede) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const event = await api.crearEvento({ name, eventDate: date, idSede: Number(idSede) })
      setName('')
      onCreated(event.idEvent)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={ui.card} onSubmit={submit}>
      <h2 className={ui.title}>1. Registrar evento</h2>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <label className={ui.field}>
          Nombre del evento
          <input className={ui.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required />
        </label>
        <label className={ui.field}>
          Fecha del evento
          <input className={ui.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className={ui.field}>
          Sede
          <select className={ui.input} value={idSede} onChange={(e) => setIdSede(e.target.value)} required>
            <option value="">Seleccione sede</option>
            {sedes.map((s) => (
              <option key={s.idSede} value={s.idSede}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>
      {sedes.length === 0 && <p className={ui.hint}>No tiene sedes habilitadas para crear eventos.</p>}
      {error && <p className={ui.error}>{error}</p>}
      <div className={ui.toolbar}>
        <button className={ui.btnPrimary} disabled={saving || !idSede}>{saving ? 'Guardando…' : 'Crear evento'}</button>
      </div>
    </form>
  )
}
