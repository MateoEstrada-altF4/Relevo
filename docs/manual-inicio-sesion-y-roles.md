# Manual: inicio de sesión y roles (Issue #6)

Este manual explica qué se construyó para el Issue #6, **por qué existe cada pieza y qué pasaría si no estuviera**, y cómo comprobarlo tú mismo. Todas las salidas que aparecen son reales: salieron de correr el servidor y las pruebas.

## Resumen de lo que se agregó

| Pieza | Archivo | Para qué sirve |
|-------|---------|----------------|
| Contraseñas | `servidor/src/auth/contrasenas.ts` | Guardar y comprobar contraseñas sin guardar la contraseña |
| Tokens | `servidor/src/auth/tokens.ts` | La "credencial" que recibe el navegador al iniciar sesión |
| Acceso a `usuario` | `servidor/src/auth/usuarios.ts` | Buscar cuentas en la base |
| Middlewares | `servidor/src/auth/middleware.ts` | `autenticar` (¿quién eres?) y `exigirRol` (¿puedes?) |
| Rutas | `servidor/src/auth/rutas.ts` | `login`, `logout`, `yo`, `cambiar-password` |
| Configuración | `servidor/src/config.ts` | El secreto de las sesiones y sus reglas |
| Semilla | `servidor/src/semilla.ts`, `sembrar.ts` | Crear cuentas de prueba (`npm run bd:semilla`) |
| Pruebas | `servidor/pruebas/auth/*`, `config.test.ts`, `semilla.test.ts` | 50 pruebas nuevas |

---

## 1. Autenticación y autorización: dos preguntas distintas

- **Autenticación:** ¿quién eres? Se responde en el login, con correo y contraseña.
- **Autorización:** ¿qué puedes hacer? Se responde en **cada petición**, según tu rol.

El README ya decía: *"el servidor decide qué puede hacer cada rol; la interfaz solo oculta opciones"*. La razón: la interfaz corre en el navegador de la persona, y cualquiera puede saltársela y llamar a la API directamente (con `curl`, por ejemplo). Si el servidor no revisara el rol, ocultar un botón no protegería nada.

Por eso hay dos middlewares separados y siempre en este orden:

```ts
app.get('/ruta', autenticar(bd), exigirRol('administrador'), (req, res) => { ... });
```

`autenticar` averigua quién es. `exigirRol` decide si ese alguien puede pasar.

### 401 contra 403

| Código | Significa | Ejemplo |
|--------|-----------|---------|
| **401** | No sé quién eres | Sin cookie, cookie vencida, cuenta desactivada |
| **403** | Sé quién eres, pero no puedes | Un `usuario` pidiendo algo de administrador |

Distinguirlos le sirve al cliente: con 401 muestra la pantalla de login; con 403 muestra "no tienes permiso".

---

## 2. Contraseñas: nunca se guardan, se guarda su huella

### El problema
Si la tabla `usuario` guardara las contraseñas tal cual, quien lograra leer la base (una copia de seguridad perdida, un error) tendría todas las cuentas. Por eso la columna se llama `password_hash`: guarda una **huella** de la contraseña, no la contraseña.

### Qué es `scrypt`
Es una función que convierte una contraseña en una huella de forma que:
- **No se puede revertir:** de la huella no se obtiene la contraseña.
- **Es lenta y gasta memoria a propósito:** comprobar una contraseña tarda unas decenas de milisegundos. Para ti es imperceptible; para alguien que prueba millones de combinaciones, es carísimo.

### La sal
Antes de calcular la huella se mezcla la contraseña con 16 bytes aleatorios, la **sal**. Dos personas con la misma contraseña terminan con huellas distintas, y un atacante no puede usar tablas de huellas ya calculadas. Hay una prueba para esto: `dos hashes de la misma contraseña son distintos`.

### El formato guardado
```
scrypt$16384$8$1$<sal en base64>$<huella en base64>
```
Los números son los parámetros (`N`, `r`, `p`). Van **dentro** de la huella para que, si algún día se suben, las contraseñas viejas sigan funcionando. Ocupa unos 130 caracteres y la columna admite 255.

