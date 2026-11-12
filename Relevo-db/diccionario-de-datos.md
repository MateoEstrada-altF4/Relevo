# Diccionario de datos de Relevo

Aquí está cada tabla de la base con sus columnas y sus restricciones. La base es PostgreSQL, las tablas viven en el schema `relevo` y sus nombres van en singular. Las mismas descripciones están en la base como `COMMENT ON`. El resumen del modelo se ubica en [especificaciones.md](especificaciones.md).

En las tablas, PK es clave primaria, FK clave foránea y UK un valor único. Todos los `id` se generan solos (`GENERATED ALWAYS AS IDENTITY`), menos el de `configuracion`.

## Resumen

| Tabla | Para qué sirve | Columnas |
|---|---|---|
| rol | Catálogo de roles | 2 |
| tipo_equipo | Catálogo de tipos de equipo | 2 |
| usuario | Cuentas que entran al sistema | 10 |
| persona | Quien recibe los equipos | 4 |
| equipo | Inventario | 11 |
| prestamo | Entregas y devoluciones | 12 |
| mantenimiento | Mantenimientos ya hechos | 6 |
| solicitud | Peticiones del rol Usuario | 13 |
| aviso | Avisos de la revisión diaria | 9 |
| ejecucion_revision | Registro de cada revisión diaria | 8 |
| configuracion | Hora de la revisión diaria | 4 |
| auditoria | Rastro de cambios sensibles | 7 |

## rol

Catálogo de roles de las cuentas. El script inserta encargado, administrador y usuario.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | SMALLINT | PK | no | | Identificador |
| nombre | VARCHAR(20) | UK | no | | Nombre del rol |

Lo que puede hacer cada rol lo decide el servidor.

## tipo_equipo

Catálogo de tipos de equipo. El script inserta laptop, monitor y cable.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | SMALLINT | PK | no | | Identificador |
| nombre | VARCHAR(30) | UK | no | | Nombre del tipo |

Para manejar un tipo nuevo (UPS, teclado) basta insertar una fila; no hay que tocar restricciones.

## usuario

Las cuentas de encargados, administradores y usuarios.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador |
| nombre | VARCHAR(100) | | no | | Nombre completo |
| email | VARCHAR(150) | UK | no | | Correo con el que inicia sesión |
| password_hash | VARCHAR(255) | | no | | Hash de la contraseña, nunca el texto |
| rol_id | SMALLINT | FK | no | | Rol de la cuenta |
| activo | BOOLEAN | | no | true | En false la cuenta está desactivada |
| debe_cambiar_password | BOOLEAN | | no | true | La primera contraseña es temporal |
| ultimo_acceso | TIMESTAMPTZ | | sí | | Último inicio de sesión |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo se creó |
| actualizado_en | TIMESTAMPTZ | | no | now() | Último cambio |

Restricciones:

- El rol tiene que existir en la tabla `rol`.
- El correo es único sin importar mayúsculas (índice único sobre `lower(email)`).
- Una cuenta no se borra, se desactiva, porque otras tablas la referencian.

## persona

Quien recibe un equipo. Es el nombre que se escribe en el campo "Recibe". Está separada de `usuario` porque una persona puede recibir equipo sin tener cuenta: solo la tiene si entra al sistema con el rol Usuario.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador |
| nombre | VARCHAR(100) | UK | no | | Nombre completo |
| usuario_id | INT | FK, UK | sí | | Su cuenta, si tiene |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo se creó |

Restricciones:

- El nombre es único sin importar mayúsculas, para que "Ana Pérez" no quede escrita de varias formas.
- `usuario_id` apunta a `usuario` y es único: una cuenta pertenece a una sola persona.

## equipo

