-- Relevo: esquema de la base de datos (PostgreSQL)
-- Detalle de cada tabla en ../diccionario-de-datos.md

BEGIN;

CREATE TABLE usuario (
    id                    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                VARCHAR(100) NOT NULL,
    email                 VARCHAR(150) NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,
    rol                   VARCHAR(20)  NOT NULL
        CHECK (rol IN ('encargado', 'administrador', 'usuario')),
    activo                BOOLEAN      NOT NULL DEFAULT true,
    debe_cambiar_password BOOLEAN      NOT NULL DEFAULT true,
    ultimo_acceso         TIMESTAMPTZ,
    creado_en             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_email_uk ON usuario (lower(email));

CREATE TABLE persona (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    usuario_id INT UNIQUE REFERENCES usuario (id) ON DELETE RESTRICT,
    creado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX persona_nombre_uk ON persona (lower(nombre));

CREATE TABLE equipo (
    id                             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo                           VARCHAR(20) NOT NULL
        CHECK (tipo IN ('laptop', 'monitor', 'cable')),
    numero                         INT         NOT NULL CHECK (numero > 0),
    numero_serie                   VARCHAR(50) UNIQUE,
    estado                         VARCHAR(20) NOT NULL DEFAULT 'disponible'
        CHECK (estado IN ('disponible', 'prestado', 'de_baja')),
    ultimo_mantenimiento           DATE,
    proximo_mantenimiento          DATE,
    frecuencia_mantenimiento_meses INT CHECK (frecuencia_mantenimiento_meses > 0),
    dado_de_baja_en                TIMESTAMPTZ,
    creado_en                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT equipo_tipo_numero_uk UNIQUE (tipo, numero),
    CONSTRAINT equipo_mantenimiento_ck
        CHECK (proximo_mantenimiento > ultimo_mantenimiento),
    CONSTRAINT equipo_baja_ck
        CHECK ((estado = 'de_baja') = (dado_de_baja_en IS NOT NULL))
);
CREATE INDEX equipo_estado_idx ON equipo (estado);
CREATE INDEX equipo_proximo_mantenimiento_idx ON equipo (proximo_mantenimiento);

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

CREATE TABLE mantenimiento (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipo_id      INT  NOT NULL REFERENCES equipo (id)  ON DELETE RESTRICT,
    registrado_por INT  NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
    fecha          DATE NOT NULL,
    descripcion    TEXT NOT NULL,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mantenimiento_equipo_fecha_idx ON mantenimiento (equipo_id, fecha);

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

CREATE TABLE configuracion (
    id             SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    hora_revision  TIME        NOT NULL DEFAULT '06:00',
    zona_horaria   VARCHAR(50) NOT NULL DEFAULT 'America/Guatemala',
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO configuracion DEFAULT VALUES;

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

COMMIT;
