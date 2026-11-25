import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';
import type pg from 'pg';
import {
  autenticar,
  exigirPasswordVigente,
  exigirRol,
  usuarioActual,
} from '../../src/auth/middleware.ts';
import { huellaPassword } from '../../src/auth/contrasenas.ts';
import { firmarToken } from '../../src/auth/tokens.ts';
import { buscarPorId } from '../../src/auth/usuarios.ts';
import { conErroresDeBd, crearPool } from '../../src/bd.ts';
import { manejarErrores } from '../../src/errores.ts';
import type { ConsultaBd } from '../../src/bd.ts';
import { borrarUsuariosDePrueba, crearUsuarioDePrueba } from '../ayudas.ts';

// Mini aplicación solo para probar los middlewares: rutas con distintos requisitos.
function crearAppDePrueba(bd: ConsultaBd) {
  const app = express();
  app.use(cookieParser());
  const responder = (_req: express.Request, res: express.Response) => {
    const { id, rol } = usuarioActual(res);
    res.json({ id, rol });
  };
  app.get('/libre', autenticar(bd), responder);
  app.get('/solo-admin', autenticar(bd), exigirRol('administrador'), responder);
  app.get('/staff', autenticar(bd), exigirRol('encargado', 'administrador'), responder);
  app.get('/estricta', autenticar(bd), exigirPasswordVigente, responder);
  // Igual que en la aplicación real: los errores de las rutas acaban en el manejador final.
  app.use(manejarErrores);
  return app;
}

function escuchar(app: express.Express): Promise<{ servidor: Server; url: string }> {
  return new Promise((resolve) => {
    const servidor = app.listen(0, () => {
      const { port } = servidor.address() as AddressInfo;
      resolve({ servidor, url: `http://localhost:${port}` });
    });
  });
}

