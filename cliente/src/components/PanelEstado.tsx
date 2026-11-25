import { useSalud } from '../useSalud.ts';

// Hora local de Guatemala: las fechas viajan en UTC y se convierten solo al mostrarlas.
const formatoHora = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  timeStyle: 'medium',
});

// Pantalla mínima del proyecto base: muestra si el servidor y la base responden,
// y lo vuelve a comprobar cada pocos segundos. Solo se monta con sesión iniciada.
export default function PanelEstado() {
  const salud = useSalud();

  const servidorOk = salud.estado === 'listo';
  const bdOk = servidorOk && salud.bd === 'conectada';

  return (
    <>
      {salud.estado === 'cargando' ? (
        <p className="mt-8 text-tema-700">Comprobando el servidor…</p>
      ) : (
        <ul className="mt-6 grid list-none gap-3 p-0 md:grid-cols-2">
          <Estado
            nombre="Servidor"
            ok={servidorOk}
            texto={servidorOk ? 'En marcha' : 'Sin respuesta'}
          />
          <Estado nombre="Base de datos" ok={bdOk} texto={bdOk ? 'Conectada' : 'Sin conexión'} />
        </ul>
      )}

      {salud.estado !== 'cargando' && (
        <p className="mt-4 text-sm text-tema-700">
          Última comprobación: {formatoHora.format(salud.comprobadoEn)} (hora de Guatemala)
        </p>
      )}
    </>
  );
}

function Estado({ nombre, ok, texto }: { nombre: string; ok: boolean; texto: string }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-l-4 bg-white px-5 py-4 shadow-sm shadow-tema-500/10 transition hover:-translate-y-0.5 hover:shadow-md ${
        ok ? 'border-tema-200 border-l-emerald-500' : 'border-rose-200 border-l-rose-500 bg-rose-50'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-3 shrink-0 rounded-full ring-4 ${ok ? 'bg-emerald-500 ring-emerald-100' : 'bg-rose-500 ring-rose-100'}`}
      />
      <span>
        <strong className="text-tema-900">{nombre}:</strong> {texto}
      </span>
    </li>
  );
}
