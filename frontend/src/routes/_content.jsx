import { createFileRoute, Outlet } from '@tanstack/react-router'

// SOLO DESARROLLO: simula el layout de la intranet (src/routes/_content.jsx + Content).
// Al integrar NO se copia este archivo: se usa el de la intranet.
function DevLayout() {
  return (
    <>
      <header className="flex flex-wrap items-center gap-4 bg-white px-6 py-3 shadow-xl">
        <span className="font-semibold text-primary">Eventos (modo desarrollo)</span>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <Outlet />
      </main>
    </>
  )
}

export const Route = createFileRoute('/_content')({
  component: DevLayout,
})
