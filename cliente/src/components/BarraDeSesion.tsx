import { MensajeDeError } from './formulario.tsx';
import { useSalir } from './useSalir.ts';
import type { Rol, UsuarioSesion } from './useSesion.ts';

const NOMBRE_ROL: Record<Rol, string> = {
  encargado: 'Encargado',
  administrador: 'Administrador',
  usuario: 'Usuario',
};

// Quién tiene la sesión abierta, con su rol y el botón para cerrarla. Si el cierre falla,
// la sesión sigue visible y se muestra el motivo.
export default function BarraDeSesion({
  usuario,
  cerrarSesion,
}: {
  usuario: UsuarioSesion;
  cerrarSesion: () => Promise<string | null>;
}) {
  const { error, saliendo, salir } = useSalir(cerrarSesion);

  return (
    <div className="mt-6 rounded-xl border border-tema-200 bg-white px-5 py-3 shadow-sm shadow-tema-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <strong className="text-tema-900">{usuario.nombre}</strong>{' '}
          <span className="ml-1 rounded-full bg-tema-100 px-2.5 py-0.5 text-sm font-semibold text-tema-800">
            {NOMBRE_ROL[usuario.rol]}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void salir()}
          disabled={saliendo}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-tema-700 hover:underline focus:ring-4 focus:ring-tema-200 focus:outline-none disabled:cursor-wait disabled:opacity-60"
        >
          {saliendo ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
      {error !== null && (
        <div className="mt-3">
          <MensajeDeError mensaje={error} />
        </div>
      )}
    </div>
  );
}
