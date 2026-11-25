import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  validarCambioPassword,
  validarLogin,
  validarNuevoUsuario,
} from '../../src/auth/validacion.ts';

// Pruebas de la validación de "crear cuenta" con valores sueltos: sin servidor ni base.
const valido = {
  nombre: 'Laura Prueba',
  email: 'laura@relevo.test',
  rol: 'encargado',
  passwordTemporal: 'Temporal-12345',
};

function error(cuerpo: unknown): string {
  const lectura = validarNuevoUsuario(cuerpo);
  assert.ok('error' in lectura, `se esperaba un error para ${JSON.stringify(cuerpo)}`);
  return lectura.error;
}

describe('validarNuevoUsuario', () => {
  test('acepta datos correctos y los devuelve limpios', () => {
    assert.deepEqual(validarNuevoUsuario(valido), { datos: valido });
  });

  test('quita los espacios sobrantes del nombre y pone el correo en minúsculas', () => {
    const lectura = validarNuevoUsuario({
      ...valido,
      nombre: '  Laura Prueba  ',
      email: '  LAURA@Relevo.TEST ',
    });
    assert.deepEqual(lectura, { datos: valido });
  });

  test('acepta los tres roles y rechaza cualquier otro', () => {
    for (const rol of ['usuario', 'encargado', 'administrador']) {
      assert.ok('datos' in validarNuevoUsuario({ ...valido, rol }), rol);
    }
    assert.match(error({ ...valido, rol: 'superadmin' }), /rol/);
    assert.match(error({ ...valido, rol: undefined }), /rol/);
  });

  test('el nombre es obligatorio y tiene un máximo', () => {
    assert.match(error({ ...valido, nombre: '   ' }), /nombre/);
    assert.match(error({ ...valido, nombre: 5 }), /nombre/);
    assert.match(error({ ...valido, nombre: 'x'.repeat(101) }), /nombre/);
    assert.ok('datos' in validarNuevoUsuario({ ...valido, nombre: 'x'.repeat(100) }));
  });

  test('el correo debe tener formato de correo y caber en la columna', () => {
    for (const email of ['sin-arroba', 'a@b', 'a b@c.d', '@relevo.test', '', 7, null]) {
      assert.match(error({ ...valido, email }), /correo/, String(email));
    }
    assert.match(error({ ...valido, email: `${'a'.repeat(150)}@relevo.test` }), /correo/);
  });

  test('la contraseña temporal debe ser texto de 10 a 128 caracteres', () => {
    assert.match(error({ ...valido, passwordTemporal: 'corta' }), /contraseña/);
    assert.match(error({ ...valido, passwordTemporal: 'x'.repeat(129) }), /contraseña/);
    assert.match(error({ ...valido, passwordTemporal: 12345678901 }), /contraseña/);
    assert.ok('datos' in validarNuevoUsuario({ ...valido, passwordTemporal: 'x'.repeat(10) }));
    assert.ok('datos' in validarNuevoUsuario({ ...valido, passwordTemporal: 'x'.repeat(128) }));
  });

  test('un cuerpo que no es un objeto se rechaza sin lanzar errores', () => {
    for (const cuerpo of [null, undefined, 'texto', 42, [valido]]) {
      assert.match(error(cuerpo), /nombre/, String(cuerpo));
    }
  });
});

describe('validarLogin', () => {
  const login = { email: 'laura@relevo.test', password: 'cualquiera' };

  test('acepta correo y contraseña de texto y los devuelve tal cual', () => {
    assert.deepEqual(validarLogin(login), { datos: login });
  });

  test('rechaza campos vacíos, ausentes, que no son texto o demasiado largos', () => {
    const malos = [
      { ...login, email: '   ' },
      { ...login, email: 7 },
      { ...login, email: `${'a'.repeat(151)}` },
      { ...login, password: '' },
      { ...login, password: ['x'] },
      { ...login, password: 'x'.repeat(129) },
      { email: login.email },
      null,
      'texto',
    ];
    for (const cuerpo of malos) {
      assert.deepEqual(
        validarLogin(cuerpo),
        { error: 'Datos de inicio de sesión inválidos' },
        JSON.stringify(cuerpo),
      );
    }
  });
});

describe('validarCambioPassword', () => {
  const cambio = { passwordActual: 'Actual-12345', passwordNueva: 'Nueva-123456' };

  test('acepta una contraseña nueva distinta y con el largo permitido', () => {
    assert.deepEqual(validarCambioPassword(cambio), { datos: cambio });
  });

  test('cada fallo da su propio mensaje, en el orden de revisión', () => {
    const mensaje = (cuerpo: unknown) => {
      const lectura = validarCambioPassword(cuerpo);
      assert.ok('error' in lectura, JSON.stringify(cuerpo));
      return lectura.error;
    };
    assert.equal(mensaje({ ...cambio, passwordActual: '' }), 'Datos inválidos');
    assert.equal(mensaje({ ...cambio, passwordActual: 'x'.repeat(129) }), 'Datos inválidos');
    assert.equal(mensaje({ ...cambio, passwordNueva: 5 }), 'Datos inválidos');
    assert.equal(mensaje(null), 'Datos inválidos');
    assert.match(mensaje({ ...cambio, passwordNueva: 'corta' }), /entre 10 y 128/);
    assert.match(mensaje({ ...cambio, passwordNueva: 'x'.repeat(129) }), /entre 10 y 128/);
    assert.match(mensaje({ ...cambio, passwordNueva: cambio.passwordActual }), /distinta/);
  });
});