El inventario. Cada equipo se identifica por su tipo y su número, por ejemplo "Laptop 12".

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador |
| tipo_equipo_id | SMALLINT | FK, UK | no | | Tipo de equipo |
| numero | INT | UK | no | | Número de inventario dentro de su tipo: el 12 de "Laptop 12" |
| numero_serie | VARCHAR(50) | UK | sí | | Número de serie, si tiene |
| estado | VARCHAR(20) | | no | disponible | disponible, prestado, en_mantenimiento o de_baja |
| ultimo_mantenimiento | DATE | | sí | | Fecha del último mantenimiento |
| proximo_mantenimiento | DATE | | sí | | Fecha en que toca el siguiente |
| frecuencia_mantenimiento_meses | INT | | sí | | Cada cuántos meses toca |
| dado_de_baja_en | TIMESTAMPTZ | | sí | | Cuándo se dio de baja |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo se creó |
| actualizado_en | TIMESTAMPTZ | | no | now() | Último cambio |

Restricciones:

- El tipo y el número juntos no se repiten. Puede existir "Laptop 1" y "Monitor 1", pero no dos "Laptop 1".
- El número de serie no se repite, aunque puede quedar vacío en varios equipos (los cables no tienen).
- El número y la frecuencia deben ser mayores que cero.
- El próximo mantenimiento debe ser posterior al último.
- El tipo tiene que existir en la tabla `tipo_equipo`.
- Un equipo en_mantenimiento está en reparación o servicio y no se presta; vuelve a disponible al registrar el mantenimiento.
- Si el estado es de_baja tiene que haber fecha de baja, y al revés.
- Hay índices en `estado` y en `proximo_mantenimiento`.

## prestamo

Cada entrega de un equipo a una persona. Mientras `fecha_devolucion` esté vacía, el préstamo está abierto.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador. El comprobante "PR-0148" es este número |
| equipo_id | INT | FK | no | | Equipo prestado |
| persona_id | INT | FK | no | | Quien lo recibe |
| registrado_por | INT | FK | no | | Usuario que registró el préstamo |
| fecha_salida | DATE | | no | hoy | Día en que salió |
| fecha_prevista | DATE | | no | | Día en que debe devolverse |
| fecha_devolucion | DATE | | sí | | Día en que se devolvió |
| devolucion_registrada_por | INT | FK | sí | | Usuario que registró la devolución |
| nota | TEXT | | sí | | Para qué se presta, accesorios |
| observaciones_devolucion | TEXT | | sí | | Cómo volvió el equipo |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo se registró |
| actualizado_en | TIMESTAMPTZ | | no | now() | Último cambio |

Restricciones:

- Un equipo solo puede tener un préstamo abierto. Lo impide un índice único parcial sobre `equipo_id` que solo cuenta las filas sin `fecha_devolucion`.
- La fecha prevista debe ser posterior a la de salida.
- La devolución no puede ser anterior a la salida.
- La fecha de devolución y quien la registró van juntas: o están las dos o ninguna.
- No se puede borrar un equipo, una persona o un usuario que tenga préstamos.
- Hay índices en `persona_id` y en `fecha_prevista` de los préstamos abiertos.

"Vencido" no se guarda. Un préstamo está vencido cuando sigue abierto y su fecha prevista ya pasó.

## mantenimiento

Historial de los mantenimientos ya realizados.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador |
| equipo_id | INT | FK | no | | Equipo atendido |
| registrado_por | INT | FK | no | | Usuario que lo registró |
| fecha | DATE | | no | | Día en que se hizo |
| descripcion | TEXT | | no | | Qué se hizo |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo se registró |

Restricciones:

- No se puede borrar un equipo o un usuario que tenga mantenimientos.
- Hay un índice en `equipo_id` y `fecha`.

Al registrar un mantenimiento, el servidor actualiza las fechas del equipo, lo devuelve a disponible si estaba en_mantenimiento y resuelve el aviso pendiente.

## solicitud

Lo que pide alguien con rol Usuario. Puede pedir un equipo o más tiempo para un préstamo que ya tiene. El encargado la aprueba o la rechaza.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador |
| tipo | VARCHAR(20) | | no | | equipo o mas_tiempo |
| persona_id | INT | FK | no | | Quien la pide |
| equipo_id | INT | FK | sí | | Equipo pedido |
| prestamo_id | INT | FK | sí | | Préstamo que se quiere alargar |
| fecha_desde | DATE | | sí | | Desde cuándo lo necesita |
| fecha_hasta | DATE | | no | | Hasta cuándo, o la nueva fecha de devolución |
| motivo | TEXT | | no | | Para qué lo necesita |
| estado | VARCHAR(20) | | no | en_revision | en_revision, aprobada o rechazada |
| respondida_por | INT | FK | sí | | Encargado que respondió |
| respondida_en | TIMESTAMPTZ | | sí | | Cuándo respondió |
| respuesta | TEXT | | sí | | Explicación, sobre todo si se rechaza |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo se envió |

