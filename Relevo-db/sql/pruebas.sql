-- Relevo: pruebas del esquema
--
-- Intentan romper cada regla del diccionario de datos y comprueban que la base
-- lo impide. Todo corre dentro de una transacción que termina en ROLLBACK:
-- no deja ningún dato en la base.
--
-- Uso (después de crear las tablas con 01-esquema.sql):
--   psql -d relevo -f Relevo-db/sql/pruebas.sql
--   Con Docker: docker compose exec db psql -U relevo -d relevo -f /sql/pruebas.sql
--
-- Al final muestra una fila por prueba y el total. Si "fallaron" es 0, todo bien.

BEGIN;

-- Las tablas viven en el schema "relevo". Solo dura esta transacción.
SET LOCAL search_path TO relevo;

-- Id de un rol o de un tipo de equipo a partir de su nombre, para no depender
-- de los números que el esquema les haya dado.
CREATE FUNCTION pg_temp.rol(p_nombre TEXT)
RETURNS SMALLINT LANGUAGE sql AS $f$
  SELECT id FROM relevo.rol WHERE nombre = p_nombre
$f$;

CREATE FUNCTION pg_temp.tipo(p_nombre TEXT)
RETURNS SMALLINT LANGUAGE sql AS $f$
  SELECT id FROM relevo.tipo_equipo WHERE nombre = p_nombre
$f$;

CREATE TEMP TABLE resultado (
  n       INT GENERATED ALWAYS AS IDENTITY,
  nombre  TEXT NOT NULL,
  ok      BOOLEAN NOT NULL,
  detalle TEXT
) ON COMMIT DROP;

