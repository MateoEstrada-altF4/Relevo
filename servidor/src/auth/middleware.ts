import type { RequestHandler, Response } from 'express';
import type { ConsultaBd } from '../bd.ts';
import { config } from '../config.ts';
import { huellaPassword } from './contrasenas.ts';
import { leerToken } from './tokens.ts';
import { buscarPorId } from './usuarios.ts';
import type { Rol } from './usuarios.ts';

// Lo que el resto del servidor necesita saber de quien hace la petición.
export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  debeCambiarPassword: boolean;
}

const SIN_SESION = { error: 'Inicia sesión para continuar' };
const SIN_PERMISO = { error: 'No tienes permiso para esto' };
const DEBE_CAMBIAR = { error: 'Debes cambiar tu contraseña', codigo: 'CAMBIAR_PASSWORD' };
const NO_DISPONIBLE = { error: 'Servicio no disponible' };

// Devuelve el usuario que dejó puesto "autenticar". Si no hay ninguno, es un error
// de programación (se olvidó poner "autenticar" antes), no del cliente.
export function usuarioActual(res: Response): UsuarioSesion {
  const usuario = res.locals.usuario as UsuarioSesion | undefined;
  if (!usuario) throw new Error('usuarioActual() se usó sin pasar antes por autenticar()');
  return usuario;
}

// Averigua quién es quien llama: verifica la firma de la cookie y VUELVE A LEER su
// fila en la base. Así desactivar una cuenta o cambiarle el rol surte efecto de
// inmediato, aunque el token todavía no haya caducado.
export function autenticar(bd: ConsultaBd): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[config.auth.nombreCookie];
    const sesionToken = typeof token === 'string' ? await leerToken(token) : null;
    if (sesionToken === null) {
      res.status(401).json(SIN_SESION);
      return;
    }

    try {
      const usuario = await buscarPorId(bd, sesionToken.id);
      // Una huella distinta significa que la contraseña cambió después de emitir este token.
      if (!usuario?.activo || sesionToken.huella !== huellaPassword(usuario.passwordHash)) {
        res.status(401).json(SIN_SESION);
        return;
      }
      const sesion: UsuarioSesion = {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        debeCambiarPassword: usuario.debeCambiarPassword,
      };
      res.locals.usuario = sesion;
      next();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      console.error('No se pudo comprobar la sesión en la base de datos:', mensaje);
      res.status(503).json(NO_DISPONIBLE);
    }
  };
}

// Autorización: deja pasar solo a los roles indicados. Va después de "autenticar".
export function exigirRol(...roles: Rol[]): RequestHandler {
  return (_req, res, next) => {
    if (!roles.includes(usuarioActual(res).rol)) {
      res.status(403).json(SIN_PERMISO);
      return;
    }
    next();
  };
}

// Mientras la cuenta use su contraseña temporal, no puede usar el resto de la API.
export const exigirPasswordVigente: RequestHandler = (_req, res, next) => {
  if (usuarioActual(res).debeCambiarPassword) {
    res.status(403).json(DEBE_CAMBIAR);
    return;
  }
  next();
};
