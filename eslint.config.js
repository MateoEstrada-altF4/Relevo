import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/', '**/node_modules/', 'Relevo-db/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['servidor/**/*.ts', 'cliente/vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['cliente/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  // Siempre al final: apaga las reglas de estilo que chocarían con Prettier.
  prettier,
]);
