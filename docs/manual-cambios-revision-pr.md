# Manual de los cambios de la revisión del PR

Este manual explica qué se cambió después de la revisión del PR del proyecto base (Issue #4), para qué sirve cada cambio y cómo usarlo en el día a día.

Todo está sin commitear: los cambios están en el árbol de trabajo de la rama `feature/proyecto-base`.

| # | Cambio | Comentario del revisor | Estado |
|---|--------|------------------------|--------|
| 1 | Migración a TypeScript | Migrar a TypeScript | Hecho |
| 2 | ESLint y Prettier | Agregar linter/Prettier | Hecho |
| 3 | Base de datos en UTC | Guardar la base en UTC | Hecho |
| 4 | Prisma / ORM | Usar Prisma u otro ORM | Omitido por ahora |
| 5 | Revalidación de la API | Validar la API solo al cargar | Hecho |

---

## 1. TypeScript

### Qué es
TypeScript es JavaScript con tipos: cada dato declara qué forma tiene (texto, número, un objeto con ciertos campos). Un error como pasar un número donde va un texto se detecta al revisar el código, no cuando el usuario ya lo está usando.

### Qué cambió
| Antes | Ahora |
|-------|-------|
| `servidor/src/*.js` | `servidor/src/*.ts` |
| `servidor/pruebas/*.test.js` | `servidor/pruebas/*.test.ts` |
| `cliente/src/App.jsx`, `main.jsx` | `App.tsx`, `main.tsx` |
| `cliente/vite.config.js` | `cliente/vite.config.ts` |
| (no existía) | `servidor/tsconfig.json`, `cliente/tsconfig.json` |

Los imports del servidor ahora llevan la extensión real (`'./app.ts'` en lugar de `'./app.js'`).

### Cómo funciona sin paso de compilación
- **Servidor:** Node 22.18 o superior ejecuta archivos `.ts` directamente, quitando los tipos al cargarlos. No hay carpeta `dist` ni compilador en medio. Por eso `engines.node` y el README ahora piden **Node 22.18 o superior** (antes 22.9).
- **Cliente:** Vite entiende `.tsx` por sí mismo.
- **Revisión de tipos:** como ni Node ni Vite revisan los tipos, esa tarea la hace `tsc` con `noEmit` (revisa, no genera archivos).

```bash
npm run tipos
```

`npm run build` también corre `tsc` antes de `vite build`, así que un error de tipos impide construir el cliente.

### Reglas que se activaron
- `strict: true`: la configuración estricta de TypeScript.
- `erasableSyntaxOnly` (servidor): prohíbe sintaxis de TypeScript que Node no sabe quitar, como `enum`.
- `verbatimModuleSyntax`: los tipos se importan con `import type`, para que se borren por completo al ejecutar.

### Tipos que se agregaron
- `servidor/src/app.ts`: `FilaSalud` (la fila que devuelve la consulta de salud) y `ConsultaBd` (lo único que la app necesita del pool). Gracias a `ConsultaBd`, las pruebas pueden pasar un pool falso.
- `cliente/src/useSalud.ts`: `RespuestaSalud` (el cuerpo de `/api/salud`) y `Salud` (los tres estados de la pantalla).

---

## 2. ESLint y Prettier

### Para qué sirve cada uno
- **Prettier** decide el formato: sangría, comillas, saltos de línea. Nadie discute estilo, la herramienta lo aplica.
- **ESLint** busca errores y malas prácticas: variables sin usar, reglas de los hooks de React, etc.
- `eslint-config-prettier` apaga las reglas de ESLint que chocarían con Prettier. Cada uno hace lo suyo.

### Archivos nuevos (en la raíz)
| Archivo | Contenido |
|---------|-----------|
| `.prettierrc` | `endOfLine: "lf"`, comillas simples, ancho de 100 columnas |
| `.prettierignore` | Lo que no se formatea: `node_modules`, `dist`, `package-lock.json`, `Relevo-db`, `assets`, `*.md` |
| `eslint.config.js` | Reglas recomendadas de ESLint y typescript-eslint; reglas de hooks de React solo para el cliente |
| `.gitattributes` | Fuerza saltos de línea LF en el repositorio |

### El problema de CRLF
En Windows, Git convierte entre CRLF y LF y avisa en cada commit. Se resolvió en dos capas:
1. `.prettierrc` con `endOfLine: "lf"` deja todo el código con LF.
2. `.gitattributes` con `* text=auto eol=lf` hace que Git guarde y entregue siempre LF.

### Comandos
| Comando | Qué hace |
|---------|----------|
| `npm run formato` | Da formato a todo el proyecto |
| `npm run formato:revisar` | Solo comprueba si algo está mal formateado (sirve para CI) |
| `npm run lint` | Muestra los problemas que encuentra ESLint |
| `npm run lint:arreglar` | Corrige automáticamente lo que se pueda |

El primer `npm run formato` tocó varios archivos, por ejemplo `servidor/src/index.ts`, que tenía una sangría rara de 4 espacios, y `docker-compose.yml`, que pasó a comillas simples.

> Los archivos `.md` no se formatean a propósito, para no reescribir tablas y textos de la documentación.

### Sugerencia para el editor
Con la extensión de Prettier en VS Code y "Format on Save", el formato se aplica solo al guardar.

---

## 3. Base de datos en UTC

### La idea
Las fechas se **guardan y viajan en UTC**, y solo se convierten a hora de Guatemala **al mostrarlas**. UTC es la misma hora en cualquier parte, así que se evitan ambigüedades si el servidor cambia de zona o si el equipo trabaja desde otro lugar.

### Qué cambió en `docker-compose.yml`
```yaml
command: ['postgres', '-c', 'timezone=UTC', '-c', 'log_timezone=UTC']
environment:
  TZ: UTC
```

- `TZ: UTC` cambia la zona del sistema dentro del contenedor.
- `command` fija la zona de PostgreSQL por parámetro. Hace falta porque, en una base ya creada, `TZ` no cambia lo que `initdb` dejó escrito en `postgresql.conf`. Antes de este cambio la base existente respondía `America/Guatemala` aunque se editara `TZ`.

Además, `servidor/src/config.ts` abre cada conexión con `-c timezone=UTC`, así que la aplicación trabaja en UTC aunque la base se configure distinto.

### Dónde se convierte a hora local
En el cliente, `App.tsx` usa `Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala' })` para mostrar "Última comprobación". Ese es el patrón a seguir: el servidor entrega UTC, el cliente convierte.

### Qué no cambió
La columna `zona_horaria` del esquema (valor por defecto `America/Guatemala`) sigue igual. Es la preferencia de zona de cada registro para mostrar, no la zona de almacenamiento.

### Cómo aplicarlo en tu máquina
```bash
docker compose up -d
```
Compose recrea el contenedor con el parámetro nuevo; **los datos se conservan**. No hace falta `down -v`. Para comprobarlo:
```bash
docker compose exec db psql -U relevo -d relevo -Atc "show timezone"
```
Debe responder `UTC`.

### Prueba nueva
`servidor/pruebas/bd.test.ts` incluye "cada conexión trabaja en UTC".

---

## 4. Prisma / ORM (omitido)

No se hizo, por decisión de esta ronda. Motivo para responder en el PR: el esquema ya está escrito en SQL (`01-esquema.sql`) y lo verifican 113 pruebas directamente sobre la base. Un ORM obligaría a rehacer el esquema y esas pruebas, y eso es demasiado para el alcance del Issue #4. Queda abierto para decidirlo más adelante con el equipo.

---

## 5. Revalidación periódica de la API

### Qué problema resolvía
Antes la pantalla preguntaba a `/api/salud` **una sola vez**, al cargar. Si la base se caía después, la página seguía en verde hasta que alguien la recargara.

### Qué hace ahora
Un hook nuevo, `cliente/src/useSalud.ts`, hace la consulta al cargar y la repite **cada 10 segundos** (`INTERVALO_MS`). `App.tsx` solo usa `const salud = useSalud()` y dibuja el resultado.

Detalles del comportamiento:
- **Sin parpadeo:** el estado "cargando" aparece solo la primera vez; en las siguientes comprobaciones se mantiene el último resultado hasta tener el nuevo.
- **Pestaña oculta:** no consulta. Al volver a la pestaña actualiza de inmediato.
- **Limpieza:** al desmontar el componente cancela la petición en curso (`AbortController`), detiene el temporizador y quita el listener. Así no hay respuestas tardías que actualicen un componente que ya no existe.
- **Tres estados posibles:** `cargando`, `listo` (con el detalle de la base) y `sin-servidor`. Un 503 (servidor vivo, base caída) se muestra como "Servidor: En marcha / Base de datos: Sin conexión".
- **Hora visible:** la pantalla muestra "Última comprobación: hh:mm:ss (hora de Guatemala)", para ver que realmente se actualiza.

### Cómo comprobarlo
1. `npm run bd:levantar` y `npm run dev`; abre http://localhost:5173 (todo en verde).
2. `npm run bd:apagar` **sin recargar la página**.
3. En menos de 10 segundos "Base de datos" pasa a rojo y la hora cambia.
4. `npm run bd:levantar` otra vez: se pone verde sola.

Para cambiar la frecuencia, ajusta `INTERVALO_MS` o pasa otro valor: `useSalud(30_000)`.

---

## Resumen de verificación

Se corrieron estas comprobaciones con el estado final:

| Comprobación | Resultado |
|--------------|-----------|
| `npm run tipos` | Sin errores (servidor y cliente) |
| `npm run lint` | Sin avisos |
| `npm run formato:revisar` | Todo con el formato correcto |
| `npm test` | 7 pruebas pasan, 0 fallan |
| `npm run bd:pruebas` | 113 pasan, 0 fallan |
| `npm run build` | El cliente se construye |
| Prueba en el navegador | Al apagar la base sin recargar, la página pasó a rojo y se recuperó sola al volver a levantarla |

## Pendiente
- Nada está commiteado; al hacer el commit, Git normalizará los saltos de línea según `.gitattributes`.
- Lo ideal es dividirlo en commits por tema (UTC, Prettier/ESLint, TypeScript, revalidación) para facilitar la revisión.
- Responder en el PR al comentario de Prisma (no se aplica por ahora) y avisar de los cambios hechos.
