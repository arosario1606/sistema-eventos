import { useState } from 'react'
import { api } from './events-api'
import { ui } from './ui'

const EMPTY = { cedula: '', fullName: '', company: '', jobTitle: '', seat: '', companyGroup: '' }

// Alta manual de alguien que no venía en el archivo. Si el servidor lo acepta, vuelve a la lista con su fila.
export default function AddAttendeeForm({ idEvent, onAdded, onCancel }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      onAdded(await api.agregarAsistente(idEvent, form))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="my-4 rounded-md border border-gray-200 p-4" onSubmit={submit}>
      <h3 className="font-semibold text-gray-800">Agregar asistente</h3>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <label className={ui.field}>
          Cédula *
          <input className={ui.input} value={form.cedula} onChange={set('cedula')} maxLength={50} required autoFocus />
        </label>
        <label className={`${ui.field} sm:col-span-2`}>
          Nombre completo *
          <input className={ui.input} value={form.fullName} onChange={set('fullName')} maxLength={150} required />
        </label>
        <label className={ui.field}>
          Empresa
          <input className={ui.input} value={form.company} onChange={set('company')} maxLength={150} />
        </label>
        <label className={ui.field}>
          Cargo
          <input className={ui.input} value={form.jobTitle} onChange={set('jobTitle')} maxLength={150} />
        </label>
        <label className={ui.field}>
          Asiento
          <input className={ui.input} value={form.seat} onChange={set('seat')} maxLength={40} />
        </label>
        <label className={ui.field}>
          Grupo (número)
          <input className={ui.input} type="number" min="0" step="1" value={form.companyGroup} onChange={set('companyGroup')} />
        </label>
      </div>
      {error && <p className={ui.error}>{error}</p>}
      <div className={ui.toolbar}>
        <button className={ui.btnPrimary} disabled={saving}>{saving ? 'Guardando…' : 'Agregar'}</button>
        <button type="button" className={ui.btnOutline} onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </form>
  )
}
