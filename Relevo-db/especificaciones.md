# Especificaciones de la base de datos de Relevo

Mateo Estrada, noviembre 2026

Este documento resume cómo quedó la base de datos de Relevo y en qué punto está el trabajo. 


Todavía no hay nada del servidor ni de la interfaz. Eso es lo que sigue.

## Cómo llegué a este modelo

Partí del modelo propuesto en el README (seis tablas) y lo fui ajustando contra los mockups, pantalla por pantalla. La idea fue que cada dato que aparece o se captura en una pantalla tenga dónde guardarse, y que no haya columnas que ninguna pantalla use.

Cambios respecto a lo que dice el README:

- Agregué el rol Usuario, que en los mockups aparece como opcional. Con eso entró la tabla `solicitud`.
- Separé `persona` de `usuario`. Una persona puede recibir un equipo sin tener cuenta en el sistema.
- Agregué `ejecucion_revision` y `configuracion` para la pantalla de la revisión diaria.
- Los avisos por correo, por WhatsApp y los códigos QR quedaron descartados, no solo fuera del MVP.



## Tablas

Son 10 tablas, 84 columnas y 16 claves foráneas. Todos los `id` son `GENERATED ALWAYS AS IDENTITY`, menos el de `configuracion`.

### usuario

Las cuentas que entran al sistema.

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK |
| nombre | VARCHAR(100) | |
| email | VARCHAR(150) | único sin distinguir mayúsculas |
| password_hash | VARCHAR(255) | nunca la contraseña en texto |
| rol | VARCHAR(20) | encargado, administrador o usuario |
| activo | BOOLEAN | por defecto true |
| debe_cambiar_password | BOOLEAN | por defecto true, la primera contraseña es temporal |
| ultimo_acceso | TIMESTAMPTZ | puede ser nulo |
| creado_en | TIMESTAMPTZ | |
| actualizado_en | TIMESTAMPTZ | |

Las cuentas no se borran, se desactivan, porque otras tablas las referencian.

### persona

Quien recibe el equipo. Es lo que se escribe en el campo "Recibe" al registrar un préstamo.

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK |
| nombre | VARCHAR(100) | único sin distinguir mayúsculas |
| usuario_id | INT | FK a usuario, nulo si no tiene cuenta, único |
| creado_en | TIMESTAMPTZ | |

### equipo

El inventario. Un equipo se identifica por tipo y número, por ejemplo "Laptop 12".

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK |
| tipo | VARCHAR(20) | laptop, monitor o cable |
| numero | INT | mayor que 0, no se repite dentro del tipo |
| numero_serie | VARCHAR(50) | opcional (los cables no tienen), único si existe |
| estado | VARCHAR(20) | disponible, prestado o de_baja |
| ultimo_mantenimiento | DATE | |
| proximo_mantenimiento | DATE | posterior al último |
| frecuencia_mantenimiento_meses | INT | mayor que 0 |
| dado_de_baja_en | TIMESTAMPTZ | obligatorio si el estado es de_baja |
| creado_en | TIMESTAMPTZ | |
| actualizado_en | TIMESTAMPTZ | |

### prestamo

Cada entrega de un equipo. Si `fecha_devolucion` es nula, el préstamo está abierto.

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK, el comprobante PR-0148 es este número |
| equipo_id | INT | FK a equipo |
| persona_id | INT | FK a persona |
| registrado_por | INT | FK a usuario |
| fecha_salida | DATE | por defecto hoy |
| fecha_prevista | DATE | posterior a la salida |
| fecha_devolucion | DATE | nula mientras esté abierto |
| devolucion_registrada_por | INT | FK a usuario, va junto con la fecha de devolución |
| nota | TEXT | |
| observaciones_devolucion | TEXT | |
| creado_en | TIMESTAMPTZ | |
| actualizado_en | TIMESTAMPTZ | |

Las fechas son `DATE` y no `TIMESTAMPTZ` porque las pantallas trabajan por día ("vence hoy", "7 días tarde").

### mantenimiento

Historial de mantenimientos ya hechos.

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK |
| equipo_id | INT | FK a equipo |
| registrado_por | INT | FK a usuario |
| fecha | DATE | |
| descripcion | TEXT | obligatoria |
| creado_en | TIMESTAMPTZ | |

### solicitud

Lo que pide alguien con rol Usuario. Hay dos tipos en la misma tabla porque comparten estados y la misma pantalla para atenderlas.

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK |
| tipo | VARCHAR(20) | equipo o mas_tiempo |
| persona_id | INT | FK a persona |
| equipo_id | INT | FK a equipo, solo si el tipo es equipo |
| prestamo_id | INT | FK a prestamo, solo si el tipo es mas_tiempo |
| fecha_desde | DATE | solo si el tipo es equipo |
| fecha_hasta | DATE | |
| motivo | TEXT | obligatorio |
| estado | VARCHAR(20) | en_revision, aprobada o rechazada |
| respondida_por | INT | FK a usuario |
| respondida_en | TIMESTAMPTZ | |
| respuesta | TEXT | |
| creado_en | TIMESTAMPTZ | |

Una solicitud no aparta el equipo. Solo el préstamo lo hace.

### aviso

