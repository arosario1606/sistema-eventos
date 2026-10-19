// Recuerda el último evento elegido en este navegador, para que quien atiende la puerta entre y encuentre su lista.
// Es solo una comodidad: si el navegador bloquea el almacenamiento, todo funciona igual sin recordar.
const KEY = 'eventos:ultimo-evento'

export function readLastEvent() {
  try {
    const id = Number(localStorage.getItem(KEY))
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function saveLastEvent(id) {
  try {
    if (id) localStorage.setItem(KEY, String(id))
    else localStorage.removeItem(KEY)
  } catch {
    // sin almacenamiento disponible: no se recuerda
  }
}
