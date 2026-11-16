// Configuración del servidor, leída de variables de entorno (archivo .env en la raíz).
// Los valores por defecto coinciden con docker-compose.yml.

const entorno = process.env;

// Schema de PostgreSQL donde viven las tablas de Relevo.
const ESQUEMA = 'relevo';

// Secreto de ejemplo, solo para desarrollo local: en producción es obligatorio definir el propio.
const SECRETO_DESARROLLO = 'secreto-solo-para-desarrollo-local-no-usar-en-produccion';
const LARGO_MINIMO_SECRETO = 32;

export interface ConfigAuth {
  secreto: string;
  duracionSegundos: number;
  nombreCookie: string;
  seguro: boolean;
}

// Lee la configuración de inicio de sesión. Recibe el entorno como parámetro
// para poder probarla sin tocar las variables reales del proceso.
export function leerConfigAuth(entornoLeido: NodeJS.ProcessEnv): ConfigAuth {
  const produccion = entornoLeido.NODE_ENV === 'production';
  const secreto = entornoLeido.SESION_SECRETO ?? (produccion ? undefined : SECRETO_DESARROLLO);

  if (secreto === undefined) {
    throw new Error('Falta SESION_SECRETO: en producción es obligatorio definirlo');
  }
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(`SESION_SECRETO debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres`);
  }

  return {
    secreto,
    duracionSegundos: 8 * 60 * 60, // la sesión dura 8 horas
    nombreCookie: 'relevo_sesion',
    // Secure hace que el navegador solo mande la cookie por HTTPS.
    seguro: produccion,
  };
}

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
  auth: leerConfigAuth(entorno),
};