Los avisos que crea la revisión diaria.

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK |
| tipo | VARCHAR(30) | prestamo_vencido o mantenimiento_pendiente |
| prestamo_id | INT | FK a prestamo, solo en avisos de vencido |
| equipo_id | INT | FK a equipo, solo en avisos de mantenimiento |
| fecha_referencia | DATE | la fecha que venció o en la que tocaba el mantenimiento |
| ejecucion_id | INT | FK a ejecucion_revision |
| mantenimiento_id | INT | FK a mantenimiento, el que resolvió el aviso |
| creado_en | TIMESTAMPTZ | |
| resuelto_en | TIMESTAMPTZ | nulo mientras esté abierto |

### ejecucion_revision

Una fila por cada vez que corre la revisión diaria.

| Columna | Tipo | Notas |
|---|---|---|
| id | INT | PK |
| iniciado_en | TIMESTAMPTZ | |
| finalizado_en | TIMESTAMPTZ | |
| estado | VARCHAR(20) | en_curso, correcta o fallida |
| prestamos_vencidos | INT | |
| mantenimientos_pendientes | INT | |
| avisos_creados | INT | |
| error | TEXT | obligatorio si falló |

### configuracion

Hora y zona horaria de la revisión diaria. Tiene una sola fila y el esquema la crea.

| Columna | Tipo | Notas |
|---|---|---|
| id | SMALLINT | PK, siempre 1 |
| hora_revision | TIME | por defecto 06:00 |
| zona_horaria | VARCHAR(50) | por defecto America/Guatemala |
| actualizado_en | TIMESTAMPTZ | |

### auditoria

Registro de los cambios sensibles. Solo se inserta.

| Columna | Tipo | Notas |
|---|---|---|
| id | BIGINT | PK |
| usuario_id | INT | FK a usuario |
| accion | VARCHAR(30) | eliminar_prestamo, corregir_fecha, baja_equipo, eliminar_equipo o crear_cuenta |
| registro_id | INT | id del registro afectado, sin FK porque puede ya no existir |
| motivo | TEXT | obligatorio al eliminar un préstamo o dar de baja |
| datos | JSONB | datos mínimos del registro o el cambio |
| creado_en | TIMESTAMPTZ | |

## Relaciones

| De | A | Columna | Al borrar |
|---|---|---|---|
| equipo | prestamo | equipo_id | no deja |
| persona | prestamo | persona_id | no deja |
| usuario | prestamo | registrado_por | no deja |
| usuario | prestamo | devolucion_registrada_por | no deja |
| equipo | mantenimiento | equipo_id | no deja |
| usuario | mantenimiento | registrado_por | no deja |
| prestamo | aviso | prestamo_id | borra el aviso |
| equipo | aviso | equipo_id | borra el aviso |
| mantenimiento | aviso | mantenimiento_id | deja el campo nulo |
| ejecucion_revision | aviso | ejecucion_id | no deja |
| usuario | auditoria | usuario_id | no deja |
| usuario | persona | usuario_id | no deja |
| persona | solicitud | persona_id | no deja |
| equipo | solicitud | equipo_id | borra la solicitud |
| prestamo | solicitud | prestamo_id | borra la solicitud |
| usuario | solicitud | respondida_por | no deja |

Todas son de uno a muchos, menos usuario con persona, que es de uno a uno (una cuenta pertenece a una sola persona).

## Reglas que cumple la base

Estas son las reglas del README y cómo las cumple la base sin depender del servidor:

| Regla | Cómo |
|---|---|
| Un equipo, un préstamo abierto | Índice único parcial en `prestamo (equipo_id)` donde `fecha_devolucion IS NULL` |
| Fechas coherentes | CHECK `fecha_prevista > fecha_salida` |
| Un solo aviso por préstamo o mantenimiento | Dos índices únicos parciales en `aviso` que incluyen `fecha_referencia` |
| Un equipo con historial no se elimina | Las FK desde `prestamo` y `mantenimiento` no dejan borrarlo |
| Nada se borra sin rastro | `auditoria` exige el motivo al eliminar un préstamo o dar de baja |
| Si la revisión falla, se registra el error | CHECK en `ejecucion_revision`: fallida siempre lleva error |

Dos reglas quedan para el servidor porque la base sola no puede:

- Registrar el préstamo y cambiar el estado del equipo en una misma transacción.
- Decidir qué puede hacer cada rol.

## Estados

En `equipo` solo se guardan tres estados: disponible, prestado y de_baja. Los demás que se ven en las pantallas se calculan con las fechas, así no pueden quedar desactualizados:

| En pantalla | Se calcula así |
|---|---|
| Activo | préstamo sin devolución y fecha prevista después de hoy |
| Vence hoy | préstamo sin devolución y fecha prevista igual a hoy |
| Vencido | préstamo sin devolución y fecha prevista antes de hoy |
| Devuelto | préstamo con fecha de devolución |
| Mantenimiento | `proximo_mantenimiento` de hoy o anterior |


## Lo que falta

- Conectar Express a la base.
- La transacción de registrar préstamo.
- Traducir los errores de la base a mensajes para el usuario, por ejemplo "este equipo ya está prestado".
- La tarea programada de la revisión diaria.
- Datos de demostración.
