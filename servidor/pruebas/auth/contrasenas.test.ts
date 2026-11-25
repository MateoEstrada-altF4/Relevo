import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hashearPassword, huellaPassword, verificarPassword } from '../../src/auth/contrasenas.ts';

describe('contraseñas con scrypt', () => {
  test('genera un hash con formato scrypt que cabe en varchar(255)', async () => {
    const hash = await hashearPassword('Clave-Segura-123');
    assert.ok(hash.startsWith('scrypt$16384$8$1$'));
    assert.ok(hash.length <= 255);
  });

  test('dos hashes de la misma contraseña son distintos', async () => {
    const [h1, h2] = await Promise.all([
      hashearPassword('Clave-Segura-123'),
      hashearPassword('Clave-Segura-123'),
    ]);
    assert.notEqual(h1, h2);
  });

  test('verifica la contraseña correcta', async () => {
    const hash = await hashearPassword('Clave-Segura-123');
    assert.equal(await verificarPassword('Clave-Segura-123', hash), true);
  });

  test('rechaza una contraseña incorrecta', async () => {
    const hash = await hashearPassword('Clave-Segura-123');
    assert.equal(await verificarPassword('otra-clave-cualquiera', hash), false);
  });

  test('un hash guardado roto no lanza, simplemente no coincide', async () => {
    assert.equal(await verificarPassword('x', 'basura'), false);
    assert.equal(await verificarPassword('x', 'scrypt$1$2'), false);
  });

  test('la huella cambia si cambia el hash guardado y no lo revela', async () => {
    const hash = await hashearPassword('Clave-Segura-123');
    const otro = await hashearPassword('Clave-Segura-123');

    assert.equal(huellaPassword(hash), huellaPassword(hash));
    assert.notEqual(huellaPassword(hash), huellaPassword(otro));
    assert.match(huellaPassword(hash), /^[0-9a-f]{32}$/);
    assert.ok(!hash.includes(huellaPassword(hash)));
  });
});