### Detalles que importan
- **`timingSafeEqual`** compara las huellas tardando lo mismo aunque difieran en el primer o en el último byte; una comparación normal podría delatar cuántos bytes coinciden midiendo el tiempo.
- Si una huella guardada está rota, `verificarPassword` devuelve `false` en lugar de lanzar un error: para quien inicia sesión es lo mismo que "no coincide".
- **Largo de la contraseña:** entre 10 y 128 caracteres. El máximo existe porque calcular `scrypt` cuesta; sin tope, alguien podría mandar contraseñas enormes para ocupar al servidor. Se valida **antes** de calcular nada (`una contraseña gigante se rechaza enseguida`).

---

## 3. La sesión: cookie con un token firmado

### El problema
HTTP no recuerda nada: cada petición llega sola. Después del login, el servidor necesita una forma de reconocerte en las siguientes.

### La solución elegida
Al iniciar sesión, el servidor te entrega un **token firmado** dentro de una **cookie**. El navegador la reenvía solo en cada petición.

El token (JWT, creado con la librería `jose`) tiene tres partes separadas por puntos. La del medio dice, en esencia:

```json
{ "ph": "9f2c…", "sub": "83", "iat": 1794602190, "exp": 1794630990 }
```

`sub` es tu id, `iat` cuándo se emitió y `exp` cuándo caduca (ambas en segundos desde 1970, o sea en UTC). `ph` es la **huella de tu contraseña** (un resumen SHA-256 del hash guardado); para qué sirve se explica en la sección 4. La **firma** (HS256) se calcula con el secreto del servidor: si alguien cambia aunque sea un carácter, la firma deja de coincidir y el token se rechaza. Nadie puede inventarse un token sin conocer el secreto.

> El token **no** guarda tu rol. El rol se lee de la base en cada petición (ver la sección 4).

### Las banderas de la cookie
| Bandera | Qué hace | Qué pasaría sin ella |
|---------|----------|----------------------|
| `HttpOnly` | El JavaScript de la página no puede leer la cookie | Un script malicioso colado en la página podría robar la sesión |
| `SameSite=Lax` | El navegador no la manda en peticiones que vienen de otros sitios | Otro sitio podría hacer que tu navegador ejecute acciones en Relevo sin que lo notes (CSRF) |
| `Max-Age=28800` | La cookie dura 8 horas | Quedaría abierta indefinidamente |
| `Path=/` | Vale para todo el sitio | — |
| `Secure` | Solo viaja por HTTPS | Se activa sola cuando `NODE_ENV=production` |

### El secreto
`SESION_SECRETO` en `.env`. En desarrollo hay uno de ejemplo para que todo funcione sin configurar nada. **En producción el servidor se niega a arrancar** si falta o tiene menos de 32 caracteres: arrancar con un secreto conocido permitiría fabricar sesiones de cualquiera. Esto está probado en `pruebas/config.test.ts`.

### Dos ataques que las pruebas cierran
- **`alg: none`:** un token que dice "no necesito firma". Se evita fijando el algoritmo permitido a `HS256` al verificar.
- **Token caducado o de otro secreto:** se rechazan; hay una prueba para cada uno.

---

## 4. `autenticar`: por qué se vuelve a leer la base en cada petición

Un token firmado es válido hasta que caduca. Eso tiene un problema: si desactivas una cuenta (`activo = false`) o le cambias el rol, el token viejo seguiría funcionando hasta 8 horas.

La solución: `autenticar` hace cuatro cosas en cada petición.
1. Lee la cookie y verifica la firma.
2. **Busca la fila de `usuario`** con el id del token.
3. Si no existe o `activo` es false, responde 401.
4. Compara la huella `ph` del token con la de la contraseña **actual** de la cuenta. Si no coinciden, 401. Si todo coincide, deja los datos frescos (incluido el **rol de la base**) disponibles para el resto de la petición.

