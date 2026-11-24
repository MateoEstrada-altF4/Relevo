import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import { crearRutasAuth, manejarErrores } from './auth/rutas.ts';
import type { LimiteLogin } from './auth/rutas.ts';
import { crearRutasUsuarios } from './auth/rutasUsuarios.ts';
import type { ConsultaBd } from './bd.ts';

// Fila que devuelve la consulta de salud.
export interface FilaSalud {
  base: string;
  hora: Date;
  tablas: number;
}

// Por defecto: 10 intentos fallidos de inicio de sesión cada 15 minutos por dirección.
const LIMITE_LOGIN_POR_DEFECTO: LimiteLogin = { maximo: 10, ventanaMs: 15 * 60 * 1000 };

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

  // Estado del servidor y de la conexión a PostgreSQL.
  app.get('/api/salud', async (_req, res) => {
    try {
      const { rows } = await pool.query<FilaSalud>(
        `select current_database() as base,
                now() as hora,
                (select count(*)::int
                   from information_schema.tables
                  where table_schema = 'relevo') as tablas`,
      );
      res.json({ servidor: 'ok', bd: 'conectada', ...rows[0] });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      console.error('No se pudo consultar la base de datos:', mensaje);
      res.status(503).json({ servidor: 'ok', bd: 'sin conexión' });
    }
  });

  app.use('/api/auth', crearRutasAuth({ bd: pool, limiteLogin }));

  app.use('/api/usuarios', crearRutasUsuarios({ bd: pool }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  app.use(manejarErrores);

  return app;
}
