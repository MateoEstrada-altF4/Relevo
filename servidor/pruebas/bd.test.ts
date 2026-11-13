import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type pg from 'pg';
import { crearPool } from '../src/bd.ts';

describe('conexión a PostgreSQL', () => {
  let pool: pg.Pool;

  before(() => {
    pool = crearPool();
  });

  after(async () => {
    await pool.end();
  });

  test('cada conexión usa el schema relevo', async () => {
    const { rows } = await pool.query('show search_path');
    assert.equal(rows[0].search_path, 'relevo');
  });

  test('las tablas del esquema se ven sin calificar', async () => {
    const { rows } = await pool.query('select count(*)::int as roles from rol');
    assert.equal(rows[0].roles, 3);
  });

  test('cada conexión trabaja en UTC', async () => {
    const { rows } = await pool.query('show timezone');
    assert.equal(rows[0].TimeZone, 'UTC');
  });

  test('perder una conexión no tumba el servidor', () => {
    assert.doesNotThrow(() => pool.emit('error', new Error('corte de prueba')));
  });
});
