import { z } from 'zod';
import { LARGO_PASSWORD } from './contrasenas.ts';
import { ROLES } from './usuarios.ts';
import type { Rol } from './usuarios.ts';

// Toda la validación de lo que llega en el cuerpo de una petición de cuentas vive aquí, escrita
// con zod: cada esquema describe cómo debe verse el dato y zod comprueba que se cumpla. Se revisa
// ANTES de consultar la base o de calcular un hash: scrypt es lento a propósito.

// Lo que cabe en las columnas de la tabla usuario (ver el esquema).
const LARGO_MAX_NOMBRE = 100;
const LARGO_MAX_EMAIL = 150;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DatosUsuarioNuevo {
  nombre: string;
  email: string;
  rol: Rol;
  passwordTemporal: string;
}

export type Lectura<T> = { datos: T } | { error: string };

// Revisa un cuerpo con un esquema, sin tocar la base ni Express, así que se prueba con valores
// sueltos. Devuelve los datos ya limpios o el mensaje de lo primero que está mal. Un cuerpo que
// no es un objeto (texto, null, lista) se trata como uno vacío: falla en el primer campo.
function leer<T>(esquema: z.ZodType<T>, cuerpo: unknown): Lectura<T> {
  const objeto = typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo);
  const resultado = esquema.safeParse(objeto ? cuerpo : {});
  if (resultado.success) return { datos: resultado.data };
  return { error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
}

// Crear cuenta (la hace el administrador). El nombre se limpia de espacios y el correo se
// guarda en minúsculas.
const MENSAJE_NOMBRE = `El nombre es obligatorio (máximo ${LARGO_MAX_NOMBRE} caracteres)`;
const MENSAJE_PASSWORD_TEMPORAL = `La contraseña temporal debe tener entre ${LARGO_PASSWORD.min} y ${LARGO_PASSWORD.max} caracteres`;

const esquemaUsuarioNuevo = z.object({
  nombre: z
    .string({ error: MENSAJE_NOMBRE })
    .trim()
    .min(1, MENSAJE_NOMBRE)
    .max(LARGO_MAX_NOMBRE, MENSAJE_NOMBRE),
  email: z
    .string({ error: 'El correo no es válido' })
    .trim()
    .max(LARGO_MAX_EMAIL, 'El correo no es válido')
    .regex(FORMATO_EMAIL, 'El correo no es válido')
    .toLowerCase(),
  rol: z.enum(ROLES, { error: `El rol debe ser uno de: ${ROLES.join(', ')}` }),
  passwordTemporal: z
    .string({ error: MENSAJE_PASSWORD_TEMPORAL })
    .min(LARGO_PASSWORD.min, MENSAJE_PASSWORD_TEMPORAL)
    .max(LARGO_PASSWORD.max, MENSAJE_PASSWORD_TEMPORAL),
});

export function validarNuevoUsuario(cuerpo: unknown): Lectura<DatosUsuarioNuevo> {
  return leer(esquemaUsuarioNuevo, cuerpo);
}

// Iniciar sesión. Aquí no se dice qué campo falló: con un solo mensaje basta, y no se revisa el
// formato del correo ni el largo mínimo de la contraseña (eso lo decide la comparación con la base).
const MENSAJE_LOGIN = 'Datos de inicio de sesión inválidos';

const esquemaLogin = z.object({
  email: z
    .string({ error: MENSAJE_LOGIN })
    .refine((email) => email.trim() !== '', MENSAJE_LOGIN)
    .max(LARGO_MAX_EMAIL, MENSAJE_LOGIN),
  password: z
    .string({ error: MENSAJE_LOGIN })
    .min(1, MENSAJE_LOGIN)
    .max(LARGO_PASSWORD.max, MENSAJE_LOGIN),
});

export function validarLogin(cuerpo: unknown): Lectura<{ email: string; password: string }> {
  return leer(esquemaLogin, cuerpo);
}

// Cambiar la contraseña. La actual solo se revisa por forma (que no sea gigante); si es la
// correcta lo decide la comparación con el hash guardado.
const MENSAJE_DATOS = 'Datos inválidos';
const MENSAJE_PASSWORD_NUEVA = `La contraseña nueva debe tener entre ${LARGO_PASSWORD.min} y ${LARGO_PASSWORD.max} caracteres`;

const esquemaCambioPassword = z
  .object({
    passwordActual: z
      .string({ error: MENSAJE_DATOS })
      .min(1, MENSAJE_DATOS)
      .max(LARGO_PASSWORD.max, MENSAJE_DATOS),
    passwordNueva: z
      .string({ error: MENSAJE_DATOS })
      .min(LARGO_PASSWORD.min, MENSAJE_PASSWORD_NUEVA)
      .max(LARGO_PASSWORD.max, MENSAJE_PASSWORD_NUEVA),
  })
  .refine((datos) => datos.passwordNueva !== datos.passwordActual, {
    message: 'La contraseña nueva debe ser distinta de la actual',
    path: ['passwordNueva'],
  });

export function validarCambioPassword(
  cuerpo: unknown,
): Lectura<{ passwordActual: string; passwordNueva: string }> {
  return leer(esquemaCambioPassword, cuerpo);
}