async function pedir(url: string, ruta: string, cookie?: string) {
  const respuesta = await fetch(`${url}${ruta}`, { headers: cookie ? { cookie } : {} });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

describe('middlewares de autenticación y roles', () => {
  let pool: pg.Pool;
  let servidor: Server;
  let url: string;

  // Cookie de una sesión como la que entregaría el login: lleva la huella de la contraseña actual.
  const conSesion = async (id: number) => {
    const usuario = await buscarPorId(pool, id);
    const huella = huellaPassword(usuario?.passwordHash ?? '');
    return `relevo_sesion=${await firmarToken(id, huella)}`;
  };

  before(async () => {
    pool = crearPool();
    ({ servidor, url } = await escuchar(crearAppDePrueba(pool)));
  });

  after(async () => {
    servidor.close();
    await borrarUsuariosDePrueba(pool, 'middleware');
    await pool.end();
  });

  test('sin cookie responde 401', async () => {
    const { estado, cuerpo } = await pedir(url, '/libre');
    assert.equal(estado, 401);
    assert.deepEqual(cuerpo, { error: 'Inicia sesión para continuar' });
  });

  test('una cookie con basura, vacía o enorme responde 401, nunca 500', async () => {
    assert.equal((await pedir(url, '/libre', 'relevo_sesion=basura')).estado, 401);
    assert.equal((await pedir(url, '/libre', 'relevo_sesion=')).estado, 401);
    assert.equal((await pedir(url, '/libre', ';;;=')).estado, 401);
    assert.equal((await pedir(url, '/libre', `relevo_sesion=${'a'.repeat(8192)}`)).estado, 401);
  });

  test('un token válido de una cuenta activa pasa y expone id y rol', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'middleware', { rol: 'encargado' });
    const { estado, cuerpo } = await pedir(url, '/libre', await conSesion(cuenta.id));
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo, { id: cuenta.id, rol: 'encargado' });
  });

  test('un token válido de una cuenta inactiva responde 401', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'middleware', { activo: false });
    const { estado } = await pedir(url, '/libre', await conSesion(cuenta.id));
    assert.equal(estado, 401);
  });

  test('un token de un usuario que ya no existe responde 401', async () => {
    const { estado } = await pedir(url, '/libre', await conSesion(2147483647));
    assert.equal(estado, 401);
  });

  test('desactivar la cuenta surte efecto con el mismo token, sin esperar a que caduque', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'middleware');
    const cookie = await conSesion(cuenta.id);
    assert.equal((await pedir(url, '/libre', cookie)).estado, 200);

    await pool.query('update usuario set activo = false where id = $1', [cuenta.id]);
    assert.equal((await pedir(url, '/libre', cookie)).estado, 401);
  });

  test('cambiar la contraseña invalida las sesiones anteriores, aunque no hayan caducado', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'middleware');
    const cookieVieja = await conSesion(cuenta.id);
    assert.equal((await pedir(url, '/libre', cookieVieja)).estado, 200);

    await pool.query(`update usuario set password_hash = 'otro-hash-distinto' where id = $1`, [
      cuenta.id,
    ]);
    assert.equal((await pedir(url, '/libre', cookieVieja)).estado, 401);
    assert.equal((await pedir(url, '/libre', await conSesion(cuenta.id))).estado, 200);
  });

  test('un token con una huella que no es la de la contraseña actual responde 401', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'middleware');
    const cookie = `relevo_sesion=${await firmarToken(cuenta.id, 'huella-equivocada')}`;
    assert.equal((await pedir(url, '/libre', cookie)).estado, 401);
  });

  test('exigirRol responde 403 si el rol no alcanza y 200 cuando el rol cambia', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'middleware', { rol: 'usuario' });
    const cookie = await conSesion(cuenta.id);

    const negado = await pedir(url, '/solo-admin', cookie);
    assert.equal(negado.estado, 403);
    assert.deepEqual(negado.cuerpo, { error: 'No tienes permiso para esto' });

    await pool.query(
      `update usuario set rol_id = (select id from rol where nombre = 'administrador')
        where id = $1`,
      [cuenta.id],
    );
    assert.equal((await pedir(url, '/solo-admin', cookie)).estado, 200);
  });

  test('exigirRol acepta varios roles: el encargado entra al staff y el usuario no', async () => {
    const encargado = await crearUsuarioDePrueba(pool, 'middleware', { rol: 'encargado' });
    const usuario = await crearUsuarioDePrueba(pool, 'middleware', { rol: 'usuario' });
    assert.equal((await pedir(url, '/staff', await conSesion(encargado.id))).estado, 200);
    assert.equal((await pedir(url, '/staff', await conSesion(usuario.id))).estado, 403);
  });

  test('con la contraseña temporal pendiente, exigirPasswordVigente responde 403 con código', async () => {
    const cuenta = await crearUsuarioDePrueba(pool, 'middleware', { debeCambiarPassword: true });
    const { estado, cuerpo } = await pedir(url, '/estricta', await conSesion(cuenta.id));
    assert.equal(estado, 403);
    assert.deepEqual(cuerpo, { error: 'Debes cambiar tu contraseña', codigo: 'CAMBIAR_PASSWORD' });
  });

  test('si la base se cae, responde 503 y el servidor sigue vivo', async () => {
    const baseCaida: ConsultaBd = {
      query: async () => {
        throw new Error('conexión rechazada');
      },
    };
    // crearApp envuelve la base con conErroresDeBd; esta mini aplicación debe hacer lo mismo.
    const caida = await escuchar(crearAppDePrueba(conErroresDeBd(baseCaida)));
    try {
      const cookie = `relevo_sesion=${await firmarToken(1, 'cualquier-huella')}`;
      const { estado, cuerpo } = await pedir(caida.url, '/libre', cookie);
      assert.equal(estado, 503);
      assert.deepEqual(cuerpo, { error: 'Servicio no disponible' });
    } finally {
      caida.servidor.close();
    }
  });
});
