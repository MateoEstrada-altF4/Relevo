// Configuración del servidor, leída de variables de entorno (archivo .env en la raíz).
// Los valores por defecto coinciden con docker-compose.yml.

const entorno = process.env;

// Schema de PostgreSQL donde viven las tablas de Relevo.
const ESQUEMA = 'relevo';

export const config = {
  puerto: Number(entorno.PUERTO ?? 3000),
  bd: {
    host: entorno.PGHOST ?? 'localhost',
    port: Number(entorno.PGPORT ?? 5433),
    database: entorno.PGDATABASE ?? 'relevo',
    user: entorno.PGUSER ?? 'relevo',
    password: entorno.PGPASSWORD ?? 'relevo_dev',
    // Cada conexión arranca con search_path = relevo, como pide el esquema,
    // sin depender de que el usuario de la base se llame igual que el schema.
    // La zona horaria de la sesión es UTC: las fechas se guardan y viajan en UTC.
    options: `-c search_path=${ESQUEMA} -c timezone=UTC`,
  },
};
