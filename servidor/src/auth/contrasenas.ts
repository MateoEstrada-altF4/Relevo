import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Largo permitido para una contraseña nueva. El máximo evita que alguien mande
// un texto enorme para tener al servidor ocupado calculando hashes.
export const LARGO_PASSWORD = { min: 10, max: 128 } as const;

// Parámetros de scrypt. Se guardan dentro del propio hash, así que se pueden
// subir en el futuro sin invalidar las contraseñas que ya existen.
const N = 16384;
const R = 8;
const P = 1;
const LARGO_CLAVE = 64;
const LARGO_SAL = 16;

function derivar(plano: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plano, sal, LARGO_CLAVE, { N: n, r, p }, (error, clave) => {
      if (error) reject(error);
      else resolve(clave);
    });
  });
}

// Devuelve "scrypt$N$r$p$sal$hash" (sal y hash en base64).
export async function hashearPassword(plano: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const clave = await derivar(plano, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${clave.toString('base64')}`;
}

// Resumen corto del hash guardado. Se mete en el token de sesión: si la contraseña cambia,
// el hash cambia, la huella deja de coincidir y las sesiones anteriores quedan invalidadas.
// Es un SHA-256 del hash, así que el token no revela nada útil sobre la contraseña.
export function huellaPassword(guardado: string): string {
  return createHash('sha256').update(guardado).digest('hex').slice(0, 32);
}

// Compara una contraseña con un hash guardado. Si el hash está roto, devuelve
// false en lugar de lanzar: para quien inicia sesión es lo mismo que "no coincide".
export async function verificarPassword(plano: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, n, r, p, salTexto, claveTexto] = partes;
  const sal = Buffer.from(salTexto, 'base64');
  const esperada = Buffer.from(claveTexto, 'base64');
  if (sal.length === 0 || esperada.length !== LARGO_CLAVE) return false;

  try {
    const obtenida = await derivar(plano, sal, Number(n), Number(r), Number(p));
    // timingSafeEqual tarda lo mismo aunque la diferencia esté al inicio o al final.
    return timingSafeEqual(obtenida, esperada);
  } catch {
    return false;
  }
}