-- La sentencia debe ser rechazada, y justo por la razón esperada.
CREATE FUNCTION pg_temp.debe_fallar(p_nombre TEXT, p_razon TEXT, p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  -- 'restringido' es un borrado frenado por ON DELETE RESTRICT: según la
  -- versión de PostgreSQL llega como 23001 o como 23503.
  v_codigos TEXT[] := CASE p_razon
    WHEN 'unico'       THEN ARRAY['23505']
    WHEN 'check'       THEN ARRAY['23514']
    WHEN 'fk'          THEN ARRAY['23503']
    WHEN 'obligatorio' THEN ARRAY['23502']
    WHEN 'restringido' THEN ARRAY['23001', '23503']
  END;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = ANY (v_codigos) THEN
      INSERT INTO resultado (nombre, ok) VALUES (p_nombre, true);
    ELSE
      INSERT INTO resultado (nombre, ok, detalle)
      VALUES (p_nombre, false, 'falló por otra razón: ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
    RETURN;
  END;
  INSERT INTO resultado (nombre, ok, detalle)
  VALUES (p_nombre, false, 'la base lo aceptó y debía rechazarlo');
END $f$;

-- La sentencia debe ser aceptada. Sus cambios se quedan para las pruebas siguientes.
CREATE FUNCTION pg_temp.debe_pasar(p_nombre TEXT, p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado (nombre, ok, detalle)
    VALUES (p_nombre, false, 'la base lo rechazó: ' || SQLSTATE || ' ' || SQLERRM);
    RETURN;
  END;
  INSERT INTO resultado (nombre, ok) VALUES (p_nombre, true);
END $f$;

-- La consulta debe devolver verdadero.
CREATE FUNCTION pg_temp.debe_ser(p_nombre TEXT, p_sql TEXT)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v BOOLEAN;
BEGIN
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado (nombre, ok, detalle)
    VALUES (p_nombre, false, 'error: ' || SQLSTATE || ' ' || SQLERRM);
    RETURN;
  END;
  INSERT INTO resultado (nombre, ok, detalle)
  VALUES (p_nombre, coalesce(v, false), CASE WHEN coalesce(v, false) THEN NULL ELSE 'la comprobación dio falso' END);
END $f$;

-- ---------------------------------------------------------------------------
-- Datos de base. Usan ids del 9001 en adelante para no chocar con datos reales.
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_pasar('base: tres cuentas, una por rol', $$
    INSERT INTO usuario (id, nombre, email, password_hash, rol_id) OVERRIDING SYSTEM VALUE VALUES
      (9001, 'Encargado Prueba', 'encargado@prueba.test', 'hash', pg_temp.rol('encargado')),
      (9002, 'Admin Prueba',     'admin@prueba.test',     'hash', pg_temp.rol('administrador')),
      (9003, 'Luis Prueba',      'luis@prueba.test',      'hash', pg_temp.rol('usuario'))$$);

  PERFORM pg_temp.debe_pasar('base: una persona sin cuenta y otra con cuenta', $$
    INSERT INTO persona (id, nombre, usuario_id) OVERRIDING SYSTEM VALUE VALUES
      (9001, 'Ana Prueba',  NULL),
      (9002, 'Luis Prueba', 9003)$$);

  PERFORM pg_temp.debe_pasar('base: equipos; el mismo número en tipos distintos y dos cables sin serie', $$
    INSERT INTO equipo (id, tipo_equipo_id, numero, numero_serie, estado) OVERRIDING SYSTEM VALUE VALUES
      (9001, pg_temp.tipo('laptop'),  9001, 'SERIE-PRUEBA-1', 'prestado'),
      (9002, pg_temp.tipo('monitor'), 9001, 'SERIE-PRUEBA-2', 'disponible'),
      (9003, pg_temp.tipo('cable'),   9001, NULL,             'disponible'),
      (9004, pg_temp.tipo('cable'),   9002, NULL,             'disponible'),
      (9005, pg_temp.tipo('laptop'),  9002, NULL,             'disponible')$$);

  PERFORM pg_temp.debe_pasar('base: una ejecución correcta de la revisión diaria', $$
    INSERT INTO ejecucion_revision (id, estado, finalizado_en) OVERRIDING SYSTEM VALUE
    VALUES (9001, 'correcta', now())$$);

  PERFORM pg_temp.debe_pasar('base: un préstamo abierto y vencido', $$
    INSERT INTO prestamo (id, equipo_id, persona_id, registrado_por, fecha_salida, fecha_prevista)
    OVERRIDING SYSTEM VALUE
    VALUES (9001, 9001, 9002, 9001, CURRENT_DATE - 10, CURRENT_DATE - 3)$$);

  PERFORM pg_temp.debe_pasar('base: un mantenimiento realizado', $$
    INSERT INTO mantenimiento (id, equipo_id, registrado_por, fecha, descripcion) OVERRIDING SYSTEM VALUE
    VALUES (9001, 9002, 9001, CURRENT_DATE - 30, 'Limpieza y revisión de cables')$$);

  PERFORM pg_temp.debe_pasar('base: un aviso de préstamo vencido y uno de mantenimiento ya resuelto', $$
    INSERT INTO aviso (id, tipo, prestamo_id, equipo_id, fecha_referencia, ejecucion_id, mantenimiento_id, resuelto_en)
    OVERRIDING SYSTEM VALUE VALUES
      (9001, 'prestamo_vencido',        9001, NULL, CURRENT_DATE - 3,  9001, NULL, NULL),
      (9002, 'mantenimiento_pendiente', NULL, 9002, CURRENT_DATE - 40, 9001, 9001, now())$$);

  PERFORM pg_temp.debe_pasar('base: una solicitud de equipo y una de más tiempo, en revisión', $$
    INSERT INTO solicitud (id, tipo, persona_id, equipo_id, prestamo_id, fecha_desde, fecha_hasta, motivo)
    OVERRIDING SYSTEM VALUE VALUES
      (9001, 'equipo',     9002, 9003, NULL, CURRENT_DATE + 1, CURRENT_DATE + 5, 'Presentación'),
      (9002, 'mas_tiempo', 9002, NULL, 9001, NULL,             CURRENT_DATE + 5, 'Sigo en el proyecto')$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- Catálogos: rol y tipo_equipo
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_ser('rol: el esquema deja los tres roles ya creados', $$
    SELECT count(*) = 3 FROM rol WHERE nombre IN ('encargado', 'administrador', 'usuario')$$);

  PERFORM pg_temp.debe_fallar('rol: rechaza repetir un nombre', 'unico', $$
    INSERT INTO rol (nombre) VALUES ('encargado')$$);

  PERFORM pg_temp.debe_fallar('rol: no se borra si hay cuentas con ese rol', 'restringido', $$
    DELETE FROM rol WHERE nombre = 'encargado'$$);

  PERFORM pg_temp.debe_ser('tipo_equipo: el esquema deja laptop, monitor y cable ya creados', $$
    SELECT count(*) = 3 FROM tipo_equipo WHERE nombre IN ('laptop', 'monitor', 'cable')$$);

  PERFORM pg_temp.debe_fallar('tipo_equipo: rechaza repetir un nombre', 'unico', $$
    INSERT INTO tipo_equipo (nombre) VALUES ('laptop')$$);

  PERFORM pg_temp.debe_fallar('tipo_equipo: no se borra si hay equipos de ese tipo', 'restringido', $$
    DELETE FROM tipo_equipo WHERE nombre = 'laptop'$$);

  PERFORM pg_temp.debe_pasar('tipo_equipo: agregar un tipo nuevo es insertar una fila', $$
    INSERT INTO tipo_equipo (nombre) VALUES ('proyector')$$);

  PERFORM pg_temp.debe_pasar('tipo_equipo: el tipo nuevo ya se puede usar en un equipo', $$
    INSERT INTO equipo (tipo_equipo_id, numero) VALUES (pg_temp.tipo('proyector'), 9001)$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- usuario
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('usuario: rechaza un rol que no existe', 'fk', $$
    INSERT INTO usuario (nombre, email, password_hash, rol_id) VALUES ('X', 'x@prueba.test', 'hash', 9999)$$);

  PERFORM pg_temp.debe_fallar('usuario: exige el rol', 'obligatorio', $$
    INSERT INTO usuario (nombre, email, password_hash) VALUES ('X', 'x@prueba.test', 'hash')$$);

  PERFORM pg_temp.debe_fallar('usuario: rechaza el mismo correo con otras mayúsculas', 'unico', $$
    INSERT INTO usuario (nombre, email, password_hash, rol_id) VALUES ('X', 'ADMIN@Prueba.Test', 'hash', pg_temp.rol('encargado'))$$);

  PERFORM pg_temp.debe_fallar('usuario: rechaza una cuenta sin contraseña', 'obligatorio', $$
    INSERT INTO usuario (nombre, email, rol_id) VALUES ('X', 'x@prueba.test', pg_temp.rol('encargado'))$$);

  PERFORM pg_temp.debe_ser('usuario: una cuenta nueva nace activa y con contraseña temporal', $$
    SELECT activo AND debe_cambiar_password AND ultimo_acceso IS NULL FROM usuario WHERE id = 9001$$);

  PERFORM pg_temp.debe_fallar('usuario: no se borra una cuenta que registró préstamos', 'restringido', $$
    DELETE FROM usuario WHERE id = 9001$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- persona
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('persona: rechaza el mismo nombre con otras mayúsculas', 'unico', $$
    INSERT INTO persona (nombre) VALUES ('ANA PRUEBA')$$);

  PERFORM pg_temp.debe_fallar('persona: una cuenta no puede ser de dos personas', 'unico', $$
    INSERT INTO persona (nombre, usuario_id) VALUES ('Otro Luis', 9003)$$);

  PERFORM pg_temp.debe_fallar('persona: rechaza una cuenta que no existe', 'fk', $$
    INSERT INTO persona (nombre, usuario_id) VALUES ('Sin Cuenta Real', 999999)$$);

  PERFORM pg_temp.debe_fallar('persona: no se borra si tiene préstamos', 'restringido', $$
    DELETE FROM persona WHERE id = 9002$$);

  PERFORM pg_temp.debe_fallar('persona: no se borra la cuenta enlazada a una persona', 'restringido', $$
    DELETE FROM usuario WHERE id = 9003$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- equipo
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('equipo: rechaza un tipo que no existe', 'fk', $$
    INSERT INTO equipo (tipo_equipo_id, numero) VALUES (9999, 9100)$$);

  PERFORM pg_temp.debe_fallar('equipo: exige el tipo', 'obligatorio', $$
    INSERT INTO equipo (numero) VALUES (9100)$$);

  PERFORM pg_temp.debe_fallar('equipo: rechaza el número cero', 'check', $$
    INSERT INTO equipo (tipo_equipo_id, numero) VALUES (pg_temp.tipo('laptop'), 0)$$);

  PERFORM pg_temp.debe_fallar('equipo: rechaza repetir tipo y número', 'unico', $$
    INSERT INTO equipo (tipo_equipo_id, numero) VALUES (pg_temp.tipo('laptop'), 9001)$$);

  PERFORM pg_temp.debe_fallar('equipo: rechaza repetir el número de serie', 'unico', $$
    INSERT INTO equipo (tipo_equipo_id, numero, numero_serie) VALUES (pg_temp.tipo('laptop'), 9100, 'SERIE-PRUEBA-1')$$);

  PERFORM pg_temp.debe_fallar('equipo: rechaza un estado que no existe', 'check', $$
    INSERT INTO equipo (tipo_equipo_id, numero, estado) VALUES (pg_temp.tipo('laptop'), 9100, 'perdido')$$);

  PERFORM pg_temp.debe_pasar('equipo: puede estar en mantenimiento', $$
    INSERT INTO equipo (tipo_equipo_id, numero, estado) VALUES (pg_temp.tipo('laptop'), 9101, 'en_mantenimiento')$$);

  PERFORM pg_temp.debe_fallar('equipo: el próximo mantenimiento debe ser posterior al último', 'check', $$
    INSERT INTO equipo (tipo_equipo_id, numero, ultimo_mantenimiento, proximo_mantenimiento)
    VALUES (pg_temp.tipo('laptop'), 9100, CURRENT_DATE, CURRENT_DATE)$$);

  PERFORM pg_temp.debe_fallar('equipo: rechaza una frecuencia de cero meses', 'check', $$
    INSERT INTO equipo (tipo_equipo_id, numero, frecuencia_mantenimiento_meses) VALUES (pg_temp.tipo('laptop'), 9100, 0)$$);

  PERFORM pg_temp.debe_fallar('equipo: de baja exige la fecha de la baja', 'check', $$
    INSERT INTO equipo (tipo_equipo_id, numero, estado) VALUES (pg_temp.tipo('laptop'), 9100, 'de_baja')$$);

  PERFORM pg_temp.debe_fallar('equipo: fecha de baja exige el estado de baja', 'check', $$
    INSERT INTO equipo (tipo_equipo_id, numero, dado_de_baja_en) VALUES (pg_temp.tipo('laptop'), 9100, now())$$);

  PERFORM pg_temp.debe_pasar('equipo: se puede dar de baja con estado y fecha', $$
    UPDATE equipo SET estado = 'de_baja', dado_de_baja_en = now() WHERE id = 9004$$);

  PERFORM pg_temp.debe_ser('equipo: un equipo nuevo nace disponible', $$
    SELECT estado = 'disponible' FROM equipo WHERE id = 9005$$);

  PERFORM pg_temp.debe_fallar('equipo: no se elimina si tiene préstamos', 'restringido', $$
    DELETE FROM equipo WHERE id = 9001$$);

  PERFORM pg_temp.debe_fallar('equipo: no se elimina si tiene mantenimientos', 'restringido', $$
    DELETE FROM equipo WHERE id = 9002$$);

  PERFORM pg_temp.debe_pasar('equipo: sin historial sí se elimina', $$
    DELETE FROM equipo WHERE id = 9005$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- prestamo
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('prestamo: un equipo no puede tener dos préstamos abiertos', 'unico', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por, fecha_prevista)
    VALUES (9001, 9001, 9001, CURRENT_DATE + 7)$$);

  PERFORM pg_temp.debe_fallar('prestamo: la fecha prevista debe ser posterior a la salida', 'check', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por, fecha_salida, fecha_prevista)
    VALUES (9002, 9001, 9001, CURRENT_DATE, CURRENT_DATE)$$);

  PERFORM pg_temp.debe_fallar('prestamo: la devolución no puede ser anterior a la salida', 'check', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por, fecha_salida, fecha_prevista, fecha_devolucion, devolucion_registrada_por)
    VALUES (9002, 9001, 9001, CURRENT_DATE, CURRENT_DATE + 7, CURRENT_DATE - 1, 9001)$$);

  PERFORM pg_temp.debe_fallar('prestamo: una devolución exige quién la registró', 'check', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por, fecha_salida, fecha_prevista, fecha_devolucion)
    VALUES (9002, 9001, 9001, CURRENT_DATE - 5, CURRENT_DATE + 2, CURRENT_DATE)$$);

  PERFORM pg_temp.debe_fallar('prestamo: no hay quién registró la devolución sin devolución', 'check', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por, fecha_prevista, devolucion_registrada_por)
    VALUES (9002, 9001, 9001, CURRENT_DATE + 7, 9001)$$);

  PERFORM pg_temp.debe_fallar('prestamo: rechaza una persona que no existe', 'fk', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por, fecha_prevista)
    VALUES (9002, 999999, 9001, CURRENT_DATE + 7)$$);

  PERFORM pg_temp.debe_fallar('prestamo: rechaza un equipo que no existe', 'fk', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por, fecha_prevista)
    VALUES (999999, 9001, 9001, CURRENT_DATE + 7)$$);

  PERFORM pg_temp.debe_fallar('prestamo: exige la fecha prevista', 'obligatorio', $$
    INSERT INTO prestamo (equipo_id, persona_id, registrado_por) VALUES (9002, 9001, 9001)$$);

  PERFORM pg_temp.debe_pasar('prestamo: un préstamo ya devuelto queda en el historial', $$
    INSERT INTO prestamo (id, equipo_id, persona_id, registrado_por, fecha_salida, fecha_prevista, fecha_devolucion, devolucion_registrada_por)
    OVERRIDING SYSTEM VALUE
    VALUES (9002, 9002, 9001, 9001, CURRENT_DATE - 20, CURRENT_DATE - 15, CURRENT_DATE - 16, 9002)$$);

  PERFORM pg_temp.debe_pasar('prestamo: un equipo devuelto se puede volver a prestar', $$
    INSERT INTO prestamo (id, equipo_id, persona_id, registrado_por, fecha_prevista) OVERRIDING SYSTEM VALUE
    VALUES (9003, 9002, 9001, 9001, CURRENT_DATE + 7)$$);

  PERFORM pg_temp.debe_ser('prestamo: la fecha de salida es hoy si no se indica', $$
    SELECT fecha_salida = CURRENT_DATE FROM prestamo WHERE id = 9003$$);

  PERFORM pg_temp.debe_fallar('prestamo: reabrir un préstamo choca si el equipo ya salió otra vez', 'unico', $$
    UPDATE prestamo SET fecha_devolucion = NULL, devolucion_registrada_por = NULL WHERE id = 9002$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- mantenimiento
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('mantenimiento: exige la descripción', 'obligatorio', $$
    INSERT INTO mantenimiento (equipo_id, registrado_por, fecha) VALUES (9002, 9001, CURRENT_DATE)$$);

  PERFORM pg_temp.debe_fallar('mantenimiento: exige la fecha', 'obligatorio', $$
    INSERT INTO mantenimiento (equipo_id, registrado_por, descripcion) VALUES (9002, 9001, 'Algo')$$);

  PERFORM pg_temp.debe_fallar('mantenimiento: rechaza un equipo que no existe', 'fk', $$
    INSERT INTO mantenimiento (equipo_id, registrado_por, fecha, descripcion) VALUES (999999, 9001, CURRENT_DATE, 'Algo')$$);

  PERFORM pg_temp.debe_fallar('mantenimiento: rechaza un usuario que no existe', 'fk', $$
    INSERT INTO mantenimiento (equipo_id, registrado_por, fecha, descripcion) VALUES (9002, 999999, CURRENT_DATE, 'Algo')$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- solicitud
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('solicitud: rechaza un tipo que no existe', 'check', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, fecha_desde, fecha_hasta, motivo)
    VALUES ('reserva', 9001, 9003, CURRENT_DATE + 1, CURRENT_DATE + 5, 'X')$$);

  PERFORM pg_temp.debe_fallar('solicitud: pedir equipo exige el equipo', 'check', $$
    INSERT INTO solicitud (tipo, persona_id, fecha_desde, fecha_hasta, motivo)
    VALUES ('equipo', 9001, CURRENT_DATE + 1, CURRENT_DATE + 5, 'X')$$);

  PERFORM pg_temp.debe_fallar('solicitud: pedir equipo exige la fecha desde', 'check', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, fecha_hasta, motivo)
    VALUES ('equipo', 9001, 9003, CURRENT_DATE + 5, 'X')$$);

  PERFORM pg_temp.debe_fallar('solicitud: pedir equipo no lleva préstamo', 'check', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, prestamo_id, fecha_desde, fecha_hasta, motivo)
    VALUES ('equipo', 9001, 9003, 9001, CURRENT_DATE + 1, CURRENT_DATE + 5, 'X')$$);

  PERFORM pg_temp.debe_fallar('solicitud: hasta debe ser posterior a desde', 'check', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, fecha_desde, fecha_hasta, motivo)
    VALUES ('equipo', 9001, 9003, CURRENT_DATE + 5, CURRENT_DATE + 5, 'X')$$);

  PERFORM pg_temp.debe_fallar('solicitud: pedir más tiempo exige el préstamo', 'check', $$
    INSERT INTO solicitud (tipo, persona_id, fecha_hasta, motivo)
    VALUES ('mas_tiempo', 9001, CURRENT_DATE + 5, 'X')$$);

  PERFORM pg_temp.debe_fallar('solicitud: pedir más tiempo no lleva equipo', 'check', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, prestamo_id, fecha_hasta, motivo)
    VALUES ('mas_tiempo', 9001, 9003, 9003, CURRENT_DATE + 9, 'X')$$);

  PERFORM pg_temp.debe_fallar('solicitud: exige el motivo', 'obligatorio', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, fecha_desde, fecha_hasta)
    VALUES ('equipo', 9001, 9003, CURRENT_DATE + 1, CURRENT_DATE + 5)$$);

  PERFORM pg_temp.debe_fallar('solicitud: rechaza un estado que no existe', 'check', $$
    UPDATE solicitud SET estado = 'cancelada' WHERE id = 9001$$);

  PERFORM pg_temp.debe_fallar('solicitud: aprobar exige quién respondió', 'check', $$
    UPDATE solicitud SET estado = 'aprobada', respondida_en = now() WHERE id = 9001$$);

  PERFORM pg_temp.debe_fallar('solicitud: aprobar exige cuándo se respondió', 'check', $$
    UPDATE solicitud SET estado = 'aprobada', respondida_por = 9001 WHERE id = 9001$$);

  PERFORM pg_temp.debe_fallar('solicitud: en revisión no tiene quién respondió', 'check', $$
    UPDATE solicitud SET respondida_por = 9001, respondida_en = now() WHERE id = 9001$$);

  PERFORM pg_temp.debe_fallar('solicitud: no se repite la misma petición de equipo pendiente', 'unico', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, fecha_desde, fecha_hasta, motivo)
    VALUES ('equipo', 9002, 9003, CURRENT_DATE + 2, CURRENT_DATE + 6, 'Otra vez')$$);

  PERFORM pg_temp.debe_fallar('solicitud: no se repite la petición de más tiempo pendiente', 'unico', $$
    INSERT INTO solicitud (tipo, persona_id, prestamo_id, fecha_hasta, motivo)
    VALUES ('mas_tiempo', 9002, 9001, CURRENT_DATE + 9, 'Otra vez')$$);

  PERFORM pg_temp.debe_pasar('solicitud: otra persona sí puede pedir el mismo equipo', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, fecha_desde, fecha_hasta, motivo)
    VALUES ('equipo', 9001, 9003, CURRENT_DATE + 1, CURRENT_DATE + 5, 'También lo necesito')$$);

  PERFORM pg_temp.debe_pasar('solicitud: se puede rechazar con respuesta', $$
    UPDATE solicitud SET estado = 'rechazada', respondida_por = 9001, respondida_en = now(),
                         respuesta = 'Ya estaba prestada en esas fechas'
    WHERE id = 9001$$);

  PERFORM pg_temp.debe_pasar('solicitud: tras un rechazo se puede volver a pedir', $$
    INSERT INTO solicitud (tipo, persona_id, equipo_id, fecha_desde, fecha_hasta, motivo)
    VALUES ('equipo', 9002, 9003, CURRENT_DATE + 8, CURRENT_DATE + 12, 'Otras fechas')$$);

  PERFORM pg_temp.debe_ser('solicitud: enviar una solicitud no cambia el estado del equipo', $$
    SELECT estado = 'disponible' FROM equipo WHERE id = 9003$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- aviso
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('aviso: rechaza un tipo que no existe', 'check', $$
    INSERT INTO aviso (tipo, prestamo_id, fecha_referencia, ejecucion_id)
    VALUES ('correo_enviado', 9001, CURRENT_DATE, 9001)$$);

  PERFORM pg_temp.debe_fallar('aviso: préstamo vencido exige el préstamo', 'check', $$
    INSERT INTO aviso (tipo, fecha_referencia, ejecucion_id)
    VALUES ('prestamo_vencido', CURRENT_DATE, 9001)$$);

  PERFORM pg_temp.debe_fallar('aviso: préstamo vencido no lleva equipo', 'check', $$
    INSERT INTO aviso (tipo, prestamo_id, equipo_id, fecha_referencia, ejecucion_id)
    VALUES ('prestamo_vencido', 9001, 9001, CURRENT_DATE, 9001)$$);

  PERFORM pg_temp.debe_fallar('aviso: mantenimiento pendiente exige el equipo', 'check', $$
    INSERT INTO aviso (tipo, fecha_referencia, ejecucion_id)
    VALUES ('mantenimiento_pendiente', CURRENT_DATE, 9001)$$);

  PERFORM pg_temp.debe_fallar('aviso: mantenimiento pendiente no lleva préstamo', 'check', $$
    INSERT INTO aviso (tipo, prestamo_id, equipo_id, fecha_referencia, ejecucion_id)
    VALUES ('mantenimiento_pendiente', 9001, 9002, CURRENT_DATE, 9001)$$);

  PERFORM pg_temp.debe_fallar('aviso: exige la ejecución que lo creó', 'obligatorio', $$
    INSERT INTO aviso (tipo, prestamo_id, fecha_referencia)
    VALUES ('prestamo_vencido', 9001, CURRENT_DATE)$$);

  PERFORM pg_temp.debe_fallar('aviso: repetir la revisión no duplica el aviso de vencido', 'unico', $$
    INSERT INTO aviso (tipo, prestamo_id, fecha_referencia, ejecucion_id)
    VALUES ('prestamo_vencido', 9001, CURRENT_DATE - 3, 9001)$$);

  PERFORM pg_temp.debe_fallar('aviso: repetir la revisión no duplica el aviso de mantenimiento', 'unico', $$
    INSERT INTO aviso (tipo, equipo_id, fecha_referencia, ejecucion_id)
    VALUES ('mantenimiento_pendiente', 9002, CURRENT_DATE - 40, 9001)$$);

  PERFORM pg_temp.debe_pasar('aviso: si la fecha prevista cambia y vuelve a vencer, hay aviso nuevo', $$
    INSERT INTO aviso (tipo, prestamo_id, fecha_referencia, ejecucion_id)
    VALUES ('prestamo_vencido', 9001, CURRENT_DATE - 1, 9001)$$);

  PERFORM pg_temp.debe_pasar('aviso: el siguiente mantenimiento del mismo equipo tiene su aviso', $$
    INSERT INTO aviso (tipo, equipo_id, fecha_referencia, ejecucion_id)
    VALUES ('mantenimiento_pendiente', 9002, CURRENT_DATE - 2, 9001)$$);

  PERFORM pg_temp.debe_fallar('aviso: no se borra una ejecución que creó avisos', 'restringido', $$
    DELETE FROM ejecucion_revision WHERE id = 9001$$);

  PERFORM pg_temp.debe_pasar('aviso: borrar el mantenimiento que lo resolvió no borra el aviso', $$
    DELETE FROM mantenimiento WHERE id = 9001$$);

  PERFORM pg_temp.debe_ser('aviso: el aviso sigue ahí, sin mantenimiento enlazado', $$
    SELECT mantenimiento_id IS NULL FROM aviso WHERE id = 9002$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- ejecucion_revision
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('ejecucion: rechaza un estado que no existe', 'check', $$
    INSERT INTO ejecucion_revision (estado) VALUES ('pausada')$$);

  PERFORM pg_temp.debe_fallar('ejecucion: no termina antes de empezar', 'check', $$
    INSERT INTO ejecucion_revision (estado, iniciado_en, finalizado_en)
    VALUES ('correcta', now(), now() - interval '1 minute')$$);

  PERFORM pg_temp.debe_fallar('ejecucion: rechaza un contador negativo', 'check', $$
    INSERT INTO ejecucion_revision (estado, avisos_creados) VALUES ('correcta', -1)$$);

  PERFORM pg_temp.debe_fallar('ejecucion: si falla, debe registrar el error', 'check', $$
    INSERT INTO ejecucion_revision (estado) VALUES ('fallida')$$);

  PERFORM pg_temp.debe_fallar('ejecucion: si no falla, no lleva error', 'check', $$
    INSERT INTO ejecucion_revision (estado, error) VALUES ('correcta', 'algo')$$);

  PERFORM pg_temp.debe_pasar('ejecucion: una corrida fallida guarda su error', $$
    INSERT INTO ejecucion_revision (estado, finalizado_en, error)
    VALUES ('fallida', now(), 'No se pudo conectar a la base')$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- configuracion
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_ser('configuracion: el esquema deja la única fila ya creada', $$
    SELECT count(*) = 1 FROM configuracion$$);

  PERFORM pg_temp.debe_fallar('configuracion: rechaza una segunda fila con otro id', 'check', $$
    INSERT INTO configuracion (id) VALUES (2)$$);

  PERFORM pg_temp.debe_fallar('configuracion: rechaza una segunda fila con el mismo id', 'unico', $$
    INSERT INTO configuracion (id) VALUES (1)$$);

  PERFORM pg_temp.debe_pasar('configuracion: la hora y la zona horaria se pueden cambiar', $$
    UPDATE configuracion SET hora_revision = '07:30', zona_horaria = 'America/Mexico_City' WHERE id = 1$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- auditoria
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_fallar('auditoria: rechaza una acción que no existe', 'check', $$
    INSERT INTO auditoria (usuario_id, accion, registro_id, datos) VALUES (9002, 'editar_prestamo', 9001, '{}')$$);

  PERFORM pg_temp.debe_fallar('auditoria: eliminar un préstamo exige motivo', 'check', $$
    INSERT INTO auditoria (usuario_id, accion, registro_id, datos) VALUES (9002, 'eliminar_prestamo', 9001, '{}')$$);

  PERFORM pg_temp.debe_fallar('auditoria: dar de baja no acepta un motivo en blanco', 'check', $$
    INSERT INTO auditoria (usuario_id, accion, registro_id, motivo, datos) VALUES (9002, 'baja_equipo', 9004, '   ', '{}')$$);

  PERFORM pg_temp.debe_fallar('auditoria: exige los datos del registro', 'obligatorio', $$
    INSERT INTO auditoria (usuario_id, accion, registro_id, motivo) VALUES (9002, 'baja_equipo', 9004, 'Pantalla rota')$$);

  PERFORM pg_temp.debe_fallar('auditoria: rechaza un usuario que no existe', 'fk', $$
    INSERT INTO auditoria (usuario_id, accion, registro_id, datos) VALUES (999999, 'crear_cuenta', 9003, '{}')$$);

  PERFORM pg_temp.debe_pasar('auditoria: corregir una fecha no exige motivo', $$
    INSERT INTO auditoria (usuario_id, accion, registro_id, datos)
    VALUES (9001, 'corregir_fecha', 9001, '{"antes": "2026-11-07", "despues": "2026-11-14"}')$$);

  PERFORM pg_temp.debe_pasar('auditoria: eliminar un préstamo con motivo queda registrado', $$
    INSERT INTO auditoria (usuario_id, accion, registro_id, motivo, datos)
    VALUES (9002, 'eliminar_prestamo', 9001, 'Se registró por error', '{"equipo": "Laptop 9001", "persona": "Luis Prueba"}')$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- Borrados en cascada
-- ---------------------------------------------------------------------------
DO $pruebas$
BEGIN
  PERFORM pg_temp.debe_pasar('cascada: un préstamo se puede eliminar aunque tenga avisos y solicitudes', $$
    DELETE FROM prestamo WHERE id = 9001$$);

  PERFORM pg_temp.debe_ser('cascada: sus avisos se fueron con él', $$
    SELECT count(*) = 0 FROM aviso WHERE id = 9001$$);

  PERFORM pg_temp.debe_ser('cascada: su solicitud de más tiempo se fue con él', $$
    SELECT count(*) = 0 FROM solicitud WHERE id = 9002$$);

  PERFORM pg_temp.debe_ser('cascada: la constancia en auditoría sigue aunque el préstamo ya no exista', $$
    SELECT count(*) = 1 FROM auditoria WHERE accion = 'eliminar_prestamo' AND registro_id = 9001$$);

  PERFORM pg_temp.debe_pasar('cascada: un equipo sin préstamos ni mantenimientos se elimina con sus solicitudes', $$
    DELETE FROM equipo WHERE id = 9003$$);

  PERFORM pg_temp.debe_ser('cascada: las solicitudes de ese equipo se fueron con él', $$
    SELECT count(*) = 0 FROM solicitud WHERE equipo_id = 9003$$);
END $pruebas$;

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
SELECT CASE WHEN ok THEN 'ok' ELSE 'FALLA' END AS resultado, nombre, detalle
FROM resultado ORDER BY n;

SELECT count(*) FILTER (WHERE ok) AS pasaron, count(*) FILTER (WHERE NOT ok) AS fallaron
FROM resultado;

ROLLBACK;
