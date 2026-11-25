// Punto de entrada de "npm run bd:semilla": crea las cuentas de desarrollo.
import { LARGO_PASSWORD } from './auth/contrasenas.ts';
import type { Rol } from './auth/usuarios.ts';
import { crearPool } from './bd.ts';
import { correosDeLaSemilla, sembrarUsuarios } from './semilla.ts';

// Estas cuentas tienen contraseñas conocidas: jamás deben existir en un servidor real.
if (process.env.NODE_ENV === 'production') {
  console.error('La semilla es solo para desarrollo: no se ejecuta con NODE_ENV=production.');
  process.exit(1);
}

// Variable de .env con la contraseña de cada cuenta.
const VARIABLES: Record<Rol, string> = {
  administrador: 'SEMILLA_PASSWORD_ADMINISTRADOR',
  encargado: 'SEMILLA_PASSWORD_ENCARGADO',
  usuario: 'SEMILLA_PASSWORD_USUARIO',
};

const roles = Object.keys(VARIABLES) as Rol[];
const incorrectas = roles.filter((rol) => {
  const valor = process.env[VARIABLES[rol]];
  return !valor || valor.length < LARGO_PASSWORD.min || valor.length > LARGO_PASSWORD.max;
});
if (incorrectas.length > 0) {
  console.error(
    `Define en el archivo .env (entre ${LARGO_PASSWORD.min} y ${LARGO_PASSWORD.max} caracteres): ` +
      incorrectas.map((rol) => VARIABLES[rol]).join(', '),
  );
  process.exit(1);
}

const passwords = Object.fromEntries(
  roles.map((rol) => [rol, process.env[VARIABLES[rol]] as string]),
) as Record<Rol, string>;

const pool = crearPool();
try {
  const total = await sembrarUsuarios(pool, { passwords });
  console.log(`Listo: ${total} cuentas de desarrollo creadas o actualizadas.`);
  for (const correo of correosDeLaSemilla()) console.log(`  ${correo}`);
  console.log('Cada contraseña está en su variable SEMILLA_PASSWORD_* de tu .env.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
