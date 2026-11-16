import type { ConsultaBd } from '../bd.ts';

export type Rol = 'encargado' | 'administrador' | 'usuario';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  passwordHash: string;
}

// Fila tal como sale de PostgreSQL (columnas en minúsculas con guion bajo).
interface FilaUsuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debe_cambiar_password: boolean;
  password_hash: string;
}

const SELECT_USUARIO = `
  select u.id, u.nombre, u.email, r.nombre as rol, u.activo,
         u.debe_cambiar_password, u.password_hash
    from usuario u
    join rol r on r.id = u.rol_id`;

function aUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    rol: fila.rol,
    activo: fila.activo,
    debeCambiarPassword: fila.debe_cambiar_password,
    passwordHash: fila.password_hash,
  };
}

// Busca por correo sin distinguir mayúsculas ni espacios sobrantes
// (el índice único de la base es sobre lower(email)).
export async function buscarPorEmail(bd: ConsultaBd, email: string): Promise<Usuario | null> {
  const { rows } = await bd.query<FilaUsuario>(`${SELECT_USUARIO} where lower(u.email) = $1`, [
    email.trim().toLowerCase(),
  ]);
  return rows[0] ? aUsuario(rows[0]) : null;
}

export async function buscarPorId(bd: ConsultaBd, id: number): Promise<Usuario | null> {
  const { rows } = await bd.query<FilaUsuario>(`${SELECT_USUARIO} where u.id = $1`, [id]);
  return rows[0] ? aUsuario(rows[0]) : null;
}

export async function registrarAcceso(bd: ConsultaBd, id: number): Promise<void> {
  await bd.query('update usuario set ultimo_acceso = now() where id = $1', [id]);
}

// Guarda la contraseña nueva y apaga la bandera de contraseña temporal.
export async function cambiarPassword(
  bd: ConsultaBd,
  id: number,
  passwordHash: string,
): Promise<void> {
  await bd.query(
    `update usuario
        set password_hash = $2, debe_cambiar_password = false, actualizado_en = now()
      where id = $1`,
    [id, passwordHash],
  );
}
