import { crearApp } from './app.ts';
import { crearPool } from './bd.ts';
import { config } from './config.ts';

const pool = crearPool();
const app = crearApp({ pool });

const servidor = app.listen(config.puerto, () => {
  console.log(`Servidor de Relevo en http://localhost:${config.puerto}`);
});

async function cerrar() {
  servidor.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
