import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import ms from 'ms';
import { crearRutasAuth } from './auth/rutas.ts';
import type { LimiteLogin } from './auth/rutas.ts';
import { crearRutasUsuarios } from './auth/rutasUsuarios.ts';
import { conErroresDeBd } from './bd.ts';
import type { ConsultaBd } from './bd.ts';
import { manejarErrores, mensajeDe } from './errores.ts';

// Por defecto: 10 intentos fallidos de inicio de sesión cada 15 minutos por dirección.
const LIMITE_LOGIN_POR_DEFECTO: LimiteLogin = { maximo: 10, ventanaMs: ms('15m') };

// Crea la aplicación Express. Recibe el pool para poder sustituirlo en las pruebas.
export function crearApp({
  pool,
  limiteLogin = LIMITE_LOGIN_POR_DEFECTO,
}: {
  pool: ConsultaBd;
  limiteLogin?: LimiteLogin;
}): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Si la base falla, las rutas lanzan un ErrorDeBd y `manejarErrores` responde 503.
  const bd = conErroresDeBd(pool);

  // Responde si el servidor y la base están vivos. Es PÚBLICA a propósito (sirve de
  // comprobación de salud, también antes de iniciar sesión), así que dice lo mínimo: nunca el
  // nombre de la base ni cuántas tablas tiene, porque eso se lo daría a cualquiera con curl.
  app.get('/api/salud', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ servidor: 'ok', bd: 'conectada' });
    } catch (error) {
      console.error('No se pudo consultar la base de datos:', mensajeDe(error));
      res.status(503).json({ servidor: 'ok', bd: 'sin conexión' });
    }
  });

  app.use('/api/auth', crearRutasAuth({ bd, limiteLogin }));

  app.use('/api/usuarios', crearRutasUsuarios({ bd }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  app.use(manejarErrores);

  return app;
}
