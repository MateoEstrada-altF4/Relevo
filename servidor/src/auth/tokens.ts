import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.ts';

const ALGORITMO = 'HS256';

interface OpcionesToken {
  secreto?: string;
  duracionSegundos?: number;
}

function clave(secreto: string): Uint8Array {
  return new TextEncoder().encode(secreto);
}

// Lo que dice un token válido: de quién es y la huella de su contraseña al iniciar sesión.
export interface SesionToken {
  id: number;
  huella: string;
}

// Crea un token firmado que dice "este es el usuario <id>" y caduca solo.
// El token no guarda el rol: el rol se lee de la base en cada petición.
// Lleva la huella de la contraseña (claim "ph") para poder invalidarlo si ella cambia.
export async function firmarToken(
  usuarioId: number,
  huella: string,
  opciones: OpcionesToken = {},
): Promise<string> {
  const { secreto = config.auth.secreto, duracionSegundos = config.auth.duracionSegundos } =
    opciones;
  const ahora = Math.floor(Date.now() / 1000);

  return new SignJWT({ ph: huella })
    .setProtectedHeader({ alg: ALGORITMO })
    .setSubject(String(usuarioId))
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + duracionSegundos)
    .sign(clave(secreto));
}

// Devuelve el id y la huella si el token es válido; null si está roto,
// manipulado, caducado o firmado con otra clave. Nunca lanza.
export async function leerToken(
  token: string,
  secreto: string = config.auth.secreto,
): Promise<SesionToken | null> {
  try {
    // Fijar el algoritmo impide que un atacante pida "alg: none" (sin firma).
    const { payload } = await jwtVerify(token, clave(secreto), { algorithms: [ALGORITMO] });
    const id = Number(payload.sub);
    const huella = payload.ph;
    if (!Number.isInteger(id) || id <= 0 || typeof huella !== 'string') return null;
    return { id, huella };
  } catch {
    return null;
  }
}
