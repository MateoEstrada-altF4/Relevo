import { Router } from 'express';
import type { CookieOptions, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ConsultaBd } from '../bd.ts';
import { config } from '../config.ts';
import {
  hashearPassword,
  huellaPassword,
  LARGO_PASSWORD,
  verificarPassword,
} from './contrasenas.ts';
import { autenticar, usuarioActual } from './middleware.ts';
import type { UsuarioSesion } from './middleware.ts';
import { firmarToken } from './tokens.ts';
import { buscarPorEmail, buscarPorId, cambiarPassword, registrarAcceso } from './usuarios.ts';
import { esTexto, LARGO_MAX_EMAIL } from './validacion.ts';

export interface LimiteLogin {
  maximo: number;
  ventanaMs: number;
}

const FALLO_LOGIN = { error: 'Correo o contraseña incorrectos' };
const DATOS_INVALIDOS = { error: 'Datos de inicio de sesión inválidos' };

// Banderas de la cookie de sesión. HttpOnly: el JavaScript de la página no puede leerla.
// SameSite=Lax: el navegador no la manda en peticiones que vienen de otros sitios.
const OPCIONES_COOKIE: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.auth.seguro,
  path: '/',
};

// Hash de una contraseña que nadie usa. Si el correo no existe, se compara contra este
// para que la respuesta tarde lo mismo que con un correo real y no delate qué cuentas existen.
let hashFalso: Promise<string> | undefined;
function obtenerHashFalso(): Promise<string> {
  hashFalso ??= hashearPassword('contraseña-que-nadie-usa');
  return hashFalso;
}

// Abre una sesión nueva: firma el token (con la huella de la contraseña vigente) y lo
// entrega en la cookie. Lo usan el login y el cambio de contraseña.
async function entregarSesion(res: Response, usuarioId: number, passwordHash: string) {
  const token = await firmarToken(usuarioId, huellaPassword(passwordHash));
  res.cookie(config.auth.nombreCookie, token, {
    ...OPCIONES_COOKIE,
    maxAge: config.auth.duracionSegundos * 1000,
  });
}

function datosDeSesion(usuario: UsuarioSesion) {
  return {
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
    debeCambiarPassword: usuario.debeCambiarPassword,
  };
}

export function crearRutasAuth({
  bd,
  limiteLogin,
}: {
  bd: ConsultaBd;
  limiteLogin: LimiteLogin;
}): Router {
  const router = Router();

  // Solo cuentan los intentos fallidos: iniciar sesión bien no gasta intentos.
  const limitador = rateLimit({
    windowMs: limiteLogin.ventanaMs,
    limit: limiteLogin.maximo,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'Demasiados intentos. Intenta de nuevo más tarde' });
    },
  });

  router.post('/login', limitador, async (req, res) => {
    const { email, password } = (req.body ?? {}) as Record<string, unknown>;
    // Se valida el tipo y el largo ANTES de calcular el hash: scrypt es lento a propósito.
    if (
      !esTexto(email) ||
      !esTexto(password) ||
      email.trim() === '' ||
      email.length > LARGO_MAX_EMAIL ||
      password === '' ||
      password.length > LARGO_PASSWORD.max
    ) {
      res.status(400).json(DATOS_INVALIDOS);
      return;
    }

    const usuario = await buscarPorEmail(bd, email);
    const coincide = await verificarPassword(
      password,
      usuario?.passwordHash ?? (await obtenerHashFalso()),
    );
    if (!usuario || !usuario.activo || !coincide) {
      res.status(401).json(FALLO_LOGIN);
      return;
    }

    await registrarAcceso(bd, usuario.id);
    await entregarSesion(res, usuario.id, usuario.passwordHash);
    res.json(datosDeSesion(usuario));
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(config.auth.nombreCookie, OPCIONES_COOKIE);
    res.status(204).end();
  });

  router.get('/yo', autenticar(bd), (_req, res) => {
    res.json(datosDeSesion(usuarioActual(res)));
  });

  // No lleva exigirPasswordVigente: es justo la ruta que sí se puede usar con la contraseña temporal.
  router.post('/cambiar-password', autenticar(bd), async (req, res) => {
    const { passwordActual, passwordNueva } = (req.body ?? {}) as Record<string, unknown>;
    if (
      !esTexto(passwordActual) ||
      !esTexto(passwordNueva) ||
      passwordActual === '' ||
      passwordActual.length > LARGO_PASSWORD.max
    ) {
      res.status(400).json({ error: 'Datos inválidos' });
      return;
    }
    if (passwordNueva.length < LARGO_PASSWORD.min || passwordNueva.length > LARGO_PASSWORD.max) {
      res.status(400).json({
        error: `La contraseña nueva debe tener entre ${LARGO_PASSWORD.min} y ${LARGO_PASSWORD.max} caracteres`,
      });
      return;
    }
    if (passwordNueva === passwordActual) {
      res.status(400).json({ error: 'La contraseña nueva debe ser distinta de la actual' });
      return;
    }

    const { id } = usuarioActual(res);
    const usuario = await buscarPorId(bd, id);
    if (!usuario || !(await verificarPassword(passwordActual, usuario.passwordHash))) {
      res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      return;
    }

    const hashNuevo = await hashearPassword(passwordNueva);
    await cambiarPassword(bd, id, hashNuevo);
    // Las sesiones anteriores (incluida la de esta petición) quedan invalidadas porque la
    // huella cambió; quien cambió la contraseña recibe una sesión nueva y no se ve expulsado.
    await entregarSesion(res, id, hashNuevo);
    res.status(204).end();
  });

  return router;
}
