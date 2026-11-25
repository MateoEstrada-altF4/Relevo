import { LARGO_PASSWORD } from './contrasenas.ts';
import { ROLES } from './usuarios.ts';
import type { Rol } from './usuarios.ts';

// Lo que cabe en las columnas de la tabla usuario (ver el esquema). Se revisa ANTES de
// consultar la base o de calcular un hash: scrypt es lento a propósito.
export const LARGO_MAX_NOMBRE = 100;
export const LARGO_MAX_EMAIL = 150;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string';
}

function esRol(valor: unknown): valor is Rol {
  return ROLES.includes(valor as Rol);
}

export interface DatosUsuarioNuevo {
  nombre: string;
  email: string;
  rol: Rol;
  passwordTemporal: string;
}

export type Lectura<T> = { datos: T } | { error: string };

// Revisa el cuerpo de "crear cuenta" sin tocar la base ni Express, así que se prueba con
// valores sueltos. Devuelve los datos ya limpios (nombre sin espacios sobrantes, correo en
// minúsculas) o el mensaje de lo primero que está mal.
export function validarNuevoUsuario(cuerpo: unknown): Lectura<DatosUsuarioNuevo> {
  const { nombre, email, rol, passwordTemporal } = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;

  if (!esTexto(nombre) || nombre.trim() === '' || nombre.trim().length > LARGO_MAX_NOMBRE) {
    return { error: `El nombre es obligatorio (máximo ${LARGO_MAX_NOMBRE} caracteres)` };
  }
  if (
    !esTexto(email) ||
    email.trim().length > LARGO_MAX_EMAIL ||
    !FORMATO_EMAIL.test(email.trim())
  ) {
    return { error: 'El correo no es válido' };
  }
  if (!esRol(rol)) {
    return { error: `El rol debe ser uno de: ${ROLES.join(', ')}` };
  }
  if (
    !esTexto(passwordTemporal) ||
    passwordTemporal.length < LARGO_PASSWORD.min ||
    passwordTemporal.length > LARGO_PASSWORD.max
  ) {
    return {
      error: `La contraseña temporal debe tener entre ${LARGO_PASSWORD.min} y ${LARGO_PASSWORD.max} caracteres`,
    };
  }

  return {
    datos: {
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      rol,
      passwordTemporal,
    },
  };
}
