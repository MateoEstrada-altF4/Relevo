import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type pg from 'pg';
import { crearApp } from '../../src/app.ts';
import { crearPool } from '../../src/bd.ts';
import { borrarUsuariosDePrueba, crearUsuarioDePrueba } from '../ayudas.ts';

const ETIQUETA = 'usuarios';
const LIMITE_ALTO = { maximo: 1000, ventanaMs: 60_000 };
const PASSWORD_TEMPORAL = 'Temporal-12345';

interface CuerpoRespuesta {
  usuario?: { id: number; nombre: string; email: string; rol: string };
  debeCambiarPassword?: boolean;
  codigo?: string;
  error?: string;
}

describe('POST /api/usuarios (registro, solo administrador)', () => {
  let pool: pg.Pool;
  let servidor: Server;
  let url: string;

  before(async () => {
    pool = crearPool();
    const app = crearApp({ pool, limiteLogin: LIMITE_ALTO });
    await new Promise<void>((resolve) => {
      servidor = app.listen(0, () => {
        url = `http://localhost:${(servidor.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    servidor.close();
    await borrarUsuariosDePrueba(pool, ETIQUETA);
    await pool.end();
  });

  const correoNuevo = () => `prueba-${ETIQUETA}-${randomUUID().slice(0, 8)}@relevo.test`;

  async function iniciarSesion(email: string, password: string): Promise<string> {
    const r = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 200);
    return (r.headers.getSetCookie()[0] ?? '').split(';')[0];
  }

  async function registrar(json: unknown, cookie?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const r = await fetch(`${url}/api/usuarios`, {
      method: 'POST',
      headers,
      body: JSON.stringify(json),
    });
    const texto = await r.text();
    return {
      estado: r.status,
      cuerpo: (texto ? JSON.parse(texto) : null) as CuerpoRespuesta | null,
    };
  }

  const datosValidos = () => ({
    nombre: 'Persona Nueva',
    email: correoNuevo(),
    rol: 'usuario',
    passwordTemporal: PASSWORD_TEMPORAL,
  });

  async function cookieDeAdmin(): Promise<string> {
    const admin = await crearUsuarioDePrueba(pool, ETIQUETA, { rol: 'administrador' });
    return iniciarSesion(admin.email, admin.password);
  }

  test('sin sesión: 401', async () => {
    const r = await registrar(datosValidos());
    assert.equal(r.estado, 401);
  });

  test('un usuario y un encargado reciben 403: su rol no alcanza', async () => {
    for (const rol of ['usuario', 'encargado'] as const) {
      const cuenta = await crearUsuarioDePrueba(pool, ETIQUETA, { rol });
      const cookie = await iniciarSesion(cuenta.email, cuenta.password);
      const r = await registrar(datosValidos(), cookie);
      assert.equal(r.estado, 403, `rol ${rol}`);
    }
  });

  test('un administrador con contraseña temporal pendiente recibe 403', async () => {
    const admin = await crearUsuarioDePrueba(pool, ETIQUETA, {
      rol: 'administrador',
      debeCambiarPassword: true,
    });
    const cookie = await iniciarSesion(admin.email, admin.password);
    const r = await registrar(datosValidos(), cookie);
    assert.equal(r.estado, 403);
    assert.equal(r.cuerpo?.codigo, 'CAMBIAR_PASSWORD');
  });

  test('el administrador crea la cuenta: 201, sin hash, y la contraseña queda encriptada', async () => {
    const cookie = await cookieDeAdmin();
    const datos = datosValidos();
    const r = await registrar({ ...datos, rol: 'encargado' }, cookie);

    assert.equal(r.estado, 201);
    assert.deepEqual(r.cuerpo, {
      usuario: {
        id: r.cuerpo?.usuario?.id,
        nombre: 'Persona Nueva',
        email: datos.email,
        rol: 'encargado',
      },
      debeCambiarPassword: true,
    });
    assert.doesNotMatch(JSON.stringify(r.cuerpo), /scrypt|passwordHash|password_hash/);

    const { rows } = await pool.query(
      `select password_hash, debe_cambiar_password from usuario where id = $1`,
      [r.cuerpo?.usuario?.id],
    );
    assert.match(rows[0].password_hash, /^scrypt\$/);
    assert.notEqual(rows[0].password_hash, PASSWORD_TEMPORAL);
    assert.equal(rows[0].debe_cambiar_password, true);

    // El rastro: quién la creó (un administrador), qué cuenta y con qué rol. Sin el hash.
    const auditoria = await pool.query(
      `select a.datos, u.email as autor, r.nombre as rol_autor
         from auditoria a
         join usuario u on u.id = a.usuario_id
         join rol r on r.id = u.rol_id
        where a.accion = 'crear_cuenta' and a.registro_id = $1`,
      [r.cuerpo?.usuario?.id],
    );
    assert.equal(auditoria.rows.length, 1);
    assert.deepEqual(auditoria.rows[0].datos, { email: datos.email, rol: 'encargado' });
    assert.equal(auditoria.rows[0].rol_autor, 'administrador');
  });

  test('la cuenta creada puede iniciar sesión con la contraseña temporal', async () => {
    const cookie = await cookieDeAdmin();
    const datos = datosValidos();
    await registrar(datos, cookie);

    const r = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: datos.email, password: PASSWORD_TEMPORAL }),
    });
    const cuerpo = (await r.json()) as Record<string, unknown>;
    assert.equal(r.status, 200);
    assert.equal(cuerpo.debeCambiarPassword, true);
  });

  test('correo repetido (aunque cambien mayúsculas): 409', async () => {
    const cookie = await cookieDeAdmin();
    const datos = datosValidos();
    assert.equal((await registrar(datos, cookie)).estado, 201);
    const repetido = await registrar({ ...datos, email: datos.email.toUpperCase() }, cookie);
    assert.equal(repetido.estado, 409);

    // El intento rechazado no deja rastro: solo hay una anotación de creación.
    const { rows } = await pool.query(
      `select 1 from auditoria where accion = 'crear_cuenta' and lower(datos->>'email') = $1`,
      [datos.email.toLowerCase()],
    );
    assert.equal(rows.length, 1);
  });

  test('datos inválidos: 400', async () => {
    const cookie = await cookieDeAdmin();
    const casos: Record<string, unknown> = {
      'sin nombre': { ...datosValidos(), nombre: '  ' },
      'correo sin formato': { ...datosValidos(), email: 'no-es-un-correo' },
      'rol inventado': { ...datosValidos(), rol: 'superadmin' },
      'contraseña corta': { ...datosValidos(), passwordTemporal: 'corta' },
      'contraseña enorme': { ...datosValidos(), passwordTemporal: 'x'.repeat(129) },
      'tipos incorrectos': { nombre: 1, email: 2, rol: 3, passwordTemporal: 4 },
    };
    for (const [nombre, datos] of Object.entries(casos)) {
      const r = await registrar(datos, cookie);
      assert.equal(r.estado, 400, nombre);
    }
  });
});
