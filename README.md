![Estático](https://img.shields.io/badge/Proyecto--Relevo-Activo-blue)
![Issues](https://img.shields.io/github/issues/MateoEstrada-altF4/Relevo)
![Último commit](https://img.shields.io/github/last-commit/MateoEstrada-altF4/Relevo)
![Licencia](https://img.shields.io/github/license/MateoEstrada-altF4/Relevo)

![RELEVO](./assets/logo-relevo.png)


# Relevo: control de préstamos de equipo

Aplicación web interna para registrar qué equipo tiene cada persona, cuándo debe devolverlo y cuándo toca su mantenimiento. Reemplaza el Excel de laptops, monitores y cables que hoy nadie actualiza.

## Problema

- No se sabe quién tiene cada equipo ni cuándo debe devolverlo.
- El Excel no impide anotar dos veces el mismo equipo.
- Nadie avisa cuando un préstamo vence; depende de que alguien revise registro por registro.
- No hay historial confiable de quién recibió cada equipo.

## Solución

- Disponibilidad de cada equipo siempre al día.
- Un equipo solo puede tener un préstamo abierto a la vez, garantizado por el servidor.
- Revisión diaria automática que detecta préstamos vencidos y mantenimientos pendientes, y genera avisos dentro del sistema.
- Historial de préstamos y mantenimientos por equipo.

## Usuarios y roles

| Rol | Puede |
|-----|-------|
| **Encargado** | Gestionar préstamos y devoluciones; consultar inventario y avisos. |
| **Administrador** | Todo lo del encargado, y además gestionar equipos y cuentas. |

El servidor decide qué puede hacer cada rol; la interfaz solo oculta opciones.

## Funciones del MVP

1. **Inicio de sesión:** encargado y administrador.
2. **Equipos y mantenimiento:** crear, editar y dar de baja equipos. Un equipo sin historial se elimina; con historial se da de baja para conservar sus registros. Cada equipo guarda su último y próximo mantenimiento.
3. **Préstamos:** crear, ver y editar. Solo se eliminan si fueron un error, no tienen devolución y se registra el motivo.
4. **Devoluciones:** registrar y consultar equipos activos, devueltos y vencidos.
5. **Revisión diaria automática:** avisos de préstamos vencidos y mantenimientos pendientes.

## Reglas que el servidor no deja romper

- **Un equipo, un préstamo abierto:** un índice único parcial en PostgreSQL rechaza duplicados aunque lleguen al mismo tiempo.
- **Todo o nada:** registrar el préstamo y actualizar la disponibilidad del equipo ocurren en una sola transacción.
- **Nada se borra sin rastro:** la auditoría guarda usuario, motivo y datos mínimos de cada registro eliminado o dado de baja.
- **Fechas coherentes:** la fecha prevista de devolución debe ser posterior a la de salida.

## Revisión diaria

1. Se ejecuta sola una vez al día, a la hora y zona horaria configuradas.
2. Busca préstamos cuya fecha prevista ya pasó y mantenimientos pendientes.
3. Crea **un solo aviso** por préstamo o mantenimiento; una clave única evita duplicados.
4. El aviso se resuelve al registrar la devolución o el mantenimiento.
5. Si la ejecución falla, se registra el error y la siguiente vuelve a buscar todos los vencidos.

Condición: el servidor debe estar activo para que la revisión se ejecute.

## Alcance

**Incluido:** inventario de equipos, préstamos y devoluciones, mantenimiento por equipo, revisión diaria y avisos dentro del sistema, historial y dos roles.

**Fuera del MVP:** avisos por correo, avisos por WhatsApp, códigos QR.

## Modelo de datos (propuesta)

- `usuarios`: encargados y administradores.
- `equipos`: inventario, disponibilidad, último y próximo mantenimiento.
- `prestamos`: responsable, equipo, fecha de salida, fecha prevista y fecha real de devolución.
- `mantenimientos`: historial por equipo.
- `avisos`: vencidos y mantenimientos pendientes, con clave única.
- `auditoria`: usuario, motivo y datos mínimos de cada cambio sensible.

## Stack

| Capa | Tecnología |
|------|------------|
| Interfaz | React |
| Servidor | Node.js con Express |
| Base de datos | PostgreSQL |
| Automatización | Tarea programada en el servidor para la revisión diaria |

## Puesta en marcha

_Pendiente: se completará cuando exista el código._

## Pruebas

_Pendiente. Deben cubrir: permisos por rol, rechazo de préstamos duplicados (incluso concurrentes), repetición de la revisión sin duplicar avisos y el recorrido completo de crear, consultar, corregir, eliminar con motivo y devolver._

## Plan de trabajo (propuesta)

| Semana | Trabajo |
|--------|---------|
| 3 | Proyecto, esquema de datos, inicio de sesión y roles |
| 4–5 | Equipos, préstamos, reglas, devoluciones, mantenimiento, avisos y revisión diaria |
| 8 | Pruebas de permisos, errores, concurrencia y recorrido completo |
| 9 | Correcciones, datos de demostración y ensayo |
| 10 | Demo Day |
