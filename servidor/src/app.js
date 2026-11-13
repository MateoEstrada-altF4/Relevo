import express from 'express';

// Crea la aplicación Express. Recibe el pool para poder sustituirlo en las pruebas.
export function crearApp({ pool }) {
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
      console.error('No se pudo consultar la base de datos:', error.message);
      res.status(503).json({ servidor: 'ok', bd: 'sin conexión' });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  return app;
}