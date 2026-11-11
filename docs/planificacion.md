# Planificación de Relevo

**Calendario:** 7.5 semanas en total. Las semanas 1 y 2 ya están hechas; quedan 5.5 semanas, desde la semana 3 hasta la mitad de la semana 8.

**Reuniones con encargados:** cada 1.5 semanas, para revisar los PRs terminados. Son 3 revisiones y luego el Demo Day.

## Cronograma semana por semana

| Semana | Tareas | Pruebas que se escriben | Hito |
|--------|--------|-------------------------|------|
| **3** | Crear proyecto (React, Express, PostgreSQL). Crear esquema: `usuarios`, `equipos`, `prestamos`, `mantenimientos`, `avisos`, `auditoria`. Inicio de sesión. Roles aplicados en el servidor. | Permisos básicos por rol | |
| **4 (primera mitad)** | Terminar roles. CRUD de equipos: crear, editar, eliminar sin historial, dar de baja con historial. | Permisos de equipos | **Reunión 1** (mitad de la semana 4) |
| **4 (segunda mitad) y 5 (primera mitad)** | Préstamos: crear, ver y editar. Regla "un equipo, un préstamo abierto" con índice único parcial. Préstamo y disponibilidad en una sola transacción. Validación: fecha de devolución posterior a la de salida. | Préstamo duplicado, incluso concurrente. Fechas incoherentes | |
| **5 (segunda mitad)** | Ajustes de préstamos. Eliminar préstamo con motivo (solo si fue error y no tiene devolución). | Eliminación con motivo y sin devolución | **Reunión 2** (fin de la semana 5) |
| **6** | Devoluciones: registrar y consultar activos, devueltos y vencidos. Mantenimiento por equipo (último y próximo). Auditoría mínima: usuario y fecha en bajas y eliminaciones. | Devolución y recorrido completo: prestar, devolver | |
| **7 (primera mitad)** | Mantenimiento: historial por equipo, sin el detalle completo. Ajustes de devoluciones. | Historial de mantenimiento | **Reunión 3** (mitad de la semana 7) |
| **7 (segunda mitad)** | **Revisión diaria mínima:** tarea programada que detecta préstamos vencidos y mantenimientos pendientes, y crea avisos con clave única. | Revisión repetida sin avisos duplicados | |
| **8 (primera mitad)** | Revisión diaria completa: registro de errores y reintento. Avisos resueltos al devolver o mantener. Pruebas de permisos y concurrencia. Datos de demostración. Ensayo del Demo Day. | Recorrido completo y permisos | **Demo Day** (fin de la semana 8) |

## Qué recortar si se atrasa (en este orden)

1. **Auditoría detallada:** guardar solo usuario y fecha, sin motivo ni datos completos.
2. **Historial de mantenimiento:** mostrar solo el último y el próximo mantenimiento.
3. **Manejo de errores de la revisión diaria:** dejar el registro simple, sin reintento.

**No recortar nunca:** la regla "un equipo, un préstamo abierto", la transacción de préstamo y la prueba de préstamos duplicados.

## Reglas de trabajo

- Cada PR se revisa en la reunión de su bloque. No se espera al final.
- Las pruebas de cada función se escriben en la misma semana que la función.
- Cualquier función que no esté lista para su reunión pasa al siguiente bloque, y se reduce el alcance antes que la fecha.
