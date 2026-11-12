-- Relevo: esquema de la base de datos (PostgreSQL)
-- Detalle de cada tabla en ../diccionario-de-datos.md
--
-- Todo vive en el schema "relevo", no en "public". La aplicación debe
-- conectarse con search_path = relevo (o calificar las tablas: relevo.equipo).

BEGIN;

CREATE SCHEMA IF NOT EXISTS relevo;
COMMENT ON SCHEMA relevo IS 'Objetos de Relevo: préstamos de equipo, inventario y mantenimiento';

-- Solo dura esta transacción: las tablas de abajo se crean en "relevo"
SET LOCAL search_path TO relevo;

-- ---------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------

CREATE TABLE rol (
    id     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(20) NOT NULL UNIQUE
);
INSERT INTO rol (nombre) VALUES ('encargado'), ('administrador'), ('usuario');

COMMENT ON TABLE rol IS 'Catálogo de roles de las cuentas. Lo que puede hacer cada rol lo decide el servidor';
COMMENT ON COLUMN rol.id IS 'Identificador';
COMMENT ON COLUMN rol.nombre IS 'Nombre del rol: encargado, administrador o usuario';

CREATE TABLE tipo_equipo (
    id     SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE
);
INSERT INTO tipo_equipo (nombre) VALUES ('laptop'), ('monitor'), ('cable');

COMMENT ON TABLE tipo_equipo IS 'Catálogo de tipos de equipo. Agregar un tipo nuevo (UPS, teclado) es insertar una fila';
COMMENT ON COLUMN tipo_equipo.id IS 'Identificador';
COMMENT ON COLUMN tipo_equipo.nombre IS 'Nombre del tipo: laptop, monitor, cable';

-- ---------------------------------------------------------------------------
-- Cuentas y personas
-- ---------------------------------------------------------------------------