Cuesta una consulta pequeña por petición, algo irrelevante a esta escala, y a cambio los cambios surten efecto **al instante**. Lo demuestran estas pruebas:
- `desactivar la cuenta surte efecto con el mismo token, sin esperar a que caduque`
- `exigirRol responde 403 si el rol no alcanza y 200 cuando el rol cambia`
- `cambiar la contraseña invalida las sesiones anteriores, aunque no hayan caducado`

### Por qué la huella de la contraseña (y qué problema resuelve)
Sin ella, un token robado seguiría sirviendo hasta 8 horas **aunque la víctima cambie su contraseña**, que es justo lo que haría al sospechar del robo. Con la huella, cambiar la contraseña cambia el hash guardado, la huella ya no coincide y todas las sesiones anteriores dejan de valer. Quien cambia la contraseña recibe en esa misma respuesta una sesión nueva, así que no se ve expulsado. Se eligió la contraseña y no `actualizado_en` para que un cambio de rol no cierre la sesión de nadie.

### Limitación conocida: el logout no revoca el token
Cerrar sesión borra la cookie del navegador, pero un token ya copiado seguiría siendo válido hasta caducar (8 horas) o hasta que la contraseña cambie. Es el precio de las sesiones sin estado en el servidor (el enfoque B que elegimos, que evita agregar una tabla). Si se quisiera revocar al instante habría que guardar sesiones en la base (enfoque A).


### Cuando la base falla
Si la consulta falla, la respuesta es **503 `Servicio no disponible`** (no 401: no es culpa de la persona) y el servidor sigue vivo.

---

## 5. Las rutas

| Ruta | Requiere sesión | Respuesta |
|------|-----------------|-----------|
| `POST /api/auth/login` | No | 200 con la cuenta y la cookie · 401 · 400 · 429 |
| `POST /api/auth/logout` | No | 204 y la cookie queda vacía |
| `GET /api/auth/yo` | Sí | 200 con la cuenta de la sesión |
| `POST /api/auth/cambiar-password` | Sí | 204 con una cookie nueva · 400 · 401 |

### El login, paso a paso
1. **Valida el cuerpo.** Debe traer `email` y `password` como texto, con largos razonables. Si no, 400. Esto va primero para no gastar `scrypt` en basura, y porque `{"email": {"$ne": 1}}` no debe llegar jamás a una consulta.
2. **Busca la cuenta** por correo, sin distinguir mayúsculas ni espacios (el índice único de la base es sobre `lower(email)`).
3. **Compara la contraseña.** Si el correo no existe, compara contra una huella falsa: así tarda lo mismo que con un correo real y nadie puede averiguar qué correos tienen cuenta midiendo tiempos.
4. **Un solo mensaje de error:** `Correo o contraseña incorrectos`, tanto si el correo no existe, como si la contraseña está mal o la cuenta está inactiva. Si dijera "ese correo no existe", cualquiera podría listar las cuentas.
5. **Si todo va bien:** actualiza `ultimo_acceso` (con `now()`, en UTC), firma el token (con la huella de la contraseña) y pone la cookie.

### Límite de intentos
`express-rate-limit` permite **10 intentos fallidos cada 15 minutos por dirección**; el siguiente recibe 429. Solo cuentan los fallidos: entrar bien no gasta intentos. Frena a quien prueba contraseñas una tras otra.

### Errores siempre en JSON
Sin ajuste, Express responde a un JSON roto con una **página HTML con la traza del error** (rutas de archivos incluidas). Un manejador de errores final lo cambia por `400 {"error": ...}`, `413` para cuerpos de más de 100 KB y `415` si el cuerpo llega con una codificación que el servidor no entiende (antes caía en un 500 engañoso).

---

## 6. Contraseña temporal

El esquema trae `debe_cambiar_password`: es `true` mientras la cuenta use la contraseña temporal con la que se creó. Sin efecto real, esa bandera sería decoración. Con este diseño:

- `autenticar` expone la bandera.
- `exigirPasswordVigente` es un tercer middleware que responde `403 { codigo: 'CAMBIAR_PASSWORD' }` mientras siga activa. Las rutas de negocio futuras lo llevarán junto a `autenticar`.
- `GET /yo` y `POST /cambiar-password` **no** lo llevan: son justo lo que hay que poder usar con la contraseña temporal.
- Al cambiarla, la bandera pasa a `false`. La contraseña nueva debe tener 10 a 128 caracteres y ser distinta de la actual, y se exige la actual como prueba de que quien cambia es quien dice ser. Además, al cambiarla se cierran todas las demás sesiones de la cuenta y quien la cambió recibe una cookie nueva (sección 4).

---

## 7. Cuentas de desarrollo: `npm run bd:semilla`

Crea (o restablece) tres cuentas, una por rol. **Cada una tiene su propia contraseña**, en su variable de tu `.env`: `SEMILLA_PASSWORD_ADMINISTRADOR`, `SEMILLA_PASSWORD_ENCARGADO` y `SEMILLA_PASSWORD_USUARIO`. Compartir una contraseña entre roles es un mal hábito aunque sea de prueba (quien conozca una entraría a todas), así que la semilla **se niega a correr si dos contraseñas son iguales** y exige que las tres estén definidas con 10 a 128 caracteres.

| Correo | Rol | Contraseña temporal |
|--------|-----|---------------------|
| `administrador@relevo.test` | administrador | No |
| `encargado@relevo.test` | encargado | No |
| `usuario@relevo.test` | usuario | No |

Las tres entran directo, porque para desarrollo es lo cómodo. **El cambio obligatorio sigue funcionando** para las cuentas que se creen con la contraseña temporal por defecto del esquema (`debe_cambiar_password = true`), que es el caso real cuando un administrador cree una cuenta nueva. Si quieres ver esa pantalla, marca una cuenta como temporal y entra con ella:

```bash
docker compose exec -T db psql -U relevo -d relevo -c "update relevo.usuario set debe_cambiar_password = true where email = 'usuario@relevo.test'"
```

`npm run bd:semilla` la deja otra vez sin contraseña temporal.

Se puede repetir sin duplicar cuentas. El dominio `.test` está reservado por estándar: esos correos nunca existirán de verdad. El script **se niega a correr con `NODE_ENV=production`**, porque son cuentas con contraseña conocida.

---

## 8. Recorrido real

Servidor arrancado con `npm run start -w servidor` y consultado con `curl`. (El token se acortó con `…`.)

**1. Login del administrador**
```
HTTP/1.1 200 OK
Set-Cookie: relevo_sesion=eyJhbGciOiJIUzI1NiJ9.…; Max-Age=28800; Path=/; Expires=…; HttpOnly; SameSite=Lax

{"usuario":{"id":83,"nombre":"Administrador de prueba","email":"administrador@relevo.test","rol":"administrador"},"debeCambiarPassword":false}
```
Obsérvese que la respuesta **no** incluye la huella de la contraseña.

**2. `GET /yo` con la cookie → 200** con los mismos datos. **3. Sin cookie →**
```
HTTP/1.1 401 Unauthorized
{"error":"Inicia sesión para continuar"}
```

**4 y 5. Contraseña incorrecta y correo inexistente: exactamente la misma respuesta**
```
HTTP/1.1 401 Unauthorized
{"error":"Correo o contraseña incorrectos"}
```

**6. JSON roto** (antes habría sido una página HTML con la traza)
```
HTTP/1.1 400 Bad Request
{"error":"Datos de inicio de sesión inválidos"}
```

**7. Login del usuario:** `"debeCambiarPassword":true`.

**8. Cambiar a una contraseña de 9 caracteres**
```
HTTP/1.1 400 Bad Request
{"error":"La contraseña nueva debe tener entre 10 y 128 caracteres"}
```

**9. Cambio válido → `204 No Content`.** **10. `GET /yo` después →** `"debeCambiarPassword":false`.