Restricciones:

- Si el tipo es equipo, lleva `equipo_id` y `fecha_desde`, no lleva `prestamo_id`, y `fecha_hasta` es posterior a `fecha_desde`.
- Si el tipo es mas_tiempo, lleva `prestamo_id` y no lleva `equipo_id` ni `fecha_desde`.
- Mientras está en revisión no tiene quién ni cuándo respondió. Aprobada o rechazada, tiene los dos.
- La misma persona no puede tener dos solicitudes en revisión por el mismo equipo, ni puede haber dos en revisión para alargar el mismo préstamo.
- Si se borra el equipo o el préstamo, sus solicitudes se borran con él.
- Hay un índice en `estado`.

Enviar una solicitud no aparta el equipo. Solo el préstamo lo hace.

## aviso

Los avisos que crea la revisión diaria: préstamos vencidos y mantenimientos pendientes.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador |
| tipo | VARCHAR(30) | | no | | prestamo_vencido o mantenimiento_pendiente |
| prestamo_id | INT | FK | sí | | Préstamo vencido |
| equipo_id | INT | FK | sí | | Equipo con mantenimiento pendiente |
| fecha_referencia | DATE | | no | | La fecha que venció o en la que tocaba el mantenimiento |
| ejecucion_id | INT | FK | no | | Revisión que lo creó |
| mantenimiento_id | INT | FK | sí | | Mantenimiento que resolvió el aviso |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo se creó |
| resuelto_en | TIMESTAMPTZ | | sí | | Cuándo se resolvió. Vacío si sigue abierto |

Restricciones:

- Un aviso de préstamo vencido lleva `prestamo_id` y no `equipo_id`. Uno de mantenimiento pendiente, al revés.
- No puede haber dos avisos de vencido para el mismo préstamo y la misma fecha, ni dos de mantenimiento para el mismo equipo y la misma fecha. Por eso repetir la revisión no duplica avisos.
- Si se borra el préstamo o el equipo, sus avisos se borran con él.
- Si se borra el mantenimiento que lo resolvió, el aviso se queda y solo pierde ese enlace.
- No se puede borrar una ejecución que haya creado avisos.

## ejecucion_revision

Bitácora de la revisión diaria, la tarea programada que cada día busca préstamos vencidos y mantenimientos pendientes y crea los avisos. Hay una fila por cada corrida, para saber si corrió, qué encontró y si falló.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | INT | PK | no | | Identificador |
| iniciado_en | TIMESTAMPTZ | | no | now() | Cuándo empezó |
| finalizado_en | TIMESTAMPTZ | | sí | | Cuándo terminó |
| estado | VARCHAR(20) | | no | | en_curso, correcta o fallida |
| prestamos_vencidos | INT | | no | 0 | Vencidos que encontró |
| mantenimientos_pendientes | INT | | no | 0 | Mantenimientos pendientes que encontró |
| avisos_creados | INT | | no | 0 | Avisos nuevos que creó |
| error | TEXT | | sí | | Mensaje de error, si falló |

Restricciones:

- No puede terminar antes de empezar.
- Los tres contadores no pueden ser negativos.
- Si el estado es fallida tiene que haber mensaje de error, y si no falló no lo lleva.

## configuracion

La hora y la zona horaria de la revisión diaria. Tiene una sola fila, que se crea junto con la tabla.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | SMALLINT | PK | no | 1 | Siempre vale 1 |
| hora_revision | TIME | | no | 06:00 | Hora a la que corre la revisión |
| zona_horaria | VARCHAR(50) | | no | America/Guatemala | Zona horaria de esa hora |
| actualizado_en | TIMESTAMPTZ | | no | now() | Último cambio |

