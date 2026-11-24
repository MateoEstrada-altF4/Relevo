import { Router } from 'express';
import type { ConsultaBd } from '../bd.ts';
import { hashearPassword, LARGO_PASSWORD } from './contrasenas.ts';
import { autenticar, exigirPasswordVigente, exigirRol } from './middleware.ts';
import { conBd } from './rutas.ts';
import { crearUsuario, ROLES } from './usuarios.ts';
import type { Rol } from './usuarios.ts';

const LARGO_MAX_NOMBRE = 100; // lo que cabe en la columna usuario.nombre
const LARGO_MAX_EMAIL = 150; // lo que cabe en la columna usuario.email
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string';
}

function esRol(valor: unknown): valor is Rol {
  return ROLES.includes(valor as Rol);
}

// Rutas de gestión de cuentas. Todas pasan por la misma cadena de middlewares, en este orden:
// 1) autenticar: ¿quién eres? (401)  2) exigirPasswordVigente: ¿ya cambiaste la temporal? (403)
// 3) exigirRol: ¿tu rol alcanza? (403). La lógica de la ruta solo corre si las tres pasan.
export function crearRutasUsuarios({ bd }: { bd: ConsultaBd }): Router {
  const router = Router();
  router.use(autenticar(bd), exigirPasswordVigente, exigirRol('administrador'));

  // Registro de una cuenta nueva. La crea el administrador con una contraseña temporal;
  // quien la recibe debe cambiarla al entrar por primera vez.
  router.post(
    '/',
    conBd(async (req, res) => {
      const { nombre, email, rol, passwordTemporal } = (req.body ?? {}) as Record<string, unknown>;

      if (!esTexto(nombre) || nombre.trim() === '' || nombre.trim().length > LARGO_MAX_NOMBRE) {
        res
          .status(400)
          .json({ error: `El nombre es obligatorio (máximo ${LARGO_MAX_NOMBRE} caracteres)` });
        return;
      }
      if (
        !esTexto(email) ||
        email.trim().length > LARGO_MAX_EMAIL ||
        !FORMATO_EMAIL.test(email.trim())
      ) {
        res.status(400).json({ error: 'El correo no es válido' });
        return;
      }
      if (!esRol(rol)) {
        res.status(400).json({ error: `El rol debe ser uno de: ${ROLES.join(', ')}` });
        return;
      }
      // Se valida el largo ANTES de calcular el hash: scrypt es lento a propósito.
      if (
        !esTexto(passwordTemporal) ||
        passwordTemporal.length < LARGO_PASSWORD.min ||
        passwordTemporal.length > LARGO_PASSWORD.max
      ) {
        res.status(400).json({
          error: `La contraseña temporal debe tener entre ${LARGO_PASSWORD.min} y ${LARGO_PASSWORD.max} caracteres`,
        });
        return;
      }

      const usuario = await crearUsuario(bd, {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        rol,
        passwordHash: await hashearPassword(passwordTemporal),
      });
      if (!usuario) {
        res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
        return;
      }
      res.status(201).json({ usuario, debeCambiarPassword: true });
    }),
  );

  return router;
}
