import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type pg from 'pg';
import {
  buscarPorEmail,
  buscarPorId,
  cambiarPassword,
  registrarAcceso,
} from '../../src/auth/usuarios.ts';
import { crearPool } from '../../src/bd.ts';
import { borrarUsuariosDePrueba, crearUsuarioDePrueba } from '../ayudas.ts';

describe('acceso a la tabla usuario', () => {
  let pool: pg.Pool;

  before(() => {
    pool = crearPool();
  });

  after(async () => {
    await borrarUsuariosDePrueba(pool, 'usuarios');
    await pool.end();
  });

  test('buscarPorEmail ignora mayúsculas y espacios y trae el rol por nombre', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'usuarios', { rol: 'administrador' });
    const usuario = await buscarPorEmail(pool, `  ${cuenta.email.toUpperCase()}  `);

    assert.ok(usuario);
    assert.equal(usuario.id, cuenta.id);
    assert.equal(usuario.rol, 'administrador');
    assert.equal(usuario.activo, true);
    assert.equal(usuario.debeCambiarPassword, false);
    assert.equal(typeof usuario.passwordHash, 'string');
  });

  test('un correo inexistente devuelve null', async () => {
    assert.equal(await buscarPorEmail(pool, 'nadie@relevo.test'), null);
  });

  test('buscarPorId devuelve null si el id no existe', async () => {
    assert.equal(await buscarPorId(pool, 2147483647), null);
  });

  test('buscarPorId devuelve la cuenta, incluso si está inactiva', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'usuarios', { activo: false });
    const usuario = await buscarPorId(pool, cuenta.id);
    assert.equal(usuario?.activo, false);
  });

  test('registrarAcceso deja el último acceso en los últimos 5 segundos', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'usuarios');
    await registrarAcceso(pool, cuenta.id);

    const { rows } = await pool.query(
      `select ultimo_acceso > now() - interval '5 seconds' as reciente
         from usuario where id = $1`,
      [cuenta.id],
    );
    assert.equal(rows[0].reciente, true);
  });

  test('cambiarPassword guarda el hash y apaga la contraseña temporal', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'usuarios', { debeCambiarPassword: true });
    await cambiarPassword(pool, cuenta.id, 'nuevo-hash');

    const usuario = await buscarPorId(pool, cuenta.id);
    assert.equal(usuario?.passwordHash, 'nuevo-hash');
    assert.equal(usuario?.debeCambiarPassword, false);
  });
});
