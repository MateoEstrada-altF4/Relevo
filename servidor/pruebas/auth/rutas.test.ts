import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import type { Express } from 'express';
import type pg from 'pg';
import { crearApp } from '../../src/app.ts';
import { crearPool } from '../../src/bd.ts';
import type { ConsultaBd } from '../../src/bd.ts';
import { borrarUsuariosDePrueba, crearUsuarioDePrueba, PASSWORD_DE_PRUEBA } from '../ayudas.ts';

const LIMITE_ALTO = { maximo: 1000, ventanaMs: 60_000 };
const FALLO_LOGIN = { error: 'Correo o contraseña incorrectos' };
const DATOS_INVALIDOS = { error: 'Datos de inicio de sesión inválidos' };
const JSON_INVALIDO = { error: 'Datos inválidos' };

function escuchar(app: Express): Promise<{ servidor: Server; url: string }> {
  return new Promise((resolve) => {
    const servidor = app.listen(0, () => {
      const { port } = servidor.address() as AddressInfo;
      resolve({ servidor, url: `http://localhost:${port}` });
    });
  });
}

interface Opciones {
  metodo?: string;
  json?: unknown;
  crudo?: string;
  cookie?: string;
}

// Hace una petición y devuelve estado, cuerpo (si es JSON), cabeceras y la cookie de sesión.
async function pedir(
  url: string,
  ruta: string,
  { metodo = 'POST', json, crudo, cookie }: Opciones = {},
) {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (json !== undefined || crudo !== undefined) {
    headers['content-type'] = 'application/json';
    body = crudo ?? JSON.stringify(json);
  }
  if (cookie) headers.cookie = cookie;

  const respuesta = await fetch(`${url}${ruta}`, { method: metodo, headers, body });
  const texto = await respuesta.text();
  let cuerpo: unknown;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  const setCookie = respuesta.headers.getSetCookie()[0] ?? '';
  return {
    estado: respuesta.status,
    cuerpo: cuerpo as Record<string, unknown> | null,
    setCookie,
    cookie: setCookie.split(';')[0],
  };
}