La única restricción es que `id` vale 1, lo que impide crear una segunda fila. No se relaciona con ninguna tabla.

## auditoria

El rastro de los cambios sensibles. Solo se insertan filas, nunca se editan ni se borran.

| Columna | Tipo | Clave | Nulo | Por defecto | Descripción |
|---|---|---|---|---|---|
| id | BIGINT | PK | no | | Identificador |
| usuario_id | INT | FK | no | | Usuario que hizo la acción |
| accion | VARCHAR(30) | | no | | Qué hizo |
| registro_id | INT | | no | | Id del registro afectado |
| motivo | TEXT | | sí | | Por qué lo hizo |
| datos | JSONB | | no | | Datos mínimos del registro, o el valor de antes y el de después |
| creado_en | TIMESTAMPTZ | | no | now() | Cuándo ocurrió |

Restricciones:

- La acción solo puede ser eliminar_prestamo, corregir_fecha, baja_equipo, eliminar_equipo o crear_cuenta.
- El motivo es obligatorio al eliminar un préstamo o dar de baja un equipo, y no puede ir en blanco.
- `registro_id` no es clave foránea, porque el registro puede ya no existir. La acción indica si se refiere a un préstamo, un equipo o una cuenta.
- Hay un índice en `accion` y `registro_id`.

## Relaciones

Son 18. Todas son de uno a muchos, menos la de usuario con persona, que es de uno a uno.

| De | A | Columna | Obligatoria | Si se borra el primero |
|---|---|---|---|---|
| rol | usuario | rol_id | sí | no se permite |
| tipo_equipo | equipo | tipo_equipo_id | sí | no se permite |
| equipo | prestamo | equipo_id | sí | no se permite |
| persona | prestamo | persona_id | sí | no se permite |
| usuario | prestamo | registrado_por | sí | no se permite |
| usuario | prestamo | devolucion_registrada_por | no | no se permite |
| equipo | mantenimiento | equipo_id | sí | no se permite |
| usuario | mantenimiento | registrado_por | sí | no se permite |
| prestamo | aviso | prestamo_id | no | se borra el aviso |
| equipo | aviso | equipo_id | no | se borra el aviso |
| mantenimiento | aviso | mantenimiento_id | no | el campo queda vacío |
| ejecucion_revision | aviso | ejecucion_id | sí | no se permite |
| usuario | auditoria | usuario_id | sí | no se permite |
| usuario | persona | usuario_id | no | no se permite |
| persona | solicitud | persona_id | sí | no se permite |
| equipo | solicitud | equipo_id | no | se borra la solicitud |
| prestamo | solicitud | prestamo_id | no | se borra la solicitud |
| usuario | solicitud | respondida_por | no | no se permite |

## Qué tablas usa cada pantalla

| Pantalla | Tablas |
|---|---|
| Inicio de sesión | usuario |
| Inicio | equipo, prestamo |
| Registrar préstamo | prestamo, persona, equipo |
| Préstamos y detalle del préstamo | prestamo, equipo, persona, aviso |
| Registrar devolución | prestamo, equipo |
| Corregir fecha | prestamo, auditoria |
| Eliminar préstamo | prestamo, auditoria |
| Inventario y ficha del equipo | equipo, tipo_equipo, prestamo, mantenimiento |
| Registrar mantenimiento | mantenimiento, equipo, aviso |
| Gestión de equipos | equipo, tipo_equipo |
| Dar de baja y eliminar equipo | equipo, auditoria |
| Avisos | aviso, ejecucion_revision |
| Cuentas | usuario, rol, persona |
| Revisión diaria | configuracion, ejecucion_revision, aviso |
| Auditoría | auditoria |
| Mis equipos y mis préstamos | prestamo, persona |
| Solicitar equipo y pedir más tiempo | solicitud |
| Mis solicitudes | solicitud |
| Atender solicitudes | solicitud, prestamo |

"Mis avisos" del rol Usuario no tiene tabla propia. Se arma con sus préstamos y sus solicitudes.
