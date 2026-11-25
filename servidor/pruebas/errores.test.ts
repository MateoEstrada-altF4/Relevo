import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { conErroresDeBd } from '../src/bd.ts';
import type { ConsultaBd } from '../src/bd.ts';
import { ErrorDeBd, mensajeDe } from '../src/errores.ts';

describe('mensajeDe', () => {
  test('devuelve el mensaje de un Error y el texto de cualquier otra cosa', () => {
    assert.equal(mensajeDe(new Error('se cayó')), 'se cayó');
    assert.equal(mensajeDe('texto suelto'), 'texto suelto');
    assert.equal(mensajeDe(404), '404');
    assert.equal(mensajeDe(null), 'null');
  });
});

describe('ErrorDeBd', () => {
  test('conserva el mensaje, la causa, el code y la constraint del error original', () => {
    const original = Object.assign(new Error('clave duplicada'), {
      code: '23505',
      constraint: 'usuario_email_uk',
    });
    const error = new ErrorDeBd(original);
    assert.equal(error.message, 'clave duplicada');
    assert.equal(error.cause, original);
    assert.equal(error.code, '23505');
    assert.equal(error.constraint, 'usuario_email_uk');
  });

  test('no inventa code ni constraint si el original no los trae', () => {
    for (const causa of [new Error('x'), 'texto', null, undefined]) {
      const error = new ErrorDeBd(causa);
      assert.equal(error.code, undefined);
      assert.equal(error.constraint, undefined);
    }
  });
});

describe('conErroresDeBd', () => {
  test('devuelve el resultado tal cual cuando la consulta sale bien', async () => {
    const llamadas: unknown[][] = [];
    const bd: ConsultaBd = {
      query: async <Fila extends object>(texto: string, valores?: unknown[]) => {
        llamadas.push([texto, valores]);
        return { rows: [{ uno: 1 }] as unknown as Fila[], rowCount: 1 };
      },
    };
    const resultado = await conErroresDeBd(bd).query('select 1', [7]);
    assert.deepEqual(resultado, { rows: [{ uno: 1 }], rowCount: 1 });
    assert.deepEqual(llamadas, [['select 1', [7]]]);
  });

  test('convierte cualquier fallo de la base en un ErrorDeBd', async () => {
    const bd: ConsultaBd = {
      query: async () => {
        throw new Error('conexión rechazada');
      },
    };
    await assert.rejects(conErroresDeBd(bd).query('select 1'), (error) => {
      assert.ok(error instanceof ErrorDeBd);
      assert.equal(error.message, 'conexión rechazada');
      return true;
    });
  });
});