describe('rutas /api/auth con la base de datos real', () => {
  let pool: pg.Pool;
  let servidor: Server;
  let url: string;

  before(async () => {
    pool = crearPool();
    ({ servidor, url } = await escuchar(crearApp({ pool, limiteLogin: LIMITE_ALTO })));
  });

  after(async () => {
    servidor.close();
    await borrarUsuariosDePrueba(pool, 'rutas');
    await pool.end();
  });

  const login = (email: string, password: string) =>
    pedir(url, '/api/auth/login', { json: { email, password } });

  test('login correcto: 200, datos del usuario sin hash y cookie con las banderas acordadas', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'rutas', { rol: 'encargado' });
    const r = await login(cuenta.email, cuenta.password);

    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, {
      usuario: { id: cuenta.id, nombre: 'Cuenta de prueba', email: cuenta.email, rol: 'encargado' },
      debeCambiarPassword: false,
    });
    assert.ok(r.setCookie.startsWith('relevo_sesion='));
    assert.match(r.setCookie, /HttpOnly/);
    assert.match(r.setCookie, /SameSite=Lax/);
    assert.match(r.setCookie, /Max-Age=28800/);
    assert.match(r.setCookie, /Path=\//);
    assert.doesNotMatch(r.setCookie, /Secure/);

    const { rows } = await pool.query(
      `select ultimo_acceso > now() - interval '5 seconds' as reciente from usuario where id = $1`,
      [cuenta.id],
    );
    assert.equal(rows[0].reciente, true);
  });

  test('el correo con mayúsculas y espacios también inicia sesión', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'rutas');
    const r = await login(`  ${cuenta.email.toUpperCase()} `, cuenta.password);
    assert.equal(r.estado, 200);
  });

  test('contraseña mala, correo inexistente y cuenta inactiva dan exactamente el mismo 401', async () => {
    const activa = await crearUsuarioDePrueba(pool, 'rutas');
    const inactiva = await crearUsuarioDePrueba(pool, 'rutas', { activo: false });

    const malaClave = await login(activa.email, 'clave-equivocada');
    const sinCuenta = await login('nadie@relevo.test', PASSWORD_DE_PRUEBA);
    const cuentaInactiva = await login(inactiva.email, inactiva.password);

    for (const r of [malaClave, sinCuenta, cuentaInactiva]) {
      assert.equal(r.estado, 401);
      assert.deepEqual(r.cuerpo, FALLO_LOGIN);
      assert.equal(r.setCookie, '');
    }
  });

  test('un cuerpo mal formado responde 400 en JSON, nunca 500', async () => {
    const malos: Opciones[] = [
      { json: {} },
      { json: { email: 1, password: 2 } },
      { json: { email: { $ne: 1 }, password: 'x' } },
      { json: { email: 'a@relevo.test' } },
      { crudo: '{"email":' },
      {},
    ];
    for (const opciones of malos) {
      const r = await pedir(url, '/api/auth/login', opciones);
      assert.equal(r.estado, 400, JSON.stringify(opciones));
      // El JSON roto lo rechaza el manejador general de errores; lo demás, la propia ruta.
      assert.deepEqual(r.cuerpo, opciones.crudo === undefined ? DATOS_INVALIDOS : JSON_INVALIDO);
    }
  });

  test('una contraseña gigante se rechaza enseguida, sin ponerse a calcular hashes', async () => {
    const inicio = Date.now();
    const larga = await login('a@relevo.test', 'a'.repeat(5000));
    assert.equal(larga.estado, 400);
    assert.deepEqual(larga.cuerpo, DATOS_INVALIDOS);

    const enorme = await login('a@relevo.test', 'a'.repeat(1_000_000));
    assert.equal(enorme.estado, 413);
    assert.deepEqual(enorme.cuerpo, { error: 'Datos demasiado grandes' });
    assert.ok(Date.now() - inicio < 1000, 'tardó más de un segundo');
  });

  test('GET /yo con la cookie del login devuelve la cuenta; sin cookie, 401', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'rutas', { rol: 'administrador' });
    const { cookie } = await login(cuenta.email, cuenta.password);

    const conSesion = await pedir(url, '/api/auth/yo', { metodo: 'GET', cookie });
    assert.equal(conSesion.estado, 200);
    assert.deepEqual(conSesion.cuerpo, {
      usuario: {
        id: cuenta.id,
        nombre: 'Cuenta de prueba',
        email: cuenta.email,
        rol: 'administrador',
      },
      debeCambiarPassword: false,
    });

    const sinSesion = await pedir(url, '/api/auth/yo', { metodo: 'GET' });
    assert.equal(sinSesion.estado, 401);
  });

  test('logout responde 204 y vacía la cookie, con o sin sesión', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'rutas');
    const { cookie } = await login(cuenta.email, cuenta.password);

    for (const sesion of [cookie, undefined]) {
      const r = await pedir(url, '/api/auth/logout', { cookie: sesion });
      assert.equal(r.estado, 204);
      assert.match(r.setCookie, /^relevo_sesion=;/);
      assert.match(r.setCookie, /Expires=Thu, 01 Jan 1970|Max-Age=0/);
    }
  });

  test('contraseña temporal: /yo avisa y cambiar-password valida antes de aceptar', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'rutas', { debeCambiarPassword: true });
    const { cookie } = await login(cuenta.email, cuenta.password);
    const cambiar = (json: unknown, galleta: string | undefined = cookie) =>
      pedir(url, '/api/auth/cambiar-password', { json, cookie: galleta });

    const yo = await pedir(url, '/api/auth/yo', { metodo: 'GET', cookie });
    assert.equal(yo.estado, 200);
    assert.equal(yo.cuerpo?.debeCambiarPassword, true);

    const sinSesion = await cambiar(
      { passwordActual: cuenta.password, passwordNueva: 'Nueva-clave-99' },
      '',
    );
    assert.equal(sinSesion.estado, 401);

    const actualMala = await cambiar({
      passwordActual: 'no-es-esta',
      passwordNueva: 'Nueva-clave-99',
    });
    assert.equal(actualMala.estado, 401);
    assert.deepEqual(actualMala.cuerpo, { error: 'La contraseña actual es incorrecta' });

    const corta = await cambiar({ passwordActual: cuenta.password, passwordNueva: '123456789' });
    assert.equal(corta.estado, 400);

    const igual = await cambiar({
      passwordActual: cuenta.password,
      passwordNueva: cuenta.password,
    });
    assert.equal(igual.estado, 400);

    const mal = await cambiar({ passwordActual: 5, passwordNueva: ['x'] });
    assert.equal(mal.estado, 400);

    const bien = await cambiar({
      passwordActual: cuenta.password,
      passwordNueva: 'Nueva-clave-99',
    });
    assert.equal(bien.estado, 204);

    const { rows } = await pool.query('select debe_cambiar_password from usuario where id = $1', [
      cuenta.id,
    ]);
    assert.equal(rows[0].debe_cambiar_password, false);
    assert.equal((await login(cuenta.email, 'Nueva-clave-99')).estado, 200);
    assert.equal((await login(cuenta.email, cuenta.password)).estado, 401);
  });

  test('cambiar la contraseña cierra las demás sesiones y deja una nueva a quien la cambió', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'rutas');
    const vieja = (await login(cuenta.email, cuenta.password)).cookie;
    const otraSesion = (await login(cuenta.email, cuenta.password)).cookie;
    const yo = (cookie: string) => pedir(url, '/api/auth/yo', { metodo: 'GET', cookie });
    assert.equal((await yo(vieja)).estado, 200);

    const cambio = await pedir(url, '/api/auth/cambiar-password', {
      json: { passwordActual: cuenta.password, passwordNueva: 'Nueva-clave-99' },
      cookie: vieja,
    });
    assert.equal(cambio.estado, 204);
    assert.ok(cambio.setCookie.startsWith('relevo_sesion='));

    assert.equal((await yo(vieja)).estado, 401);
    assert.equal((await yo(otraSesion)).estado, 401);
    assert.equal((await yo(cambio.cookie)).estado, 200);
  });

  test('una codificación de contenido no soportada responde 415 en JSON, no 500', async () => {
    const respuesta = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-encoding': 'zzz' },
      body: '{}',
    });
    assert.equal(respuesta.status, 415);
    assert.deepEqual(await respuesta.json(), { error: 'Formato de datos no soportado' });
  });

  test('los intentos fallidos se limitan con 429 y los logins correctos no cuentan', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'rutas');
    const limitada = await escuchar(
      crearApp({ pool, limiteLogin: { maximo: 3, ventanaMs: 60_000 } }),
    );
    try {
      const intentar = (password: string) =>
        pedir(limitada.url, '/api/auth/login', { json: { email: cuenta.email, password } });

      for (let i = 0; i < 5; i++) assert.equal((await intentar(cuenta.password)).estado, 200);
      for (let i = 0; i < 3; i++) assert.equal((await intentar('mala')).estado, 401);

      const bloqueado = await intentar('mala');
      assert.equal(bloqueado.estado, 429);
      assert.deepEqual(bloqueado.cuerpo, {
        error: 'Demasiados intentos. Intenta de nuevo más tarde',
      });
    } finally {
      limitada.servidor.close();
    }
  });

  test('si la base se cae durante el login, responde 503', async () => {
    const baseCaida: ConsultaBd = {
      query: async () => {
        throw new Error('conexión rechazada');
      },
    };
    const caida = await escuchar(crearApp({ pool: baseCaida, limiteLogin: LIMITE_ALTO }));
    try {
      const r = await pedir(caida.url, '/api/auth/login', {
        json: { email: 'a@relevo.test', password: PASSWORD_DE_PRUEBA },
      });
      assert.equal(r.estado, 503);
      assert.deepEqual(r.cuerpo, { error: 'Servicio no disponible' });
    } finally {
      caida.servidor.close();
    }
  });
});
