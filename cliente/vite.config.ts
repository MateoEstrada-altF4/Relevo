import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, '..', '');
  const puertoServidor = entorno.PUERTO ?? 3000;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${puertoServidor}`,
      },
    },
  };
});
