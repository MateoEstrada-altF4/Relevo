import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { crearApp } from '../src/app.js';
import { crearPool } from '../src/bd.js';

// Levanta la app en un puerto libre y devuelve su URL base.
function escuchar(app) {
  return new Promise((resolve) => {
    const servidor = app.listen(0, () => {
      resolve({ servidor, url: `http://localhost:${servidor.address().port}` });
    });
  });
}

describe('GET /api/salud con la base de datos real', () => {
  let pool;
  let servidor;
  let url;

  before(async () => {
    pool = crearPool();
    ({ servidor, url } = await escuchar(crearApp({ pool })));
  });

  after(async () => {
    servidor.close();
    await pool.end();
  });

  test('responde 200 y reporta la base conectada', async () => {
    const respuesta = await fetch(`${url}/api/salud`);
    const cuerpo = await respuesta.json();

    assert.equal(respuesta.status, 200);
    assert.equal(cuerpo.servidor, 'ok');
    assert.equal(cuerpo.bd, 'conectada');
    assert.equal(cuerpo.base, 'relevo');
    assert.equal(typeof cuerpo.tablas, 'number');
  });

  test('una ruta desconocida de /api responde 404', async () => {
    const respuesta = await fetch(`${url}/api/no-existe`);
    assert.equal(respuesta.status, 404);
  });
});

describe('GET /api/salud sin base de datos', () => {
  test('responde 503 y reporta la base sin conexión', async () => {
    const poolCaido = {
      query: async () => {
        throw new Error('conexión rechazada');
      },
    };
    const { servidor, url } = await escuchar(crearApp({ pool: poolCaido }));

    try {
      const respuesta = await fetch(`${url}/api/salud`);
      const cuerpo = await respuesta.json();

      assert.equal(respuesta.status, 503);
      assert.equal(cuerpo.bd, 'sin conexión');
    } finally {
      servidor.close();
    }
  });
});