CREATE TABLE usuario (
    id                    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                VARCHAR(100) NOT NULL,
    email                 VARCHAR(150) NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,
    rol_id                SMALLINT     NOT NULL REFERENCES rol (id) ON DELETE RESTRICT,
    activo                BOOLEAN      NOT NULL DEFAULT true,
    debe_cambiar_password BOOLEAN      NOT NULL DEFAULT true,
    ultimo_acceso         TIMESTAMPTZ,
    creado_en             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_email_uk ON usuario (lower(email));

COMMENT ON TABLE usuario IS 'Cuentas que inician sesión en el sistema. No se borran, se desactivan';
COMMENT ON COLUMN usuario.id IS 'Identificador';
COMMENT ON COLUMN usuario.nombre IS 'Nombre completo';
COMMENT ON COLUMN usuario.email IS 'Correo con el que inicia sesión. Único sin distinguir mayúsculas';
COMMENT ON COLUMN usuario.password_hash IS 'Hash de la contraseña, nunca el texto';
COMMENT ON COLUMN usuario.rol_id IS 'Rol de la cuenta (FK a rol)';
COMMENT ON COLUMN usuario.activo IS 'En false la cuenta está desactivada y no puede entrar';
COMMENT ON COLUMN usuario.debe_cambiar_password IS 'True mientras use la contraseña temporal con la que se creó';
COMMENT ON COLUMN usuario.ultimo_acceso IS 'Último inicio de sesión. Nulo si nunca ha entrado';
COMMENT ON COLUMN usuario.creado_en IS 'Cuándo se creó';
COMMENT ON COLUMN usuario.actualizado_en IS 'Último cambio';

CREATE TABLE persona (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    usuario_id INT UNIQUE REFERENCES usuario (id) ON DELETE RESTRICT,
    creado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX persona_nombre_uk ON persona (lower(nombre));

COMMENT ON TABLE persona IS 'Quien recibe un equipo (campo "Recibe" del préstamo). Está separada de usuario porque la mayoría de quienes reciben equipo no tienen cuenta en el sistema';
COMMENT ON COLUMN persona.id IS 'Identificador';
COMMENT ON COLUMN persona.nombre IS 'Nombre completo. Único sin distinguir mayúsculas';
COMMENT ON COLUMN persona.usuario_id IS 'Su cuenta, si tiene (FK a usuario). Nulo cuando la persona no entra al sistema. Una cuenta pertenece a una sola persona';
COMMENT ON COLUMN persona.creado_en IS 'Cuándo se creó';

-- ---------------------------------------------------------------------------
-- Inventario
-- ---------------------------------------------------------------------------

CREATE TABLE equipo (
    id                             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_equipo_id                 SMALLINT    NOT NULL REFERENCES tipo_equipo (id) ON DELETE RESTRICT,
    numero                         INT         NOT NULL CHECK (numero > 0),
    numero_serie                   VARCHAR(50) UNIQUE,
    estado                         VARCHAR(20) NOT NULL DEFAULT 'disponible'
        CHECK (estado IN ('disponible', 'prestado', 'en_mantenimiento', 'de_baja')),
    ultimo_mantenimiento           DATE,
    proximo_mantenimiento          DATE,
    frecuencia_mantenimiento_meses INT CHECK (frecuencia_mantenimiento_meses > 0),
    dado_de_baja_en                TIMESTAMPTZ,
    creado_en                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT equipo_tipo_numero_uk UNIQUE (tipo_equipo_id, numero),
    CONSTRAINT equipo_mantenimiento_ck
        CHECK (proximo_mantenimiento > ultimo_mantenimiento),
    CONSTRAINT equipo_baja_ck
        CHECK ((estado = 'de_baja') = (dado_de_baja_en IS NOT NULL))
);
CREATE INDEX equipo_estado_idx ON equipo (estado);
CREATE INDEX equipo_proximo_mantenimiento_idx ON equipo (proximo_mantenimiento);

COMMENT ON TABLE equipo IS 'Inventario. Un equipo se identifica por su tipo y su número, por ejemplo "Laptop 12"';
COMMENT ON COLUMN equipo.id IS 'Identificador';
COMMENT ON COLUMN equipo.tipo_equipo_id IS 'Tipo de equipo (FK a tipo_equipo)';
COMMENT ON COLUMN equipo.numero IS 'Número de inventario dentro de su tipo: el 12 de "Laptop 12". Es la etiqueta con la que el encargado ubica el equipo; no se repite dentro del tipo';
COMMENT ON COLUMN equipo.numero_serie IS 'Número de serie del fabricante. Opcional (los cables no tienen), único si existe';
COMMENT ON COLUMN equipo.estado IS 'disponible: se puede prestar. prestado: tiene un préstamo abierto. en_mantenimiento: está en reparación o servicio y no se puede prestar. de_baja: retirado del inventario';
COMMENT ON COLUMN equipo.ultimo_mantenimiento IS 'Fecha del último mantenimiento';
COMMENT ON COLUMN equipo.proximo_mantenimiento IS 'Fecha en que toca el siguiente. Posterior al último';
COMMENT ON COLUMN equipo.frecuencia_mantenimiento_meses IS 'Cada cuántos meses toca mantenimiento';
COMMENT ON COLUMN equipo.dado_de_baja_en IS 'Cuándo se dio de baja. Obligatorio si el estado es de_baja, nulo en cualquier otro';
COMMENT ON COLUMN equipo.creado_en IS 'Cuándo se creó';
COMMENT ON COLUMN equipo.actualizado_en IS 'Último cambio';

-- ---------------------------------------------------------------------------
-- Préstamos
-- ---------------------------------------------------------------------------

CREATE TABLE prestamo (
    id                        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipo_id                 INT  NOT NULL REFERENCES equipo (id)  ON DELETE RESTRICT,
    persona_id                INT  NOT NULL REFERENCES persona (id) ON DELETE RESTRICT,
    registrado_por            INT  NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
    fecha_salida              DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_prevista            DATE NOT NULL,
    fecha_devolucion          DATE,
    devolucion_registrada_por INT REFERENCES usuario (id) ON DELETE RESTRICT,
    nota                      TEXT,
    observaciones_devolucion  TEXT,
    creado_en                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT prestamo_fechas_ck CHECK (fecha_prevista > fecha_salida),
    CONSTRAINT prestamo_devolucion_ck CHECK (fecha_devolucion >= fecha_salida),
    CONSTRAINT prestamo_devolucion_completa_ck
        CHECK ((fecha_devolucion IS NULL) = (devolucion_registrada_por IS NULL))
);
-- Un equipo, un préstamo abierto
CREATE UNIQUE INDEX prestamo_abierto_uk ON prestamo (equipo_id)
    WHERE fecha_devolucion IS NULL;
CREATE INDEX prestamo_persona_idx ON prestamo (persona_id);
CREATE INDEX prestamo_fecha_prevista_idx ON prestamo (fecha_prevista)
    WHERE fecha_devolucion IS NULL;

COMMENT ON TABLE prestamo IS 'Cada entrega de un equipo a una persona. Está abierto mientras fecha_devolucion sea nula';
COMMENT ON COLUMN prestamo.id IS 'Identificador. El comprobante "PR-0148" es este número';
COMMENT ON COLUMN prestamo.equipo_id IS 'Equipo prestado (FK a equipo)';
COMMENT ON COLUMN prestamo.persona_id IS 'Quien lo recibe (FK a persona)';
COMMENT ON COLUMN prestamo.registrado_por IS 'Cuenta que registró el préstamo (FK a usuario)';
COMMENT ON COLUMN prestamo.fecha_salida IS 'Día en que salió el equipo';
COMMENT ON COLUMN prestamo.fecha_prevista IS 'Día en que debe devolverse. Posterior a la salida';
COMMENT ON COLUMN prestamo.fecha_devolucion IS 'Día en que se devolvió. Nulo mientras el préstamo esté abierto';
COMMENT ON COLUMN prestamo.devolucion_registrada_por IS 'Cuenta que registró la devolución (FK a usuario). Va junto con fecha_devolucion';
COMMENT ON COLUMN prestamo.nota IS 'Para qué se presta, accesorios que se entregan';
COMMENT ON COLUMN prestamo.observaciones_devolucion IS 'Cómo volvió el equipo';
COMMENT ON COLUMN prestamo.creado_en IS 'Cuándo se registró';
COMMENT ON COLUMN prestamo.actualizado_en IS 'Último cambio';

-- ---------------------------------------------------------------------------
-- Mantenimiento
-- ---------------------------------------------------------------------------

CREATE TABLE mantenimiento (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipo_id      INT  NOT NULL REFERENCES equipo (id)  ON DELETE RESTRICT,
    registrado_por INT  NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
    fecha          DATE NOT NULL,
    descripcion    TEXT NOT NULL,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mantenimiento_equipo_fecha_idx ON mantenimiento (equipo_id, fecha);

COMMENT ON TABLE mantenimiento IS 'Historial de mantenimientos ya realizados. Una fila por cada servicio o reparación terminada';
COMMENT ON COLUMN mantenimiento.id IS 'Identificador';
COMMENT ON COLUMN mantenimiento.equipo_id IS 'Equipo atendido (FK a equipo)';
COMMENT ON COLUMN mantenimiento.registrado_por IS 'Cuenta que lo registró (FK a usuario)';
COMMENT ON COLUMN mantenimiento.fecha IS 'Día en que se hizo';
COMMENT ON COLUMN mantenimiento.descripcion IS 'Qué se le hizo al equipo. Obligatoria';
COMMENT ON COLUMN mantenimiento.creado_en IS 'Cuándo se registró';

-- ---------------------------------------------------------------------------
-- Solicitudes del rol Usuario
-- ---------------------------------------------------------------------------

CREATE TABLE solicitud (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('equipo', 'mas_tiempo')),
    persona_id     INT NOT NULL REFERENCES persona (id) ON DELETE RESTRICT,
    equipo_id      INT REFERENCES equipo (id)   ON DELETE CASCADE,
    prestamo_id    INT REFERENCES prestamo (id) ON DELETE CASCADE,
    fecha_desde    DATE,
    fecha_hasta    DATE NOT NULL,
    motivo         TEXT NOT NULL,
    estado         VARCHAR(20) NOT NULL DEFAULT 'en_revision'
        CHECK (estado IN ('en_revision', 'aprobada', 'rechazada')),
    respondida_por INT REFERENCES usuario (id) ON DELETE RESTRICT,
    respondida_en  TIMESTAMPTZ,
    respuesta      TEXT,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT solicitud_tipo_ck CHECK (
        (tipo = 'equipo'
            AND equipo_id IS NOT NULL AND fecha_desde IS NOT NULL
            AND prestamo_id IS NULL AND fecha_hasta > fecha_desde)
        OR
        (tipo = 'mas_tiempo'
            AND prestamo_id IS NOT NULL
            AND equipo_id IS NULL AND fecha_desde IS NULL)
    ),
    CONSTRAINT solicitud_respuesta_ck CHECK (
        (estado = 'en_revision'
            AND respondida_por IS NULL AND respondida_en IS NULL)
        OR
        (estado <> 'en_revision'
            AND respondida_por IS NOT NULL AND respondida_en IS NOT NULL)
    )
);
CREATE UNIQUE INDEX solicitud_equipo_en_revision_uk
    ON solicitud (persona_id, equipo_id)
    WHERE tipo = 'equipo' AND estado = 'en_revision';
CREATE UNIQUE INDEX solicitud_prestamo_en_revision_uk
    ON solicitud (prestamo_id)
    WHERE tipo = 'mas_tiempo' AND estado = 'en_revision';
CREATE INDEX solicitud_estado_idx ON solicitud (estado);

COMMENT ON TABLE solicitud IS 'Lo que pide alguien con rol usuario: un equipo, o más tiempo para un préstamo que ya tiene. El encargado la aprueba o la rechaza. No aparta el equipo';
COMMENT ON COLUMN solicitud.id IS 'Identificador';
COMMENT ON COLUMN solicitud.tipo IS 'equipo: pide un equipo. mas_tiempo: pide alargar un préstamo';
COMMENT ON COLUMN solicitud.persona_id IS 'Quien la pide (FK a persona)';
COMMENT ON COLUMN solicitud.equipo_id IS 'Equipo pedido (FK a equipo). Solo si el tipo es equipo';
COMMENT ON COLUMN solicitud.prestamo_id IS 'Préstamo que se quiere alargar (FK a prestamo). Solo si el tipo es mas_tiempo';
COMMENT ON COLUMN solicitud.fecha_desde IS 'Desde cuándo necesita el equipo. Solo si el tipo es equipo';
COMMENT ON COLUMN solicitud.fecha_hasta IS 'Hasta cuándo lo necesita, o la nueva fecha de devolución si es mas_tiempo';
COMMENT ON COLUMN solicitud.motivo IS 'Para qué lo necesita. Obligatorio';
COMMENT ON COLUMN solicitud.estado IS 'en_revision, aprobada o rechazada';
COMMENT ON COLUMN solicitud.respondida_por IS 'Cuenta que la respondió (FK a usuario). Nulo mientras esté en revisión';
COMMENT ON COLUMN solicitud.respondida_en IS 'Cuándo se respondió. Nulo mientras esté en revisión';
COMMENT ON COLUMN solicitud.respuesta IS 'Explicación de la respuesta, sobre todo si se rechaza';
COMMENT ON COLUMN solicitud.creado_en IS 'Cuándo se envió';

-- ---------------------------------------------------------------------------
-- Revisión diaria y avisos
-- ---------------------------------------------------------------------------

CREATE TABLE ejecucion_revision (
    id                        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    iniciado_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizado_en             TIMESTAMPTZ,
    estado                    VARCHAR(20) NOT NULL
        CHECK (estado IN ('en_curso', 'correcta', 'fallida')),
    prestamos_vencidos        INT NOT NULL DEFAULT 0 CHECK (prestamos_vencidos >= 0),
    mantenimientos_pendientes INT NOT NULL DEFAULT 0 CHECK (mantenimientos_pendientes >= 0),
    avisos_creados            INT NOT NULL DEFAULT 0 CHECK (avisos_creados >= 0),
    error                     TEXT,
    CONSTRAINT ejecucion_fechas_ck CHECK (finalizado_en >= iniciado_en),
    CONSTRAINT ejecucion_error_ck CHECK ((estado = 'fallida') = (error IS NOT NULL))
);

COMMENT ON TABLE ejecucion_revision IS 'Bitácora de la revisión diaria: la tarea programada que cada día busca préstamos vencidos y mantenimientos pendientes y crea los avisos. Una fila por cada corrida, para saber si corrió, qué encontró y si falló';
COMMENT ON COLUMN ejecucion_revision.id IS 'Identificador';
COMMENT ON COLUMN ejecucion_revision.iniciado_en IS 'Cuándo empezó la corrida';
COMMENT ON COLUMN ejecucion_revision.finalizado_en IS 'Cuándo terminó. Nulo mientras está en curso';
COMMENT ON COLUMN ejecucion_revision.estado IS 'en_curso, correcta o fallida';
COMMENT ON COLUMN ejecucion_revision.prestamos_vencidos IS 'Préstamos vencidos que encontró';
COMMENT ON COLUMN ejecucion_revision.mantenimientos_pendientes IS 'Mantenimientos pendientes que encontró';
COMMENT ON COLUMN ejecucion_revision.avisos_creados IS 'Avisos nuevos que creó (los que ya existían no se duplican)';
COMMENT ON COLUMN ejecucion_revision.error IS 'Mensaje de error. Obligatorio si el estado es fallida, nulo en cualquier otro';

CREATE TABLE aviso (
    id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo             VARCHAR(30) NOT NULL
        CHECK (tipo IN ('prestamo_vencido', 'mantenimiento_pendiente')),
    prestamo_id      INT REFERENCES prestamo (id) ON DELETE CASCADE,
    equipo_id        INT REFERENCES equipo (id)   ON DELETE CASCADE,
    fecha_referencia DATE NOT NULL,
    ejecucion_id     INT  NOT NULL REFERENCES ejecucion_revision (id) ON DELETE RESTRICT,
    mantenimiento_id INT REFERENCES mantenimiento (id) ON DELETE SET NULL,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelto_en      TIMESTAMPTZ,
    CONSTRAINT aviso_tipo_ck CHECK (
        (tipo = 'prestamo_vencido'
            AND prestamo_id IS NOT NULL AND equipo_id IS NULL)
        OR
        (tipo = 'mantenimiento_pendiente'
            AND equipo_id IS NOT NULL AND prestamo_id IS NULL)
    )
);
-- Repetir la revisión no duplica avisos
CREATE UNIQUE INDEX aviso_prestamo_uk ON aviso (prestamo_id, fecha_referencia)
    WHERE tipo = 'prestamo_vencido';
CREATE UNIQUE INDEX aviso_equipo_uk ON aviso (equipo_id, fecha_referencia)
    WHERE tipo = 'mantenimiento_pendiente';

COMMENT ON TABLE aviso IS 'Avisos que crea la revisión diaria: préstamos vencidos y mantenimientos pendientes';
COMMENT ON COLUMN aviso.id IS 'Identificador';
COMMENT ON COLUMN aviso.tipo IS 'prestamo_vencido o mantenimiento_pendiente';
COMMENT ON COLUMN aviso.prestamo_id IS 'Préstamo vencido (FK a prestamo). Solo en avisos de prestamo_vencido';
COMMENT ON COLUMN aviso.equipo_id IS 'Equipo con mantenimiento pendiente (FK a equipo). Solo en avisos de mantenimiento_pendiente';
COMMENT ON COLUMN aviso.fecha_referencia IS 'La fecha que venció o en la que tocaba el mantenimiento';
COMMENT ON COLUMN aviso.ejecucion_id IS 'Corrida de la revisión diaria que lo creó (FK a ejecucion_revision)';
COMMENT ON COLUMN aviso.mantenimiento_id IS 'Mantenimiento que resolvió el aviso (FK a mantenimiento)';
COMMENT ON COLUMN aviso.creado_en IS 'Cuándo se creó';
COMMENT ON COLUMN aviso.resuelto_en IS 'Cuándo se resolvió. Nulo mientras siga abierto';

CREATE TABLE configuracion (
    id             SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    hora_revision  TIME        NOT NULL DEFAULT '06:00',
    zona_horaria   VARCHAR(50) NOT NULL DEFAULT 'America/Guatemala',
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO configuracion DEFAULT VALUES;

COMMENT ON TABLE configuracion IS 'Hora y zona horaria de la revisión diaria. Tiene una sola fila, que crea este script';
COMMENT ON COLUMN configuracion.id IS 'Siempre vale 1: impide crear una segunda fila';
COMMENT ON COLUMN configuracion.hora_revision IS 'Hora a la que corre la revisión diaria';
COMMENT ON COLUMN configuracion.zona_horaria IS 'Zona horaria de esa hora (nombre IANA)';
COMMENT ON COLUMN configuracion.actualizado_en IS 'Último cambio';

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------

CREATE TABLE auditoria (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id  INT         NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
    accion      VARCHAR(30) NOT NULL
        CHECK (accion IN ('eliminar_prestamo', 'corregir_fecha', 'baja_equipo',
                          'eliminar_equipo', 'crear_cuenta')),
    registro_id INT         NOT NULL,
    motivo      TEXT,
    datos       JSONB       NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT auditoria_motivo_ck CHECK (
        (motivo IS NULL OR btrim(motivo) <> '')
        AND (accion NOT IN ('eliminar_prestamo', 'baja_equipo') OR motivo IS NOT NULL)
    )
);
CREATE INDEX auditoria_accion_registro_idx ON auditoria (accion, registro_id);

COMMENT ON TABLE auditoria IS 'Rastro de los cambios sensibles. Solo se insertan filas, nunca se editan ni se borran';
COMMENT ON COLUMN auditoria.id IS 'Identificador';
COMMENT ON COLUMN auditoria.usuario_id IS 'Cuenta que hizo la acción (FK a usuario)';
COMMENT ON COLUMN auditoria.accion IS 'eliminar_prestamo, corregir_fecha, baja_equipo, eliminar_equipo o crear_cuenta';
COMMENT ON COLUMN auditoria.registro_id IS 'Id del registro afectado. Sin FK porque el registro puede ya no existir; la acción indica a qué tabla se refiere';
COMMENT ON COLUMN auditoria.motivo IS 'Por qué se hizo. Obligatorio al eliminar un préstamo o dar de baja un equipo';
COMMENT ON COLUMN auditoria.datos IS 'Datos mínimos del registro, o el valor de antes y el de después';
COMMENT ON COLUMN auditoria.creado_en IS 'Cuándo ocurrió';

COMMIT;
