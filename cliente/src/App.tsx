import { useEffect } from 'react';
import type { ReactNode } from 'react';
import CambiarPassword from './CambiarPassword.tsx';
import Login from './Login.tsx';
import { useSalud } from './useSalud.ts';
import { useSesion } from './useSesion.ts';
import type { Rol, Sesion, UsuarioSesion } from './useSesion.ts';

// Hora local de Guatemala: las fechas viajan en UTC y se convierten solo al mostrarlas.
const formatoHora = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  timeStyle: 'medium',
});

const NOMBRE_ROL: Record<Rol, string> = {
  encargado: 'Encargado',
  administrador: 'Administrador',
  usuario: 'Usuario',
};

// Sin sesión la pantalla es neutra; con sesión toma el color de su rol (ver App.css):
// administrador azul, encargado celeste y usuario verde.
function temaDe(sesion: Sesion): 'neutro' | Rol {
  return sesion.estado === 'activa' ? sesion.usuario.rol : 'neutro';
}

// Qué pantalla se ve depende de la sesión: sin sesión, el login; con contraseña temporal,
// el cambio obligatorio; con sesión normal, el estado del servidor y la base.
export default function App() {
  const { sesion, iniciarSesion, cerrarSesion, cambiarPassword } = useSesion();

  // El tema va en <html> (no en <main>) para que también pinte el fondo de toda la ventana.
  const tema = temaDe(sesion);
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-8 sm:px-6 lg:px-10">
      <header className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-tema-900 via-tema-600 to-tema-400 text-white shadow-lg shadow-tema-500/25 transition-colors sm:mt-6">
        <h1 className="px-6 pt-8 text-4xl font-bold tracking-tight sm:px-10 sm:pt-12 sm:text-5xl">
          Relevo
        </h1>
        <p className="px-6 pt-1 pb-8 text-tema-100 sm:px-10 sm:pb-10 sm:text-lg">
          Control de préstamos de equipo
        </p>
      </header>

      {sesion.estado === 'cargando' && <p className="mt-8 text-tema-700">Comprobando la sesión…</p>}

      {sesion.estado === 'sin-sesion' && (
        <Centrado>
          <Login alEnviar={iniciarSesion} />
        </Centrado>
      )}

      {sesion.estado === 'activa' && sesion.debeCambiarPassword && (
        <Centrado>
          <CambiarPassword
            nombre={sesion.usuario.nombre}
            alEnviar={cambiarPassword}
            alSalir={() => void cerrarSesion()}
          />
        </Centrado>
      )}

      {sesion.estado === 'activa' && !sesion.debeCambiarPassword && (
        <>
          <BarraDeSesion usuario={sesion.usuario} alSalir={() => void cerrarSesion()} />
          <PanelEstado />
        </>
      )}
    </main>
  );
}

// Centra un formulario en el espacio que queda bajo la cabecera, sea cual sea el tamaño de la ventana.
function Centrado({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center py-8">{children}</div>;
}

function BarraDeSesion({ usuario, alSalir }: { usuario: UsuarioSesion; alSalir: () => void }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tema-200 bg-white px-5 py-3 shadow-sm shadow-tema-500/10">
      <span>
        <strong className="text-tema-900">{usuario.nombre}</strong>{' '}
        <span className="ml-1 rounded-full bg-tema-100 px-2.5 py-0.5 text-sm font-semibold text-tema-800">
          {NOMBRE_ROL[usuario.rol]}
        </span>
      </span>
      <button
        type="button"
        onClick={alSalir}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-tema-700 hover:underline focus:ring-4 focus:ring-tema-200 focus:outline-none"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

// Pantalla mínima del proyecto base: muestra si el servidor y la base responden,
// y lo vuelve a comprobar cada pocos segundos. Solo se monta con sesión iniciada.
function PanelEstado() {
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
