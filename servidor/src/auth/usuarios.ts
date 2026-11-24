import type { ConsultaBd } from '../bd.ts';

export const ROLES = ['encargado', 'administrador', 'usuario'] as const;
export type Rol = (typeof ROLES)[number];

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

// Crea una cuenta con contraseña temporal: la persona deberá cambiarla en su primer inicio de
// sesión. Devuelve null si el correo ya existe (el índice único es sobre lower(email), así que
// la base lo rechaza aunque dos peticiones lleguen al mismo tiempo).
export async function crearUsuario(
  bd: ConsultaBd,
  datos: { nombre: string; email: string; rol: Rol; passwordHash: string },
): Promise<Pick<Usuario, 'id' | 'nombre' | 'email' | 'rol'> | null> {
  try {
    const { rows } = await bd.query<{ id: number }>(
      `insert into usuario (nombre, email, password_hash, rol_id, debe_cambiar_password)
       values ($1, $2, $3, (select id from rol where nombre = $4), true)
       returning id`,
      [datos.nombre, datos.email, datos.passwordHash, datos.rol],
    );
    return { id: rows[0].id, nombre: datos.nombre, email: datos.email, rol: datos.rol };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return null;
    throw error;
  }
}
