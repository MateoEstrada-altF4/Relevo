import pg from 'pg';
import { config } from './config.ts';

// Un solo pool de conexiones para todo el servidor.
export function crearPool(opciones: pg.PoolConfig = config.bd): pg.Pool {
  const pool = new pg.Pool({
    ...opciones,
    connectionTimeoutMillis: 3000,
  });

  // Si la base se cae, las conexiones en espera avisan con un evento "error".
  // Sin este manejador, ese evento tumba el servidor entero.
  pool.on('error', (error) => {
    console.error('Se perdió una conexión con la base de datos:', error.message);
  });

  return pool;
}

// Lo único que el código de Relevo necesita de la base: hacer consultas.
// Un pg.Pool la cumple, y las pruebas pueden pasar una versión falsa (por ejemplo, una base caída).
export interface ConsultaBd {
  query<Fila extends pg.QueryResultRow>(
    texto: string,
    valores?: unknown[],
  ): Promise<{ rows: Fila[]; rowCount: number | null }>;
}
