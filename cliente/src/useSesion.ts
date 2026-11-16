import { useCallback, useEffect, useState } from 'react';

export type Rol = 'encargado' | 'administrador' | 'usuario';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

// Cuerpo que devuelven POST /api/auth/login y GET /api/auth/yo.
interface RespuestaSesion {
  usuario: UsuarioSesion;
  debeCambiarPassword: boolean;
}

export type Sesion =
  { estado: 'cargando' } | { estado: 'sin-sesion' } | ({ estado: 'activa' } & RespuestaSesion);

// Mismos límites que aplica el servidor. Aquí solo sirven para avisar antes de enviar;
// quien decide de verdad es el servidor.
export const LARGO_PASSWORD = { min: 10, max: 128 } as const;

// Traduce la respuesta de error del servidor a un mensaje para la persona.
async function mensajeDeError(respuesta: Response): Promise<string> {
  if (respuesta.status === 503) return 'El servidor no está disponible';
  try {
    const cuerpo = (await respuesta.json()) as { error?: string };
    if (cuerpo.error) return cuerpo.error;
  } catch {
    // El cuerpo no era JSON: se usa el mensaje genérico de abajo.
  }
  return 'No se pudo completar la operación';
}

const SIN_RESPUESTA = 'Sin respuesta del servidor';

// Lee la sesión actual: 200 con la cuenta, o null si no hay sesión (o el servidor no responde).
async function consultarSesion(signal?: AbortSignal): Promise<RespuestaSesion | null> {
  const respuesta = await fetch('/api/auth/yo', { signal });
  return respuesta.ok ? ((await respuesta.json()) as RespuestaSesion) : null;
}

// Maneja la sesión del navegador. La cookie la pone y la lee el servidor: el cliente nunca
// ve el token (es HttpOnly), solo pregunta "¿quién soy?" a /api/auth/yo.
export function useSesion() {
  const [sesion, setSesion] = useState<Sesion>({ estado: 'cargando' });

  const aplicar = useCallback((datos: RespuestaSesion | null) => {
    setSesion(datos ? { estado: 'activa', ...datos } : { estado: 'sin-sesion' });
  }, []);

  // Al abrir la página: si la cookie sigue vigente, se entra sin pedir la contraseña otra vez.
  useEffect(() => {
    const control = new AbortController();

    async function comprobar() {
      try {
        const datos = await consultarSesion(control.signal);
        if (!control.signal.aborted) aplicar(datos);
      } catch {
        if (!control.signal.aborted) aplicar(null);
      }
    }

    void comprobar();
    return () => control.abort();
  }, [aplicar]);

  // Devuelve null si salió bien, o el mensaje de error para mostrarlo.
  const iniciarSesion = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const respuesta = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!respuesta.ok) return await mensajeDeError(respuesta);
        aplicar((await respuesta.json()) as RespuestaSesion);
        return null;
      } catch {
        return SIN_RESPUESTA;
      }
    },
    [aplicar],
  );

  const cerrarSesion = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      aplicar(null);
    }
  }, [aplicar]);

  // El servidor entrega una cookie nueva al cambiar la contraseña, así que después se vuelve
  // a leer la sesión para que la pantalla refleje que la contraseña ya no es temporal.
  const cambiarPassword = useCallback(
    async (passwordActual: string, passwordNueva: string): Promise<string | null> => {
      try {
        const respuesta = await fetch('/api/auth/cambiar-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passwordActual, passwordNueva }),
        });
        if (!respuesta.ok) return await mensajeDeError(respuesta);
        aplicar(await consultarSesion());
        return null;
      } catch {
        return SIN_RESPUESTA;
      }
    },
    [aplicar],
  );

  return { sesion, iniciarSesion, cerrarSesion, cambiarPassword };
}
