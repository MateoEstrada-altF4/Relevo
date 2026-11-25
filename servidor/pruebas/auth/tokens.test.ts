import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { firmarToken, leerToken } from '../../src/auth/tokens.ts';

const OTRO_SECRETO = 'otro-secreto-distinto-de-mas-de-32-caracteres';
const HUELLA = 'huella-de-prueba';

function base64url(objeto: object): string {
  return Buffer.from(JSON.stringify(objeto)).toString('base64url');
}

describe('tokens de sesión', () => {
  test('un token firmado devuelve el id del usuario y la huella de su contraseña', async () => {
    const token = await firmarToken(42, HUELLA);
    assert.deepEqual(await leerToken(token), { id: 42, huella: HUELLA });
  });

  test('un token con el último carácter alterado se rechaza', async () => {
    const token = await firmarToken(42, HUELLA);
    const alterado = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    assert.equal(await leerToken(alterado), null);
  });

  test('un token firmado con otro secreto se rechaza', async () => {
    const token = await firmarToken(42, HUELLA, { secreto: OTRO_SECRETO });
    assert.equal(await leerToken(token), null);
  });

  test('un token caducado se rechaza', async () => {
    const token = await firmarToken(1, HUELLA, { duracionSegundos: -10 });
    assert.equal(await leerToken(token), null);
  });

  test('un token con alg none se rechaza', async () => {
    const futuro = Math.floor(Date.now() / 1000) + 3600;
    const sinFirma = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: '1', ph: HUELLA, exp: futuro })}.`;
    assert.equal(await leerToken(sinFirma), null);
  });

  test('un texto vacío o sin forma de token se rechaza', async () => {
    assert.equal(await leerToken(''), null);
    assert.equal(await leerToken('abc'), null);
  });
});
