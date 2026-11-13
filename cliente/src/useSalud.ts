import { useEffect, useState } from 'react';

// Cada cuánto se vuelve a preguntar al servidor si sigue sano.
export const INTERVALO_MS = 10_000;

// Cuerpo que devuelve GET /api/salud (en 200 y en 503).
export interface RespuestaSalud {
  servidor: 'ok';
  bd: 'conectada' | 'sin conexión';
  base?: string;
  hora?: string; // ISO 8601 en UTC
  tablas?: number;
}

export type Salud =
  | { estado: 'cargando' }
  | ({ estado: 'listo'; comprobadoEn: Date } & RespuestaSalud)
  | { estado: 'sin-servidor'; comprobadoEn: Date };

// Consulta /api/salud al montar y la repite cada `intervaloMs`, para que la pantalla
// se ponga en rojo si el servidor o la base se caen después de cargar la página.
export function useSalud(intervaloMs: number = INTERVALO_MS): Salud {
  const [salud, setSalud] = useState<Salud>({ estado: 'cargando' });

  useEffect(() => {
    const control = new AbortController();

    async function consultar() {
      try {
        const respuesta = await fetch('/api/salud', { signal: control.signal });
        const cuerpo = (await respuesta.json()) as RespuestaSalud;
        if (!control.signal.aborted) {
          setSalud({ estado: 'listo', comprobadoEn: new Date(), ...cuerpo });
        }
      } catch {
        if (!control.signal.aborted) {
          setSalud({ estado: 'sin-servidor', comprobadoEn: new Date() });
        }
      }
    }

    // Con la pestaña oculta no se consulta; al volver se actualiza de inmediato.
    function alCambiarVisibilidad() {
      if (!document.hidden) void consultar();
    }

    void consultar();
    const temporizador = setInterval(() => {
      if (!document.hidden) void consultar();
    }, intervaloMs);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      control.abort();
      clearInterval(temporizador);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [intervaloMs]);

  return salud;
}
