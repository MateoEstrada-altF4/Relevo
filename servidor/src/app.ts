import express from 'express';
import type { Express } from 'express';

// Fila que devuelve la consulta de salud.
export interface FilaSalud {
  base: string;
  hora: Date;
  tablas: number;
}

// Lo único que la app necesita del pool: así las pruebas pueden sustituirlo.
export interface ConsultaBd {
  query(texto: string): Promise<{ rows: FilaSalud[] }>;
}

// Crea la aplicación Express. Recibe el pool para poder sustituirlo en las pruebas.
export function crearApp({ pool }: { pool: ConsultaBd }): Express {
  const app = express();
  app.use(express.json());

  // Estado del servidor y de la conexión a PostgreSQL.
  app.get('/api/salud', async (_req, res) => {
    try {
      const { rows } = await pool.query(
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

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  return app;
}
