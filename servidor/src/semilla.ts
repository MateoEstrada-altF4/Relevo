import { hashearPassword } from './auth/contrasenas.ts';
import type { Rol } from './auth/usuarios.ts';
import type { ConsultaBd } from './bd.ts';

export const DOMINIO_POR_DEFECTO = 'relevo.test';

// Una cuenta por rol. Las tres entran directo, sin contraseña temporal: para desarrollo
// es lo cómodo. Las cuentas que crea el administrador (POST /api/usuarios) sí nacen con
// contraseña temporal, y el cambio obligatorio sigue funcionando para ellas.
const CUENTAS: { rol: Rol; nombre: string }[] = [
  { rol: 'administrador', nombre: 'Administrador de prueba' },
  { rol: 'encargado', nombre: 'Encargado de prueba' },
  { rol: 'usuario', nombre: 'Usuario de prueba' },
];

export function correosDeLaSemilla(dominio: string = DOMINIO_POR_DEFECTO): string[] {
  return CUENTAS.map(({ rol }) => `${rol}@${dominio}`);
}

// Crea (o actualiza, si ya existen) las tres cuentas de desarrollo. Se puede repetir
// sin duplicar nada. El dominio ".test" está reservado: esos correos nunca existen de verdad.
// Cada cuenta lleva su propia contraseña: compartirla entre roles es un mal hábito, aunque
// sea de prueba, así que se rechaza.
export async function sembrarUsuarios(
  bd: ConsultaBd,
  opciones: { passwords: Record<Rol, string>; dominio?: string },
): Promise<number> {
  const { passwords, dominio = DOMINIO_POR_DEFECTO } = opciones;

  if (new Set(Object.values(passwords)).size !== CUENTAS.length) {
    throw new Error('Cada cuenta de la semilla debe tener su propia contraseña');
  }

  for (const { rol, nombre } of CUENTAS) {
    await bd.query(
      `insert into usuario (nombre, email, password_hash, rol_id, debe_cambiar_password)
       values ($1, $2, $3, (select id from rol where nombre = $4), false)
       on conflict ((lower(email))) do update
          set nombre = excluded.nombre,
              password_hash = excluded.password_hash,
              rol_id = excluded.rol_id,
              activo = true,
              debe_cambiar_password = false,
              actualizado_en = now()`,
      [nombre, `${rol}@${dominio}`, await hashearPassword(passwords[rol]), rol],
    );
  }
  return CUENTAS.length;
}
