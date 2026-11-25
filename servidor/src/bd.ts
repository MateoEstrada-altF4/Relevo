import pg from 'pg';
import { config } from './config.ts';
import { ErrorDeBd } from './errores.ts';

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

// Envuelve la base para que CUALQUIER fallo al consultarla salga como un ErrorDeBd. Se aplica
// una sola vez, en crearApp, y así ninguna ruta necesita su propio try/catch para responder
// 503 cuando PostgreSQL no responde: el manejador final de Express lo hace por todas.
export function conErroresDeBd(bd: ConsultaBd): ConsultaBd {
  return {
    async query<Fila extends pg.QueryResultRow>(texto: string, valores?: unknown[]) {
      try {
        return await bd.query<Fila>(texto, valores);
      } catch (error) {
        throw new ErrorDeBd(error);
      }
    },
  };
}