**11. Logout**
```
HTTP/1.1 204 No Content
Set-Cookie: relevo_sesion=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
```
La cookie queda vencida (año 1970) y el navegador la borra. **12. `GET /yo` después → 401.**

---

## 9. Pruebas

```bash
npm test
```

57 pruebas del servidor (7 que ya existían y 50 nuevas). Cada archivo y lo que protege:

| Archivo | Qué comprueba |
|---------|---------------|
| `contrasenas.test.ts` | Formato del hash, sal distinta, verificación, hash roto sin error, huella de la contraseña |
| `config.test.ts` | Producción sin secreto no arranca; secreto de 31 caracteres no sirve |
| `tokens.test.ts` | Ida y vuelta con la huella, token alterado, otro secreto, caducado, `alg: none`, basura |
| `usuarios.test.ts` | Búsqueda sin importar mayúsculas, `ultimo_acceso`, cambio de contraseña |
| `middleware.test.ts` | 401, 403, revalidación al desactivar, cambiar de rol o cambiar la contraseña, cookie basura, base caída |
| `rutas.test.ts` | Login, errores idénticos, cuerpos malos, contraseña gigante, `yo`, logout, cambio de contraseña (con cierre de sesiones viejas), 415, límite de intentos |
| `semilla.test.ts` | Tres cuentas, repetible, cada una con su propia contraseña, se niega a repetirlas |

**Las pruebas no dejan datos:** cada archivo crea cuentas con una etiqueta propia y las borra al terminar (hay una comprobación de que no quedan filas `prueba-%`). Las rutas que prueban `exigirRol` viven solo en las pruebas, en una mini aplicación; el servidor real no tiene rutas de demostración.

Pruebas del esquema (no cambiaron): `npm run bd:pruebas` → 113 correctas.

---

## 10. Antes de abrir un PR

```bash
npm run tipos
npm run lint
npm run formato:revisar
npm test
```

Las pruebas necesitan la base levantada y las variables `SEMILLA_PASSWORD_*` en tu `.env` (copiadas de `.env.example`).

## 11. Limitaciones conocidas

- **El logout no revoca el token** ya emitido (sección 4). Cambiar la contraseña sí cierra todas las sesiones.
- **Detrás de un proxy en producción** hay que activar `trust proxy` en Express. Si no, el límite de intentos vería a todo el mundo como una sola dirección y bloquearía a todos a la vez.
- **El límite de intentos es por dirección, no por cuenta.** Frena a quien prueba muchas contraseñas desde un mismo lugar, pero no un ataque repartido entre muchas direcciones.
- **Los errores 400 comparten un mensaje** pensado para el login (`Datos de inicio de sesión inválidos`). Las rutas de negocio futuras podrán querer su propio mensaje.
- **El cliente no tiene pruebas automáticas**, porque el proyecto no trae un corredor de pruebas para React. La pantalla de login se comprobó con `tsc`, ESLint, Prettier, `npm run build` y haciendo clic en el navegador con las tres cuentas.
- **No hay prueba automática** de que un correo inexistente tarda lo mismo que uno real: una prueba de tiempos sería inestable. La igualación está en el código (`obtenerHashFalso`) y se explica en la sección 5.

---

## 12. La pantalla de login (cliente)

### Qué se ve según la sesión
| Situación | Pantalla |
|-----------|----------|
| Cargando | "Comprobando la sesión…" |
| Sin sesión | Tarjeta de **Iniciar sesión** |
| Sesión con contraseña temporal | Solo **Cambia tu contraseña** (lo mismo que impone el servidor) |
| Sesión normal | Barra con tu nombre, tu rol y **Cerrar sesión**, y debajo el estado del servidor y la base |

