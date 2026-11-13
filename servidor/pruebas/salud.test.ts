import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import type pg from 'pg';
import { crearApp } from '../src/app.ts';
import type { ConsultaBd } from '../src/app.ts';
import { crearPool } from '../src/bd.ts';

// Levanta la app en un puerto libre y devuelve su URL base.
function escuchar(app: Express): Promise<{ servidor: Server; url: string }> {
  return new Promise((resolve) => {
    const servidor = app.listen(0, () => {
      const { port } = servidor.address() as AddressInfo;
      resolve({ servidor, url: `http://localhost:${port}` });
    });
  });
}

describe('GET /api/salud con la base de datos real', () => {
  let pool: pg.Pool;
  let servidor: Server;
  let url: string;

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
    const poolCaido: ConsultaBd = {
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
