# Reserva de salas de reuniones

Aplicación web para consultar la disponibilidad de las salas de reunión, reservar un horario libre y evitar cruces de reservas. Incluye inicio de sesión con dos roles (colaborador y administrador), aceptación de reglas de uso y un calendario configurable por el administrador.

## Características

- Consulta de disponibilidad por fecha, horario, duración y capacidad.
- Reservas dentro del horario de oficina, sin cruces (también ante reservas simultáneas).
- Gestión de salas, calendario, horarios y reglas de uso (administrador).
- Aceptación obligatoria de las reglas de uso, que se vuelve a pedir cuando cambian.
- Vista "Mis reservas" para consultar y cancelar las propias.

## Tecnologías

| Capa          | Tecnología                              |
|---------------|-----------------------------------------|
| Cliente       | React 19, Vite, Vitest, Testing Library |
| Servidor      | Node.js, Express, express-session       |
| Base de datos | PostgreSQL 16 (migraciones SQL)         |
| Pruebas e2e   | Playwright                              |

## Estructura

```
client/     Interfaz React (pantallas, cliente de API, pruebas de componentes)
server/     API Express: rutas, reglas de negocio, migraciones y datos de demo
e2e/        Pruebas de aceptación con Playwright
docs/       Diseño y plan de implementación
```

## Requisitos

- Node.js 20 o superior
- Docker (para levantar PostgreSQL localmente)

## Puesta en marcha

1. Levantar la base de datos:

   ```bash
   docker compose up -d db
   ```

2. Instalar dependencias (desde la raíz):

   ```bash
   npm install
   npx playwright install chromium   # solo la primera vez, para las pruebas e2e
   ```

3. Configurar el entorno:

   ```bash
   cp .env.example .env
   ```

   Edita `.env` y reemplaza `SESSION_SECRET` por una cadena aleatoria larga. El servidor no arranca sin ese valor.

4. Aplicar migraciones y cargar datos de demostración:

   ```bash
   npm run seed
   ```

5. Iniciar el servidor y el cliente en terminales separadas:

   ```bash
   npm run dev -w server     # API en http://localhost:3000
   npm run dev -w client     # Interfaz en http://localhost:5173 (proxy de /api)
   ```

## Pruebas

```bash
npm test -w server            # pruebas de la API
npm test -w client            # pruebas de componentes
npx playwright test           # pruebas de aceptación (requiere servidor y cliente en marcha)
```

## Documentación

- [Diseño de la aplicación](docs/superpowers/specs/2026-10-30-reserva-salas-design.md)
- [Plan de implementación](docs/superpowers/plans/2026-10-30-reserva-salas.md)

## Licencia

Pendiente de definir.