### Cómo está armada
- **`useSesion.ts`** es el único lugar que habla con `/api/auth/*`. Ofrece `iniciarSesion`, `cerrarSesion` y `cambiarPassword`, y guarda el estado (`cargando`, `sin-sesion` o `activa`).
- **`Login.tsx` y `CambiarPassword.tsx`** son los formularios. Los marcos y campos que comparten viven en `formulario.tsx`, para que se vean igual y no se repita el mismo marcado.
- **`App.tsx`** decide qué pantalla mostrar mirando solo el estado de la sesión. El panel del estado del servidor se movió a su propio componente, `PanelEstado`, que **solo se monta con sesión iniciada**: sin sesión no se consulta `/api/salud` cada 10 segundos para nada.

### Por qué el cliente nunca ve el token
La cookie es `HttpOnly`, así que el JavaScript de la página no puede leerla. El cliente no guarda nada: al abrir la página pregunta `GET /api/auth/yo` y el navegador manda la cookie solo. Por eso recargar la página no te saca de la sesión, y por eso cerrar sesión consiste en pedirle al servidor que borre la cookie. Es más seguro que guardar un token en `localStorage`, donde cualquier script de la página podría leerlo.

### Los mensajes de error
El servidor ya manda un mensaje claro en cada error, así que el cliente solo lo muestra (`role="alert"` para que los lectores de pantalla lo anuncien). Dos casos los pone el cliente: 503 ("El servidor no está disponible") y cuando el servidor no responde ("Sin respuesta del servidor").

### Validar dos veces
El formulario de cambio de contraseña avisa antes de enviar si la nueva es muy corta o larga, igual a la actual o no coincide con la repetida. Es solo comodidad: **el servidor repite todas las comprobaciones**, porque el cliente se puede saltar con `curl`.

### Detalle de accesibilidad
Los campos llevan `autoComplete` correcto (`username`, `current-password`, `new-password`) para que el gestor de contraseñas del navegador sepa qué guardar y qué sugerir.

### Un color por rol, sin repetir código
Administrador **índigo** (azul violáceo), encargado **celeste**, usuario **verde**, y gris neutro sin sesión (para que el login no se confunda con el celeste del encargado). Se hace con tres piezas:

1. **`App.css`** define una escala de colores genérica, `tema-50` a `tema-950`, y cuatro bloques `[data-tema='...']` que dicen qué paleta de Tailwind es cada uno (`indigo`, `sky`, `emerald`, `slate`).
2. **Los componentes** no mencionan ningún color concreto: usan `bg-tema-50`, `text-tema-900`, `border-tema-200`, etc.
3. **`App.tsx`** pone `data-tema` en `<html>` según el rol de la sesión (`document.documentElement.dataset.tema`).

Así, cambiar de rol cambia toda la pantalla sin tocar un solo componente, y agregar un cuarto rol o cambiar un color es editar un bloque de `App.css`. El tema va en `<html>` y no en `<main>` para que pinte también el fondo de toda la ventana. Los indicadores de estado (punto verde o rojo) **no** usan el tema: verde significa "bien" y rojo "mal" en cualquier rol.

### Que se adapte a la pantalla
Antes la página era una columna fija de unos 570 píxeles. Ahora:
- El contenido usa todo el ancho disponible hasta un máximo (`max-w-6xl`), con márgenes que crecen según el tamaño (`px-4`, `sm:px-6`, `lg:px-10`).
- Los textos de la cabecera y los espacios crecen en pantallas medianas y grandes.
- Las tarjetas de estado pasan de una columna (celular) a dos (`md:grid-cols-2`, desde 768 px).
- El alto usa `min-h-dvh` ("alto dinámico de la ventana"), que en el celular descuenta la barra del navegador. Con `min-h-screen` el contenido quedaba tapado por ella.
- Los formularios se centran en el espacio que queda bajo la cabecera, sea cual sea la ventana.

Se comprobó midiendo en el navegador (sin desborde horizontal en 375, 768 y 1024 píxeles de ancho).

### Lo que se comprobó con clics reales
Contraseña equivocada (error rojo y se conserva el correo) · login del administrador · recargar la página (sigue dentro) · cerrar sesión · login de una cuenta marcada con contraseña temporal (solo aparece el cambio) · contraseña corta, no coincidentes y cambio válido, tras el cual entra con su rol.
