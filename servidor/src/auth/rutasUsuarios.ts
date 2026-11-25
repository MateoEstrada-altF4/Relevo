import { Router } from 'express';
import type { ConsultaBd } from '../bd.ts';
import { hashearPassword } from './contrasenas.ts';
import { autenticar, exigirPasswordVigente, exigirRol, usuarioActual } from './middleware.ts';
import { crearUsuario } from './usuarios.ts';
import { validarNuevoUsuario } from './validacion.ts';

// Rutas de gestión de cuentas. Todas pasan por la misma cadena de middlewares, en este orden:
// 1) autenticar: ¿quién eres? (401)  2) exigirPasswordVigente: ¿ya cambiaste la temporal? (403)
// 3) exigirRol: ¿tu rol alcanza? (403). La lógica de la ruta solo corre si las tres pasan.
export function crearRutasUsuarios({ bd }: { bd: ConsultaBd }): Router {
  const router = Router();
  router.use(autenticar(bd), exigirPasswordVigente, exigirRol('administrador'));

  // Registro de una cuenta nueva. La crea el administrador con una contraseña temporal;
  // quien la recibe debe cambiarla al entrar por primera vez.
  router.post('/', async (req, res) => {
    const lectura = validarNuevoUsuario(req.body);
    if ('error' in lectura) {
      res.status(400).json({ error: lectura.error });
      return;
    }

    const { nombre, email, rol, passwordTemporal } = lectura.datos;
    const usuario = await crearUsuario(bd, {
      nombre,
      email,
      rol,
      passwordHash: await hashearPassword(passwordTemporal),
      creadoPor: usuarioActual(res).id,
    });
    if (!usuario) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
      return;
    }
    res.status(201).json({ usuario, debeCambiarPassword: true });
  });

  return router;
}
