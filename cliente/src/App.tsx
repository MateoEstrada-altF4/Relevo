import { useEffect } from 'react';
import type { ReactNode } from 'react';
import BarraDeSesion from './BarraDeSesion.tsx';
import CambiarPassword from './CambiarPassword.tsx';
import { Centrado } from './formulario.tsx';
import Login from './Login.tsx';
import PanelEstado from './PanelEstado.tsx';
import { useSesion } from './useSesion.ts';
import type { Rol, Sesion } from './useSesion.ts';

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

  let pantalla: ReactNode;
  switch (sesion.estado) {
    case 'cargando':
      pantalla = <p className="mt-8 text-tema-700">Comprobando la sesión…</p>;
      break;
    case 'sin-sesion':
      pantalla = (
        <Centrado>
          <Login alEnviar={iniciarSesion} />
        </Centrado>
      );
      break;
    case 'activa':
      pantalla = sesion.debeCambiarPassword ? (
        <Centrado>
          <CambiarPassword
            nombre={sesion.usuario.nombre}
            alEnviar={cambiarPassword}
            cerrarSesion={cerrarSesion}
          />
        </Centrado>
      ) : (
        <>
          <BarraDeSesion usuario={sesion.usuario} cerrarSesion={cerrarSesion} />
          <PanelEstado />
        </>
      );
      break;
  }

  return (
    <main className="flex min-h-dvh w-full flex-col px-[clamp(16px,3vw,40px)] pb-8">
      <header className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-tema-900 via-tema-600 to-tema-400 text-white shadow-lg shadow-tema-500/25 transition-colors sm:mt-6">
        <h1 className="px-6 pt-8 text-4xl font-bold tracking-tight sm:px-10 sm:pt-12 sm:text-5xl">
          Relevo
        </h1>
        <p className="px-6 pt-1 pb-8 text-tema-100 sm:px-10 sm:pb-10 sm:text-lg">
          Control de préstamos de equipo
        </p>
      </header>
      {pantalla}
    </main>
  );
}
