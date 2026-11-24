import { randomUUID } from 'node:crypto';
import { hashearPassword } from '../src/auth/contrasenas.ts';
import type { Rol } from '../src/auth/usuarios.ts';
import type { ConsultaBd } from '../src/bd.ts';

export const PASSWORD_DE_PRUEBA = 'Clave-de-prueba-1';

interface DatosUsuarioPrueba {
  rol?: Rol;
  activo?: boolean;
  debeCambiarPassword?: boolean;
  password?: string;
}

// Crea una cuenta de prueba con correo único. La etiqueta identifica al archivo de
// pruebas que la creó: node --test corre los archivos en paralelo, y cada uno
// debe borrar solo lo suyo.
export async function crearUsuarioDePrueba(
  bd: ConsultaBd,
  etiqueta: string,
  datos: DatosUsuarioPrueba = {},
): Promise<{ id: number; email: string; password: string }> {
  const {
    rol = 'usuario',
    activo = true,
    debeCambiarPassword = false,
    password = PASSWORD_DE_PRUEBA,
  } = datos;
  const email = `prueba-${etiqueta}-${randomUUID().slice(0, 8)}@relevo.test`;
  const hash = await hashearPassword(password);

  const { rows } = await bd.query<{ id: number }>(
    `insert into usuario (nombre, email, password_hash, rol_id, activo, debe_cambiar_password)
     values ('Cuenta de prueba', $1, $2, (select id from rol where nombre = $3), $4, $5)
     returning id`,
    [email, hash, rol, activo, debeCambiarPassword],
  );
  return { id: rows[0].id, email, password };
}

// Borra las cuentas de prueba de una etiqueta, junto con el rastro de auditoría que dejaron
// (la auditoría apunta a la cuenta con ON DELETE RESTRICT: sin borrarla primero, no se podría).
export async function borrarUsuariosDePrueba(bd: ConsultaBd, etiqueta: string): Promise<void> {
  const patron = `prueba-${etiqueta}-%@relevo.test`;
  await bd.query(
    `delete from auditoria where usuario_id in (select id from usuario where email like $1)`,
    [patron],
  );
  await bd.query(`delete from usuario where email like $1`, [patron]);
}
