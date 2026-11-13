import { useEffect, useState } from 'react';

// Cuerpo que devuelve GET /api/salud.
interface RespuestaSalud {
  servidor: 'ok';
  bd: 'conectada' | 'sin conexión';
  base?: string;
  hora?: string;
  tablas?: number;
}

type Salud =
  { estado: 'cargando' } | { estado: 'sin-servidor' } | ({ estado: 'listo' } & RespuestaSalud);

// Pantalla mínima del proyecto base: muestra si el servidor y la base responden.
export default function App() {
  const [salud, setSalud] = useState<Salud>({ estado: 'cargando' });

  useEffect(() => {
    let vigente = true;

    fetch('/api/salud')
      .then(async (respuesta) => {
        const cuerpo = (await respuesta.json()) as RespuestaSalud;
        if (vigente) setSalud({ estado: 'listo', ...cuerpo });
      })
      .catch(() => {
        if (vigente) setSalud({ estado: 'sin-servidor' });
      });

    return () => {
      vigente = false;
    };
  }, []);

  const servidorOk = salud.estado === 'listo';
  const bdOk = servidorOk && salud.bd === 'conectada';

  return (
    <main className="mx-auto min-h-screen max-w-xl bg-sky-50 px-4 pb-12 text-sky-950">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-900 via-sky-600 to-sky-400 text-white shadow-lg shadow-sky-500/25">
        <h1 className="px-6 pt-10 text-4xl font-bold tracking-tight">Relevo</h1>
        <p className="px-6 pt-1 pb-8 text-sky-100">Control de préstamos de equipo</p>
      </header>

      {salud.estado === 'cargando' ? (
        <p className="mt-8 text-sky-700">Comprobando el servidor para el Issue #4…</p>
      ) : (
        <ul className="mt-8 grid list-none gap-3 p-0">
          <Estado
            nombre="Servidor"
            ok={servidorOk}
            texto={servidorOk ? 'En marcha' : 'Sin respuesta'}
          />
          <Estado
            nombre="Base de datos"
            ok={bdOk}
            texto={
              bdOk
                ? `Conectada a "${salud.base}" (${salud.tablas} tablas en el schema relevo)`
                : 'Sin conexión'
            }
          />
        </ul>
      )}
    </main>
  );
}

function Estado({ nombre, ok, texto }: { nombre: string; ok: boolean; texto: string }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-l-4 bg-white px-5 py-4 shadow-sm shadow-sky-500/10 transition hover:-translate-y-0.5 hover:shadow-md ${
        ok ? 'border-sky-200 border-l-emerald-500' : 'border-rose-200 border-l-rose-500 bg-rose-50'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-3 shrink-0 rounded-full ring-4 ${ok ? 'bg-emerald-500 ring-emerald-100' : 'bg-rose-500 ring-rose-100'}`}
      />
      <span>
        <strong className="text-sky-900">{nombre}:</strong> {texto}
      </span>
    </li>
  );
}
