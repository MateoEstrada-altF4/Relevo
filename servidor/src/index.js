import { crearApp } from './app.js';
import { crearPool } from './bd.js';
import { config } from './config.js';

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