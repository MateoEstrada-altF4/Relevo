import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { leerConfigAuth } from '../src/config.ts';

describe('configuración de autenticación', () => {
  test('en producción sin SESION_SECRETO se niega a arrancar', () => {
    assert.throws(() => leerConfigAuth({ NODE_ENV: 'production' }), /SESION_SECRETO/);
  });

  test('en producción un secreto de 31 caracteres es demasiado corto', () => {
    assert.throws(
      () => leerConfigAuth({ NODE_ENV: 'production', SESION_SECRETO: 'a'.repeat(31) }),
      /32/,
    );
  });

  test('en producción un secreto de 32 caracteres sirve y la cookie es Secure', () => {
    const auth = leerConfigAuth({ NODE_ENV: 'production', SESION_SECRETO: 'a'.repeat(32) });
    assert.equal(auth.seguro, true);
    assert.equal(auth.secreto, 'a'.repeat(32));
  });

  test('en desarrollo usa un secreto de ejemplo y los valores acordados', () => {
    const auth = leerConfigAuth({});
    assert.ok(auth.secreto.length >= 32);
    assert.equal(auth.duracionSegundos, 28800);
    assert.equal(auth.nombreCookie, 'relevo_sesion');
    assert.equal(auth.seguro, false);
  });
});
