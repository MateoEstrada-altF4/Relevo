import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type pg from 'pg';
import { verificarPassword } from '../src/auth/contrasenas.ts';
import { crearPool } from '../src/bd.ts';
import { sembrarUsuarios } from '../src/semilla.ts';

const DOMINIO = 'semilla-prueba.test';
const PASSWORDS = {
  administrador: 'Admin-de-prueba-1',
  encargado: 'Encargado-de-prueba-2',
  usuario: 'Usuario-de-prueba-3',
};

describe('semilla de cuentas de desarrollo', () => {
  let pool: pg.Pool;

  const leerCuentas = async () => {
    const { rows } = await pool.query(
      `select u.email, r.nombre as rol, u.debe_cambiar_password, u.password_hash
         from usuario u join rol r on r.id = u.rol_id
        where u.email like $1
        order by u.email`,
      [`%@${DOMINIO}`],
    );
    return rows;
  };

  before(() => {
    pool = crearPool();
  });

  after(async () => {
    await pool.query('delete from usuario where email like $1', [`%@${DOMINIO}`]);
    await pool.end();
  });

  test('crea una cuenta por rol y devuelve 3', async () => {
    assert.equal(await sembrarUsuarios(pool, { passwords: PASSWORDS, dominio: DOMINIO }), 3);

    const cuentas = await leerCuentas();
    assert.deepEqual(
      cuentas.map((c) => [c.email, c.rol, c.debe_cambiar_password]),
      [
        [`administrador@${DOMINIO}`, 'administrador', false],
        [`encargado@${DOMINIO}`, 'encargado', false],
        [`usuario@${DOMINIO}`, 'usuario', false],
      ],
    );
  });

  test('cada cuenta entra solo con su propia contraseña', async () => {
    await sembrarUsuarios(pool, { passwords: PASSWORDS, dominio: DOMINIO });

    for (const cuenta of await leerCuentas()) {
      const propia = PASSWORDS[cuenta.rol as keyof typeof PASSWORDS];
      assert.equal(await verificarPassword(propia, cuenta.password_hash), true, cuenta.rol);

      const ajenas = Object.values(PASSWORDS).filter((p) => p !== propia);
      for (const ajena of ajenas) {
        assert.equal(await verificarPassword(ajena, cuenta.password_hash), false, cuenta.rol);
      }
    }
  });

  test('se niega a crear cuentas que compartan contraseña', async () => {
    await assert.rejects(
      sembrarUsuarios(pool, {
        passwords: { ...PASSWORDS, encargado: PASSWORDS.administrador },
        dominio: DOMINIO,
      }),
      /propia contraseña/,
    );
  });

  test('repetirla no duplica cuentas y actualiza las contraseñas', async () => {
    await sembrarUsuarios(pool, { passwords: PASSWORDS, dominio: DOMINIO });
    await sembrarUsuarios(pool, {
      passwords: { ...PASSWORDS, administrador: 'Admin-cambiada-de-prueba-9' },
      dominio: DOMINIO,
    });

    const cuentas = await leerCuentas();
    assert.equal(cuentas.length, 3);
    assert.equal(
      await verificarPassword('Admin-cambiada-de-prueba-9', cuentas[0].password_hash),
      true,
    );
  });
});
