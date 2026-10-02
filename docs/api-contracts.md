# Contratos de API — MES Yamboly

Prefijo de todos los endpoints: **`/api/v1`** (`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`).
Tipos compartidos: `@mes/types` (`packages/types/src`). Mocks msw equivalentes: `apps/web/src/mocks/handlers`.

## Convenciones

| Tema | Regla |
| --- | --- |
| Colecciones paginadas | `{ data: T[], meta: { page, pageSize, total, totalPages } }` (`Paginated<T>`) |
| Colecciones no paginadas | `{ data: T[] }` (catálogos, subrecursos de una orden) |
| Errores | `{ statusCode, code, message, details? }` (`ApiError`) |
| Códigos de error | `VALIDATION_ERROR` 422 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `BUSINESS_RULE` 422 · `INTERNAL_ERROR` 500 · `TOO_MANY_REQUESTS` 429 (login, ver **auth**) · 413 archivo demasiado grande (fotos `PAYLOAD_TOO_LARGE`, importación de evidencia `VALIDATION_ERROR`) · `ORIGEN_NO_CONFIGURADO` 503 (`POST /ordenes-sap/sincronizar` sin origen) |
| Detalle de validación | `details` es un mapa **campo → mensaje** (`{ "cantidadKg": "La cantidad debe ser mayor que 0" }`); las vistas lo pintan bajo cada campo con `aplicarErroresApi` |
| `BUSINESS_RULE` vs `VALIDATION_ERROR` | Ambos son 422; `VALIDATION_ERROR` es un dato de entrada inválido (formato, rango, referencia inexistente), `BUSINESS_RULE` es una regla de negocio incumplida con datos por lo demás válidos (p. ej. un jefe intentando desactivar su propia cuenta) |
| POST de acción | Los `POST` que **no crean** un recurso (atender/descartar/confirmar una alerta, activar una versión, finalizar, cambiar estado, restablecer contraseña) responden **200**; sólo las altas reales responden 201 y los trabajos encolados 202 |
| Autenticación | `Authorization: Bearer <accessToken>` en todo salvo `POST /auth/login` y `/encuesta/:token` |
| Paginación | `?page=1&pageSize=25` (máx. **100**, `PaginationDto`; 422 si se supera) |
| Filtros múltiples | clave repetida (`?lineaId=LIN-LLEN-M2&lineaId=LIN-LLEN-A1`) o separada por comas |
| Periodos | `?periodo=hoy\|semana\|mes\|trimestre\|personalizado`; con `personalizado` se envían `desde`/`hasta` (`YYYY-MM-DD`) |
| Fechas | ISO-8601: `YYYY-MM-DD` para fechas, `YYYY-MM-DDTHH:mm:ss` para marcas de tiempo |
| Errores simulables (solo mock) | `?__error=500\|401\|403\|404\|409\|422\|empty` o cabecera `x-mock-error` |
| Baja lógica | Nunca hay borrado físico con histórico: `DELETE` marca el registro `inactivo` (catálogos) o `baja` (máquinas) y responde `BajaLogicaResponse` (ver sección **catalogs**). La baja **se propaga** a lo que depende del registro (ver «Cascadas de baja») |
| Concurrencia optimista | Líneas, productos, velocidades estándar, causas de parada, causas de merma y `Umbrales` llevan `version` (entero, sube en cada guardado). El cliente reenvía en el `PATCH`/`PUT` la `version` que leyó; si otra persona guardó después → **409 `CONFLICT`** con `MENSAJE_CONFLICTO_VERSION` («Otra persona modificó este registro mientras lo editabas…») y `details { version, versionEnviada }`. El `UPDATE` es condicional sobre la versión leída, así que dos guardados simultáneos tampoco se pisan. `version` es opcional (sin ella no se comprueba) |
| Roles | `@Roles(...)` en el controlador → 403 `FORBIDDEN` si el rol no está. Las matrices se comparten con la web desde `@mes/types` (ver **Permisos por rol**). Un `maquinista` sólo opera en su línea (`assertAccesoLinea`, 403 «Solo puedes registrar en tu línea asignada») |
| Hora de planta | Las marcas sin zona (`inicio`, `fin`, `registradaEn`…) son **hora de pared de Lima** (`America/Lima`, UTC−5 sin horario de verano). El servidor las calcula con `ahoraPlanta()` / `hoyPlanta()` de `@mes/shared`, independientes de la TZ del proceso (el despliegue fija `TZ=UTC`) |
| Textos | Los DTO recortan espacios antes de validar: un texto sólo de espacios cuenta como vacío (`accionTomada`, `motivo`, `nombre`…). Un `null` explícito en un campo NOT NULL de un `PATCH` es 422, no 500 |
| `tiempoRegistroSeg` (TRI) | Entero `0 … 3600` (`TIEMPO_REGISTRO_MAX_SEG`) en todas las mutaciones de captura (paradas, mermas, velocidades, confirmar detección IoT, iniciar y finalizar orden). Más de una hora no mide el registro sino un formulario olvidado: **422** |

---

## Datos maestros reales

Desde la rama `feat/maestros-reales` los catálogos de planta ya no son datos de ejemplo: son el maestro real de Yamboly, extraído de un **dump de Postgres (formato custom `pg_dump`, sistema Strapi v5) del sistema anterior**.

- **Script de extracción**: `apps/api/scripts/extraer-maestros.mjs` — lee el dump con `pg_restore -a -t <tabla> -f -` (requiere el binario `pg_restore` de **libpq**, p. ej. `/opt/homebrew/opt/libpq/bin/pg_restore` en macOS/Homebrew) y escribe JSON commiteable en `apps/api/src/database/seeds/data/real/*.json`. Es una tarea de un solo uso: los JSON generados **no se regeneran en runtime**, se versionan y los consume el seeder al arrancar la API.
- **Tablas leídas**: `lineas`, `sabores`, `productos`, `producto_lineas` (+ tablas de enlace `_lnk`), `tipo_paradas`, `categoria_generals`, `categoria_especificas`, `merma_tipo_produccions`, `merma_clasificacions`, `merma_causas`.
- **No existe el nivel máquina/equipo**: la línea *es* la máquina física de planta, y la parada se registra hasta la línea. El script conserva la lógica de extracción de sedes desactivada: la aplicación opera una **única sede** (Lima), que no se expone en la API pública.

### Conteos del maestro real

| Catálogo | Cantidad |
| --- | --- |
| Líneas | 9 (4 llenadoras · 2 extrusoras · 3 moldeadoras) |
| Sabores | 41 |
| Productos | 201 |
| Velocidades estándar (pares producto × línea) | 333 |
| Causas de parada | 83 (5 tipos → 26 generales → 52 específicas) |
| Causas de merma | 56 (5 tipos → 11 clasificaciones → 40 causas) |
| Turnos | 2 (`D` Día · `N` Noche) |

### Convención de ids

| Entidad | Formato de `id` | Ejemplo |
| --- | --- | --- |
| Línea | `LIN-<CODIGO>` | `LIN-LLEN-M2` |
| Producto | `PRD-<codigo 7 dígitos>` | `PRD-1110001` |
| Velocidad estándar | `VE-<secuencial 4 dígitos>` | `VE-0001` |
| Causa de parada | `CPA-<codigo>` (`codigo` = `TT-GG`, `TT-GG-X` o `TT-GG-EE`) | `CPA-PP-01-01` |
| Causa de merma | `CME-<codigo>` (`codigo` = `MT-NN`, `MT-NN-X` o `MT-NN-EE`) | `CME-MP-01-01` |
| Sabor | `SAB-<codigo 7 dígitos>` | `SAB-2110124` |
| Usuario | `USR-<secuencial 2 dígitos>` | `USR-01` |

> Los códigos legibles (`codigo`) siguen el patrón corto del maestro real: líneas `LLEN-M2` / `EXTR-2` / `MOLD-A3`, causas de parada y de merma `PN-02-01` / `MP-01-01` (los tipos raíz usan prefijos `PP`, `PN`, `PS` para parada y `MP` para merma, según el maestro original).

---

## auth

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/auth/login` | POST **público** | `LoginRequest { email, password, recordarme? }` — `email` acepta correo o DNI | `LoginResponse { accessToken, user }` | 401 credenciales inválidas · 422 validación · **429 `TOO_MANY_REQUESTS`** cuenta o IP bloqueada (`details.reintentarEnSeg`) |
| `/auth/me` | GET | — | `User` (incluye `ultimoAcceso`, sellado en cada login) | 401 sin token, token inválido o **sesión revocada** |
| `/auth/logout` | POST | — | `204 No Content` — **revoca todas las sesiones** del usuario (sube `tokenVersion`) | 401 |

### Límite de intentos de login (`login-limiter.ts`)

Dos contadores en memoria con la misma política de bloqueo:

| Contador | Clave | Umbral (env, por defecto) | Comportamiento |
| --- | --- | --- | --- |
| Por cuenta | id del usuario; si el identificador no existe, el identificador normalizado (un correo inexistente se bloquea igual y no delata si existe) | `LOGIN_MAX_INTENTOS_CUENTA` = 5 fallos consecutivos | Bloquea la cuenta `LOGIN_BLOQUEO_MIN` (15) min **aunque luego llegue la contraseña correcta**. Un acierto pone el contador a 0 |
| Por IP | `req.ip` de Express con `trust proxy` = `TRUST_PROXY_HOPS` (0 por defecto: IP del socket; N: el salto N desde la derecha de `X-Forwarded-For`, lo antepuesto por el cliente se ignora). Si hay saltos de confianza pero no llega `X-Forwarded-For`, la IP **no es fiable**: se omite este contador (rige el de cuenta) y se avisa en el log | `LOGIN_MAX_INTENTOS_IP` = 20 fallos en la ventana de 15 min | Bloquea la IP el mismo tiempo. Un acierto **no** lo reinicia |

Respuesta: `429 { statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos fallidos. Vuelve a intentarlo en N min o contacta a Sistemas.', details: { reintentarEnSeg } }`. La web muestra ese `message` tal cual (`LoginForm.tsx`). **Despliegue**: la web llama a la API por el proxy de `rewrites` de Next, que reenvía `X-Forwarded-For` tal cual lo manda el cliente. `apps/web/src/middleware.ts` (solo `/api/v1/*`) lo sobrescribe con un único valor: la IP N-ésima desde la derecha, con `WEB_TRUST_PROXY_HOPS` = N proxies propios delante de Next (túnel, nginx; p. ej. 1); con 0 (por defecto) Next 15 no expone la IP del socket y se elimina la cabecera. En la API usa `TRUST_PROXY_HOPS=1` (salto de Next). Sin `WEB_TRUST_PROXY_HOPS` el límite por IP queda desactivado (solo por cuenta, sin riesgo de bloqueo masivo); API expuesta directa: `TRUST_PROXY_HOPS=0`.

**Decisiones asumidas (no se cambian)**: (1) con 5 claves malas cualquiera puede bloquear 15 min una cuenta conocida (DoS dirigido), a cambio de frenar la fuerza bruta; (2) `POST /auth/logout` cierra **todas** las sesiones del usuario, en todos los dispositivos.

Los bloqueos viven en memoria (una sola instancia): un reinicio de la API los limpia.

### Revocación de sesiones (`tokenVersion`)

`User.tokenVersion` (entero, por defecto 0) viaja en el JWT como `tv`. `JwtStrategy.validate` rechaza con **401** un token cuyo `tv` no coincide con el de la base, o de un usuario inactivo. La versión sube —y por tanto **todas** las sesiones abiertas del usuario dejan de valer— en:

- `POST /auth/logout`;
- `POST /usuarios/:id/restablecer-password` (contraseña nueva);
- `POST /usuarios/:id/estado { activo: false }` (baja);
- `PATCH /usuarios/:id` cuando cambia el **rol** o la **línea** (la web guarda el rol en la sesión: obliga a entrar de nuevo).

El JWT sólo se acepta por query (`?token=`) en `/tiempo-real/stream` (SSE); en cualquier otra ruta se ignora.

### Usuarios seed (11, contraseña `Yamboly2026` en todos, todos en `SED-LIMA`)

| Id | Correo | Nombre | Rol | Línea asignada / notas |
| --- | --- | --- | --- | --- |
| `USR-01` | `jefe@yamboly.lat` | Carlos Mendoza | `jefe` | Jefe de producción — administra catálogos y usuarios |
| `USR-02` | `jorge.quispe@yamboly.lat` | Jorge Quispe | `maquinista` | `LIN-EXTR-2` (Extrusora 2) |
| `USR-03` | `ana.rios@yamboly.lat` | Ana Ríos | `supervisor` | Supervisora de turno Día |
| `USR-04` | `maria.torres@yamboly.lat` | María Torres | `mermas` | Encargada de merma |
| `USR-05` | `investigador@yamboly.lat` | Investigador Tesis | `investigador` | Solo módulo Evidencia |
| `USR-06` | `rosa.huaman@yamboly.lat` | Rosa Huamán | `calidad` | Analista de calidad |
| `USR-07` | `luis.vargas@yamboly.lat` | Luis Vargas | `maquinista` | `LIN-LLEN-M2` (Llenadora M2) |
| `USR-08` | `sofia.cardenas@yamboly.lat` | Sofía Cárdenas | `maquinista` | `LIN-LLEN-M1` (Llenadora M1) |
| `USR-09` | `pedro.ccahuana@yamboly.lat` | Pedro Ccahuana | `maquinista` | `LIN-MOLD-A3` (Moldeadora A3) |
| `USR-10` | `elena.ramos@yamboly.lat` | Elena Ramos | `maquinista` | `LIN-MOLD-A4` (Moldeadora A4) |
| `USR-11` | `diego.salazar@yamboly.lat` | Diego Salazar | `supervisor` | Supervisor de turno Noche |

Los usuarios sin `lineaId` (jefe, supervisores, calidad, mermas, investigador) son transversales: aparecen en el selector de cualquier línea. Fuente: `apps/api/src/database/seeds/data/users.ts`.

---

## Permisos por rol

Las matrices viven en `@mes/types` y las usan a la vez los `@Roles` de la API y los botones de la web. «Solo su línea» = el maquinista sólo opera sobre registros de su `lineaId` (403 en otra; un maquinista sin línea no puede capturar nada).

### Captura en planta (`packages/types/src/permisos-captura.ts`)

| Acción | jefe | supervisor | maquinista | mermas | calidad | investigador |
| --- | --- | --- | --- | --- | --- | --- |
| Parada: registrar / editar / cerrar (`ROLES_CAPTURA_PARADA`) | sí | sí | solo su línea | no | no | no |
| Detección IoT: confirmar / descartar | sí | sí | solo su línea | no | no | no |
| Velocidad: registrar (`ROLES_CAPTURA_VELOCIDAD`) | sí | sí | solo su línea | no | no | no |
| Merma: registrar / editar (`ROLES_CAPTURA_MERMA`) | sí | sí | solo su línea | sí | sí | no |
| Subir foto de evidencia `POST /evidencias` (`ROLES_SUBIR_EVIDENCIA`) | sí | sí | sí | sí | sí | no |
| Lectura (listados) | sí | sí | sí | sí | sí | sí |

Sobre la **orden** de la captura (`assertCapturaEnOrden`, `common/auth/acceso-orden.ts`): orden `validada` → **409** (no admite registros ni correcciones); orden finalizada pendiente de validar (`por_validar`, `cerrada`, `incompleta`) → solo jefe y supervisor (`ROLES_CORRIGEN_ORDEN_CERRADA`, 403 al resto); `lineaId` distinta de la de la orden → **422 `lineaId`**.

### Órdenes de fabricación (`packages/types/src/orders.ts`)

| Acción | jefe | supervisor | maquinista | mermas | calidad | investigador |
| --- | --- | --- | --- | --- | --- | --- |
| Iniciar orden `POST /ordenes` · sincronizar SAP (`ROLES_INICIAR_ORDEN`) | sí | sí | no | no | no | no |
| Finalizar `POST /ordenes/:id/finalizar` (`ROLES_FINALIZAR_ORDEN`) | sí | sí | solo su línea | no | no | no |
| Validar `POST /ordenes/:id/validar` (`ROLES_VALIDAR_ORDEN`) | sí | sí | no | no | no | no |
| Lectura (listado, detalle, subrecursos, `GET /ordenes-sap`) | sí | sí | sí | sí | sí | sí |

### Alertas y analítica (`packages/types/src/permisos-alertas-analitica.ts`)

| Acción | jefe | supervisor | investigador | maquinista | mermas | calidad |
| --- | --- | --- | --- | --- | --- | --- |
| Alertas: ver bandeja, campana y detalle | sí | sí | sí | sí | sí | sí |
| Alerta: atender / descartar (`ROLES_ATENDER_ALERTA`) | sí | sí | no | solo su línea | no | no |
| Alerta: confirmar evento real, individual o en lote (`ROLES_CONFIRMAR_EP`, alimenta el KPI EP) | sí | sí | no | no | no | no |
| Umbrales: editar `PUT /alertas/umbrales` | sí | sí | no | no | no | no |
| Analítica: ver resumen / patrones / predicciones / modelo / estado de datos (`ROLES_VER_ANALITICA`) | sí | sí | sí | no | no | no |
| Analítica: reentrenar / activar versión (`ROLES_GESTIONAR_MODELO`) · reentrenamiento continuo · recalcular predicciones · diagnóstico del modelo | sí | no | sí | no | no | no |
| Analítica: exportar dataset `GET /analitica/dataset/exportar` | no | no | sí | no | no | no |

### Evidencia de tesis (`evidence.controller.ts`)

Todo el módulo `/evidencia/*` lleva `@Roles('jefe', 'investigador')` a nivel de clase (expone tokens de encuesta, comentarios y overrides). **Única excepción:** `GET /evidencia/resumen` admite además `supervisor` y `calidad`, que ven el KPI TRI en su Home (`useResumenJefe`). `maquinista` y `mermas` reciben 403 en todo el módulo. La encuesta `/encuesta/:token` sigue siendo pública.

### Catálogos y usuarios

| Acción | Roles |
| --- | --- |
| Lectura de catálogos (`GET /turnos`, `/sabores`, `/lineas`, `/productos`, `/velocidades-estandar`, `/causas-*`) | cualquier rol autenticado |
| Alta / edición de líneas, productos, velocidades estándar y causas; baja de líneas y causas | `jefe`, `supervisor` |
| Baja de productos y de velocidades estándar | solo `jefe` |
| Alta / edición / estado / contraseña de usuarios | solo `jefe` |
| `GET /usuarios` | cualquiera; ficha completa solo para `jefe` (ver **Usuarios y colaboradores**) |

---

## catalogs

Todos los catálogos usan **baja lógica**: `DELETE` nunca borra el registro, lo marca `inactivo` (o `baja` en máquinas) y devuelve `BajaLogicaResponse` con cuántos registros históricos siguen referenciándolo.

```ts
interface BajaLogicaResponse {
  id: string;
  codigo: string;
  estado: 'inactivo' | 'baja';
  conservados: number;          // nº de registros históricos que conservan el código
  etiquetaConservados: string;  // 'órdenes' | 'paradas' | 'mermas' (plural para el modal Danger)
  mensaje: string;
}
```

`DELETE /causas-parada/:id` devuelve además `paradasConservadas` (alias histórico de `conservados`, `BajaCausaParadaResponse extends BajaLogicaResponse`) que web y los e2e todavía consumen.

### Reglas comunes de edición (QA 2-oct-2026)

- **Códigos inmutables.** El `id` deriva del código (`LIN-<codigo>`, `PRD-<codigo>`, `CPA-<codigo>`, `CME-<codigo>`) y lo referencian órdenes, paradas y mermas. Un `PATCH` que envíe un `codigo` distinto → **422 en `codigo`** («El código … no se puede modificar»). En las causas también son inmutables `nivel` y `parentId` (422). Los esquemas `updateLineaSchema` / `updateProductoSchema` de `@mes/types` ya omiten `codigo`.
- **Altas sin sobrescritura.** `POST` comprueba el código **y el id derivado** (409 si cualquiera existe) e inserta con `INSERT` puro: recrear el código de una línea renombrada ya no pisa la línea anterior; dos altas simultáneas dan 409, no un `UPDATE` silencioso. Las velocidades estándar toman el correlativo `VE-NNNN` del máximo existente + 1 (no `count() + 1`, el maestro tiene huecos) y reintentan ante clave duplicada.
- **Versión.** Todas las entidades de esta sección (salvo turnos y sabores) devuelven `version` y aceptan `version` en el `PATCH` → 409 si cambió (ver **Convenciones**).
- **Nulos.** `null` explícito en un campo NOT NULL (`nombre`, `estado`, `pesoKg`…) → 422 «Este campo no puede ser nulo».
- **`404`** con `code: 'NOT_FOUND'` y mensaje del recurso («Línea no encontrada»…).

### Cascadas de baja

| Acción | Efecto en cascada |
| --- | --- |
| Línea → `inactivo` (`DELETE` o `PATCH estado`) | Sus pares producto × línea **activos** pasan a `inactivo`; el mensaje de la baja lo dice («También se dieron de baja N velocidades estándar de la línea»). Reactivar la línea **no** reactiva los pares (se revisan uno a uno). Las líneas inactivas desaparecen del tablero de Tiempo real y no admiten órdenes nuevas (422 en `ordenSapId`) |
| Producto → `inactivo` (`DELETE` o `PATCH estado`) | Sus pares activos pasan a `inactivo`; `GET /productos?lineaId=` sólo devuelve productos activos con par activo |
| Causa (parada o merma) → `inactivo` (`DELETE` o `PATCH estado`) | Todo su **subárbol** pasa a `inactivo` (antes una hija activa bajo un padre inactivo seguía en los wizards); el mensaje informa cuántas hijas se dieron de baja |
| Reactivar una causa | Exige que su padre esté activo → si no, **422 en `estado`** («Activa primero el nodo padre …») |
| Reactivar / crear un par activo | Exige producto **y** línea existentes (422 si no) y activos (422 «… está inactivo; actívalo primero») |
| Desactivar un usuario | Revoca sus sesiones (`tokenVersion`) |

### Árbol de causas: reglas de alta

- Un `tipo` es raíz: sin `parentId` (422) y código de dos segmentos (`PN-02`).
- Nivel 2 (`general` / `clasificacion`) cuelga de un `tipo`; nivel 3 (`especifica` / `causa`) de un nivel 2. Código de tres segmentos con el prefijo `XX-NN` de su tipo (422 en `codigo`). El padre debe existir y estar **activo** (422 en `parentId`).
- **Clasificación de parada** (`programada` / `imprevista`): se hereda del tipo raíz al crear; sólo se edita en el tipo (422 en una hija) y se propaga a todo su subárbol.
- `paradasHistoricas` / `mermasHistoricas` se calculan al consultar (registros vivos con esa causa + histórico heredado del maestro).

### Turnos

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/turnos` | GET | — | `{ data: TurnoDef[] }` — `D` Día 06:00–18:00 y `N` Noche 18:00–06:00 | 401 |

### Sabores

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/sabores` | GET | `estado?` | `{ data: Sabor[] }` — 41 sabores reales, sin FK con producto (`Producto.saborId` es informativo) | 401 |

### Líneas

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/lineas` | GET | `tipoProceso?` (`llenadora\|extrusora\|moldeadora`), `estado?` | `{ data: LineaListItem[] }` — 9 líneas reales (máquinas físicas): 4 llenadoras (`LLEN-M2`, `LLEN-M1`, `LLEN-A1`, `LLEN-A2`), 2 extrusoras (`EXTR-2`, `EXTR-3`), 3 moldeadoras (`MOLD-A2`, `MOLD-A3`, `MOLD-A4`); cada fila añade `productosConVelocidad` y `paradas30d` | 401 |
| `/lineas` | POST | `CreateLinea { codigo, nombre, nombreCorto, tipoProceso, estado?, capacidadUnidadesMin? (0–100 000 u/min) }` — `codigo` formato `LLEN-M2` / `EXTR-2` / `MOLD-A3` | `Linea` (201, `version: 1`) | 403 (`jefe`/`supervisor`) · 409 código o id duplicado · 422 |
| `/lineas/:id` | PATCH | `Partial<CreateLinea>` sin `codigo` + `version?` — edita nombre, nombre corto, tipo de proceso, estado o capacidad | `Linea` | 403 · 404 · **409 versión** · **422 `codigo` inmutable** / nulo |
| `/lineas/:id` | DELETE | — | `BajaLogicaResponse` (`estado: 'inactivo'`, `etiquetaConservados: 'órdenes y paradas'`) — la línea pasa a `inactivo`, conserva su histórico y **da de baja sus pares** producto × línea | 403 (`jefe`/`supervisor`) · 404 |

La línea **es** la máquina física de planta: no existe un nivel de equipo por debajo y la parada se registra hasta aquí. `Linea` no expone `sedeId` (la aplicación opera una única sede, Lima).

### Productos

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/productos` | GET | `lineaId?` (solo productos con par producto × línea **activo** en esa línea), `search?` (código, nombre o descripción), `estado?` | `{ data: Producto[] }` — 201 productos reales, código de 7 dígitos. **`Producto` ya no lleva `lineaId` ni `velocidadEstandar`**: viven en el par (`VelocidadEstandar`) | 401 |
| `/productos` | POST | `CreateProducto { codigo, descripcionLarga, descripcionCorta, nombre, alias?, marca?, presentacion?, unidadesPorCaja?, pesoKg (≤ 10 000), saborId?, sabor?, estado? }` — con `saborId`, `sabor` se deriva del catálogo | `Producto` (201, `version: 1`) | 403 (`jefe`/`supervisor`) · 409 código o id duplicado · 422 (incl. `saborId` inexistente) |
| `/productos/:id` | PATCH | `Partial<CreateProducto>` sin `codigo` + `version?` | `Producto` | 403 · 404 · **409 versión** · **422 `codigo` inmutable** / nulo |
| `/productos/:id` | DELETE | — | `BajaLogicaResponse` (`etiquetaConservados: 'órdenes'`) — baja lógica, el producto pasa a `inactivo`, conserva sus órdenes y **da de baja sus pares** | 403 (solo `jefe`) · 404 |

### Velocidades estándar (par producto × línea)

La velocidad estándar vive en el par `producto × línea` (`VelocidadEstandar`, tabla `producto_linea`), no en el producto. `velocidadUnidHora` es el dato fuente del maestro; `velocidadUnidMin = velocidadUnidHora / 60` (1 decimal) es la que consume el cálculo de OEE y la que se **congela** en `OrdenFabricacion.velocidadEstandar` al iniciar la orden.

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/velocidades-estandar` | GET | `productoId?`, `lineaId?`, `estado?` | `{ data: VelocidadEstandarListItem[] }` — 333 pares, con `productoCodigo`, `productoNombre`, `lineaCodigo`, `lineaNombre`, `tipoProceso` resueltos | 401 |
| `/velocidades-estandar` | POST | `CreateVelocidadEstandar { productoId, lineaId, velocidadUnidHora (1–60 000), mermaEstandarPct?, cipMin?, arranqueMin?, estado? }` — `velocidadUnidMin` **no se envía**, la API la deriva | `VelocidadEstandar` (201, `version: 1`) | 403 (`jefe`/`supervisor`) · 409 el par ya existe (también en altas simultáneas) · 422 producto o línea inexistente, o inactivo si el par nace activo |
| `/velocidades-estandar/:id` | PATCH | `Partial<CreateVelocidadEstandar>` + `version?` — recalcula `velocidadUnidMin` si cambia `velocidadUnidHora` | `VelocidadEstandar` | 403 · 404 · 409 par duplicado o **versión** · 422 activar con producto/línea inactivos |
| `/velocidades-estandar/:id` | DELETE | — | `BajaLogicaResponse` (`etiquetaConservados: 'órdenes'`) — el par pasa a `inactivo`; las órdenes que lo congelaron conservan su valor | 403 (solo `jefe`) · 404 |

### Causas de parada

Árbol de 3 niveles **Tipo → General → Específica** (mismo patrón `TT-GG-EE` que antes; 5 tipos → 26 generales → 52 específicas = 83 causas). Ahora acepta `codigoLegado`, el código del sistema original (`PNP`, `RUT04`, `FAL02`, `IMP10`…) que se conserva a modo de trazabilidad.

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/causas-parada` | GET | `formato=arbol\|plano` (def. `arbol`), `nivel?` (`tipo\|general\|especifica`), `lineaId?` | `{ data: CausaParadaNodo[] }` (árbol con `hijos[]`) o `{ data: CausaParada[] }` (plano) | 401 |
| `/causas-parada` | POST | `CreateCausaParada { codigo, nombre, nivel, parentId?, clasificacion? (programada\|imprevista; sólo en el tipo, las hijas la heredan), afectaOee?, requiereEvidencia?, requiereSolicitud?, tiempoEstandarMin?, lineasAplicables?, estado?, codigoLegado? }` | `CausaParada` (201, `version: 1`) | 403 (`jefe`/`supervisor`) · 409 código o id duplicado · 422 jerarquía (padre inexistente, inactivo o de nivel incorrecto; código fuera del prefijo del tipo) |
| `/causas-parada/:id` | PATCH | `Partial<CreateCausaParada>` + `version?` (acepta `codigoLegado`); `codigo`, `nivel` y `parentId` inmutables | `CausaParada` — `estado: 'inactivo'` baja el subárbol; `clasificacion` en un tipo se propaga | 403 · 404 · **409 versión** · 422 inmutables / clasificación en una hija / reactivar bajo padre inactivo |
| `/causas-parada/:id` | DELETE | — | `BajaCausaParadaResponseDto` (`BajaLogicaResponse` + `paradasConservadas`, `etiquetaConservados: 'paradas'`) — baja la causa **y su subárbol** | 403 (`jefe`/`supervisor`) · 404 |

### Causas de merma

Mismo patrón de árbol de 3 niveles que las causas de parada, pero con nomenclatura propia: **Tipo de producción → Clasificación → Causa** (5 tipos → 11 clasificaciones → 40 causas = 56 causas). Los tipos de merma (`MP`/`EP`/`PT`) se marcan por causa en `aplicaA`.

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/causas-merma` | GET | `formato=arbol\|plano` (def. `arbol`), `nivel?` (`tipo\|clasificacion\|causa`), `tipo?` (`MP\|EP\|PT`), `lineaId?` | `{ data: CausaMermaNodo[] }` o `{ data: CausaMerma[] }` | 401 |
| `/causas-merma` | POST | `CreateCausaMerma { codigo, nombre, nivel, parentId?, aplicaA?, lineasAplicables?, requiereEvidencia?, requiereComentario?, requiereSolicitud?, estado? }` — `codigo` formato `MP-01`, `MP-01-A` o `MP-01-01` | `CausaMerma` (201, `version: 1`) | 403 (`jefe`/`supervisor`) · 409 código o id duplicado · 422 formato / jerarquía |
| `/causas-merma/:id` | PATCH | `Partial<CreateCausaMerma>` + `version?`; `codigo`, `nivel` y `parentId` inmutables | `CausaMerma` — `estado: 'inactivo'` baja el subárbol | 403 · 404 · **409 versión** · 422 inmutables / reactivar bajo padre inactivo |
| `/causas-merma/:id` | DELETE | — | `BajaLogicaResponse` (`etiquetaConservados: 'mermas'`) — baja la causa **y su subárbol**; las mermas registradas siguen referenciándola | 403 (`jefe`/`supervisor`) · 404 |

### Usuarios y colaboradores

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/usuarios` | GET · cualquier rol | `rol[]`, `lineaId?` (incluye además a los usuarios sin línea: jefe, supervisores, calidad), `activo?` (`true` solo activos, `false` solo inactivos) | `jefe`: `{ data: User[] }` ficha completa y, **sin `activo`, todos** (activos e inactivos). **Resto de roles**: `{ data: UsuarioDirectorio[] }` (sin `email`, `dni` ni `ultimoAcceso`: el DNI también es identificador de login) y, sin `activo`, **solo activos** | 401 |
| `/usuarios/directorio` | GET · cualquier rol | mismos filtros; `activo` por defecto `true` | `{ data: UsuarioDirectorio[] }` — `UsuarioDirectorio = Omit<User, 'email' \| 'dni' \| 'ultimoAcceso'>` (id, nombre, rol, cargo, línea, iniciales, activo…) para los selectores de responsable / maquinista / supervisor / invitado | 401 |
| `/usuarios` | POST | `CreateUsuario { nombre (3–120), email (≤120, se guarda en minúsculas), dni (8 dígitos), rol, cargo (2–80), lineaId?, password (≥8) }` | `User` (201, hash bcrypt, iniciales derivadas del nombre) | 403 (solo `jefe`) · 409 correo o DNI duplicado · 422 (incl. **`lineaId` inexistente** y **maquinista sin línea**, `MENSAJE_MAQUINISTA_SIN_LINEA`) |
| `/usuarios/:id` | PATCH | `Partial<CreateUsuario>` sin `password` (un `password` en el body se descarta por `whitelist`; usar el endpoint de abajo) | `User` — un cambio de `rol` o `lineaId` revoca las sesiones del usuario | 403 · 404 · 409 correo o DNI duplicado · 422 `lineaId` inexistente / maquinista sin línea (sobre el estado final) · **422 `BUSINESS_RULE`** si el jefe se quita su propio rol o si dejaría la planta sin ningún jefe activo |
| `/usuarios/:id/estado` | POST | `{ activo: boolean }` | `User` (200) — la baja revoca sus sesiones | 403 · 404 · **422 `BUSINESS_RULE`** si el `jefe` intenta desactivar su propia cuenta o al último jefe activo |
| `/usuarios/:id/restablecer-password` | POST | `{ password: string (≥8) }` | `User` (200, sin `passwordHash`) — revoca las sesiones abiertas | 403 (solo `jefe`) · 404 |
| `/colaboradores` | GET | — | `{ data: Colaborador[] }` — cuadrilla del turno del paso "Equipo" de la OF | 401 |

Un usuario `activo: false` no puede iniciar sesión (`401 UNAUTHORIZED` en `/auth/login`).

---

## orders

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/ordenes` | GET | `periodo`, `desde`, `hasta`, `lineaId[]`, `turno[]` (`D\|N`), `estado[]`, `search`, `sort=fecha\|codigo\|oee\|producido`, `orden=asc\|desc`, `page`, `pageSize` | `Paginated<OrdenListItem>` | 401 |
| `/ordenes/resumen` | GET | — | `OrdenesResumen { todas, porValidar, conParadas, conMermas, ultimaSincronizacion }` — `ultimaSincronizacion` = máximo `sincronizadaEn` de `orden_sap`, **`null`** si nunca se sincronizó | 401 |
| `/ordenes/:id` | GET | acepta id (`ORD-95101752`, `ORD-0815`) o código (`95101752`, `OF-2026-0815`) | `OrdenListItem` + **`planSap?: PlanSapDeOrden \| null`** (sólo en el detalle) | 404 |
| `/ordenes` | POST · jefe/supervisor | `CreateOrden { ordenSapId, lote (3–40), vencimiento (fecha real, **posterior a hoy** en hora de planta), maquinistaId, supervisorId, operarios (1–200), colaboradorIds[], tiempoRegistroSeg? (0–3600) }` | `OrdenListItem` (201) | 403 · 404 orden SAP inexistente · **409** orden SAP ya iniciada **o la línea ya tiene una orden en curso** · **422 en `ordenSapId`** si el producto no está en el maestro, no hay velocidad estándar (ni par activo ni texto SAP), la línea está inactiva o el planificado se desborda · 422 en `maquinistaId` / `supervisorId` (inexistente, rol incorrecto o desactivado), `colaboradorIds`, `vencimiento` |
| `/ordenes/:id/finalizar` | POST · jefe/supervisor/maquinista (solo su línea) | `FinalizeOrden { producido (0–100 000 000), conteoCodificadora (0–100 000 000), evidenciaUrl?, comentario? (≤500), tiempoRegistroSeg? (0–3600) }` — `''`/`null` no se convierten en 0 (422 «Campo obligatorio») | `OrdenListItem` (estado → `por_validar`) | 403 rol u orden de otra línea · 404 · **409** ya finalizada (también el segundo envío de un doble clic) **o con una parada abierta** · **422 en `producido`** si supera lo plausible (ver abajo) |
| `/ordenes/:id/validar` | POST · jefe/supervisor | `ValidateOrden { produccionRegistrada, paradasConCausa, mermasClasificadas, evidenciaEtiqueta, observacion? (≤500) }` (los 4 booleanos deben ser `true`) | `OrdenListItem` (estado → `validada`, recalculada por última vez) | 403 · 404 · 409 en curso, ya validada (segundo envío) **o con una parada abierta** · 422 |
| `/ordenes/:id/paradas` | GET | — | `{ data: ParadaListItem[], resumen: { cantidad, minutos, afectanOee } }` | 404 |
| `/ordenes/:id/mermas` | GET | — | `{ data: MermaListItem[], resumen: { cantidad, kg } }` | 404 |
| `/ordenes/:id/velocidades` | GET | — | `{ data: RegistroVelocidadListItem[] }` | 404 |
| `/ordenes/:id/bitacora` | GET | `tipo[]` (`creacion\|edicion\|parada\|merma\|velocidad\|validacion\|sistema`) | `{ data: AuditEvent[] }` desc por fecha | 404 |

**Estados de orden:** `en_curso` · `cerrada` · `por_validar` · `validada` · `incompleta`.

**Alta desde una orden SAP.** Como en el sistema legado, toda orden nace de una fila **pendiente** de `GET /ordenes-sap`. El servidor deriva de la fila: `lineaId`, `productoId`, `codigo` (= número SAP; si el número ya existe en el MES —mismo número en otra fecha, turno o parcial— se añade `-2`, `-3`…, el mismo esquema que `pnpm sync:real`), `id = ORD-<codigo>` y `planificado = planificadoCajas × unidadesPorCaja` (unidades). El **turno** y la **fecha** de la orden salen de la hora real de inicio en planta (`ahoraPlanta()`): `turno = turnoDeInstante(inicio)` (06–18 `D`, resto `N`) y `fecha = fechaOperativaDe(inicio)` (el tramo 00:00–06:00 del turno Noche pertenece al día anterior). El turno y la fecha **del plan SAP** se conservan aparte en `planSap { ordenSapId, numero, fecha, turno, planificadoCajas }`, que devuelve `GET /ordenes/:id`. La fila SAP queda consumida (`ordenId`) en la misma transacción, con un `UPDATE … WHERE ordenId IS NULL` que convierte en 409 un alta simultánea de la misma fila; la transacción también bloquea la línea para garantizar **una sola orden en curso por línea** (409). La bitácora de creación cita el número, fecha y turno SAP.

**OEE de la orden** (`oeeDeOrden`, `packages/shared/src/orden.ts`, una sola fórmula para el estimado del modal de cierre en la web y el recálculo del servidor):

```
tiempo planificado = duración real de la orden (inicio → fin; si sigue abierta, hasta ahora, acotado al fin de su turno)
Disponibilidad     = (planificado − minutos de paradas que afectan OEE) / planificado
Desempeño          = producido / (velocidad estándar × tiempo operativo)   ; tiempo operativo = planificado − paradas
Calidad            = unidades buenas / producido ; unidades buenas = min(producido, conteo codificadora)
                     conteo 0 o nulo = «sin codificadora»: buenas = producido − merma en unidades (kg ÷ peso del producto, si se conoce) o producido; nunca 0
OEE                = Disponibilidad × Desempeño × Calidad
```

**Plausibilidad de la producción.** `POST /ordenes/:id/finalizar` rechaza con **422 en `producido`** una cantidad mayor que `produccionMaximaPlausible = ⌈velocidad estándar (u/min) × max(1, duración real en min) × 1,5⌉` (`MARGEN_PLAUSIBILIDAD_PRODUCCION = 1.5`): el 50 % de holgura cubre líneas que rinden por encima del estándar y órdenes iniciadas en el MES unos minutos tarde; más allá es un error de tipeo.

**Órdenes importadas del legado (`pnpm sync:real`).** `validar` **no recalcula**: sólo sella el estado y conserva el OEE vigente. Una orden cerrada importada (se reconoce por `colaboradores` vacío: `mapeo.ts` no los asigna y el alta del MES siempre asigna al menos uno) conserva **todo** su OEE del legado cuando un jefe o supervisor corrige o añade paradas y mermas: el motor del legado usó datos que el MES no guarda y la fórmula del MES lo reescribiría (calidad a 100, otra disponibilidad y desempeño incluso con una parada que no afecta OEE). Esas correcciones sólo actualizan `paradasCount` y `mermasKg`. Limitación: una parada nueva que sí afecta OEE tampoco mueve el OEE de una orden importada.

**Recálculo.** Una orden `validada` está sellada y nunca se recalcula; una orden finalizada pendiente de validar sólo se recalcula cuando corrige un jefe o supervisor. Finalizar y validar son `UPDATE … WHERE estado = <leído>`: el segundo envío recibe 409 y no duplica bitácora ni TRI.

**Velocidad estándar** (u/min, congelada en la orden): la del **par activo** producto × línea (`velocidadEstandarId` = id del par); si el par no existe o está `inactivo`, la del texto SAP (`'7200 u/h'` → 120 u/min, `velocidadEstandarId = null`); sin ninguna de las dos la orden **no puede crearse** (422 sobre `ordenSapId`) porque el OEE quedaría sin referencia de desempeño.

### Órdenes SAP

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/ordenes-sap` | GET · cualquier rol | `lineaId?`, `q?` (≤ 80 car.; número, código o descripción del producto) | `{ data: OrdenSapListItem[] }` — pendientes (`ordenId` nulo) con producto mapeado, por `fecha` asc y turno | 401 |
| `/ordenes-sap/sincronizar` | POST · jefe/supervisor | — | `SincronizacionOrdenesSap { leidas, insertadas, actualizadas, eliminadas, omitidas, sinProducto, sincronizadaEn }` | 403 · **503 `ORIGEN_NO_CONFIGURADO`** sin `ORIGEN_DATABASE_URL` |

`OrdenSap { id, numero, fecha, turno, lineaId, productoId | null, codigoProducto, productoNombre, planificadoCajas, velocidadUnidHora | null, tipoProduccion, ordenId | null, sincronizadaEn }`; el listado añade `lineaCodigo`, `lineaNombre`, `unidadesPorCaja`, `planificadoUnidades` y la velocidad con la que nacería la orden (`velocidadEstandar` u/min o `null`, `velocidadFuente: 'par' | 'sap' | null`).

- **Origen.** `orden_fabricacion_dbs` del sistema legado (la llena el integrador de SAP), leída siempre en **sólo lectura** (`default_transaction_read_only=on` + transacción `READ ONLY`) con el lector compartido `src/modules/ordenes-sap/origen-sap.ts`. Filtro idéntico al paso «Seleccionar Orden» del legado: sin enlace en `orden_fabricacion_dbs_orden_lnk`, `tipo_produccion = 'Produccion'`, `fecha >= ayer` (hora de Lima) y línea distinta de `MIXPLANT 2`. Turno SAP `'1'`/`'2'` → `D`/`N`; `planificado` (texto, en cajas) → entero; `velocidad_estandar` (`'22800 u/h'`, a veces `' u/h'`) → u/h o `null`.
- **Ids.** El número SAP **no es único**, así que el id deriva de la fila: `SAP-<id de orden_fabricacion_dbs>`. Las filas de demostración de los seeds y los mocks usan `SAPD-NNN` y la sincronización nunca las toca.
- **Sincronización (upsert).** Inserta las filas nuevas, refresca las conocidas **sin pisar `ordenId`** (lo que el MES ya consumió sigue consumido aunque el origen la siga viendo libre) y borra las pendientes `SAP-…` que ya no vienen (desaparecidas, consumidas en el legado o fuera de la ventana). Filas con producto fuera del maestro se guardan con `productoId = null` y no se listan; líneas desconocidas se omiten. Corre cada `ORDENES_SAP_INTERVALO_MIN` (5 por defecto) **sólo si** la API tiene `ORIGEN_DATABASE_URL`; sin ella el job queda desactivado y lo registra una vez en el log. La API nunca lee el `.env` de yamboli-back.
- **`pnpm sync:real`** reconstruye `orden_sap` entera: las cabeceras SAP de las órdenes ejecutadas de la ventana, ya consumidas (`ordenId` = la orden sincronizada), más las pendientes del mismo lector.

---

## downtimes

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/paradas` | GET | `ordenId?`, `lineaId[]`, `causaId[]` (matchea tanto la causa hoja como su tipo raíz), `desde`, `hasta`, `abiertas=true`, `page`, `pageSize` | `Paginated<ParadaListItem>` | 401 |
| `/paradas` | POST · `ROLES_CAPTURA_PARADA` | `CreateParada { ordenId, lineaId, tipoCausaId?, causaId, inicio, fin?, accionTomada (10–300 car.), numeroSolicitud? (≤50), evidenciaUrl? (≤200), afectaOee?, responsableId, origen?, deteccionId?, tiempoRegistroSeg? (0–3600) }` — la parada se registra hasta la **línea** (no hay nivel máquina); `tipoCausaId` se deduce del árbol si se omite; `fin` permite registrar una parada retroactiva ya cerrada | `ParadaListItem` (201) | 403 rol, línea ajena u orden finalizada · **409** orden validada · **409** la línea ya tiene una parada abierta o **se solapa** con otra de la misma línea · 422 (ver reglas abajo) |
| `/paradas/:id` | PATCH · `ROLES_CAPTURA_PARADA` | `UpdateParada` (+ `fin?: string \| null`, `motivoEdicion?`) | `ParadaListItem`; el cambio de causa, línea y hora de fin se escriben en la bitácora. `fin` recalcula `duracionMin`; `fin: null` reabre la parada (spec 05.F) | 403 · 404 · 409 orden validada / solape · 422 |
| `/paradas/:id/finalizar` | POST · `ROLES_CAPTURA_PARADA` (200) | `FinalizeParada { fin, comentarioCierre? }` | `ParadaListItem` con `duracionMin` | 403 · 404 · 409 ya finalizada, orden validada o solape · 422 `fin` inválido, futuro, anterior al inicio o fuera de la orden |
| `/detecciones-iot` | GET | `estado=sugerida\|confirmada\|descartada` | `{ data: DeteccionIoT[] }` | 401 · 422 `estado` fuera del enum |
| `/detecciones-iot/:id/confirmar` | POST · `ROLES_CAPTURA_PARADA` | `{ causaId, accionTomada, numeroSolicitud?, evidenciaUrl?, tiempoRegistroSeg? (0–3600) }` | `{ deteccion, parada }` (201) — crea una parada `origen: 'iot'` vinculada a la orden en curso de la línea, con las mismas validaciones que `POST /paradas` | 403 rol o línea ajena · 404 · 409 ya procesada · 422 sin orden en curso en la línea · 422 de causa / requisitos / horas |
| `/detecciones-iot/:id/descartar` | POST · `ROLES_CAPTURA_PARADA` (200) | — | `DeteccionIoT` (`estado: 'descartada'`) | 403 · 404 · 409 ya procesada |

**Reglas de la parada (422 por campo):**

- **Causa** (`causaId`): debe existir, ser **hoja** (`nivel: 'especifica'`), aplicar a la línea (`lineasAplicables`) y estar **activa con toda su rama**: si la propia causa **o cualquiera de sus ancestros** (general o tipo) está `inactivo`, se rechaza con 422 en `causaId`. Aplica a `POST /paradas`, al `PATCH` cuando se cambia la causa y a `POST /detecciones-iot/:id/confirmar`. Al editar sin cambiar la causa, una causa dada de baja después no bloquea la corrección. `tipoCausaId`, si se envía, debe ser la raíz de la causa.
- **Requisitos de la causa**: `numeroSolicitud` si `requiereSolicitud`; `evidenciaUrl` si `requiereEvidencia`.
- **Horas** (`inicio`, `fin`): ISO local de Lima (`AAAA-MM-DDTHH:mm[:ss]`); no en el futuro (tolerancia `TOLERANCIA_FUTURO_MIN` = 5 min); dentro del rango `inicio`–`fin` de la orden; `fin ≥ inicio`.
- **Referencias**: `lineaId` existente y la de la orden; `responsableId` existente; `deteccionId` existente y de la misma línea.
- **Foto** (`evidenciaUrl`): debe venir de `POST /evidencias`, subida por **el mismo usuario** hace menos de 24 h y no vinculada ya a otra parada o merma (422 en `evidenciaUrl`).

`tiempoRegistroSeg` alimenta el KPI **TRI**: cada parada, merma, orden o velocidad creada emite el evento `TRI_REGISTRO_EVENT` y añade una fila al Anexo 02 (postest). Máximo 3600 s (422 por encima).

### Fotos de evidencia (`/evidencias`)

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/evidencias` | POST · `ROLES_SUBIR_EVIDENCIA` (201) | multipart `archivo` (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`; ≤ 8 MB) | `EvidenciaGuardada { nombre, url, nombreOriginal, bytes }` — `url` es la que se guarda en `evidenciaUrl` | 403 (`investigador`) · **413 `PAYLOAD_TOO_LARGE`** («La foto supera el máximo de 8 MB», `details.archivo`) · 422 sin archivo / tipo no admitido |
| `/evidencias/:archivo` | GET | nombre generado por la subida (nunca `../` ni el `.json` de metadatos) | la imagen (`X-Content-Type-Options: nosniff`) | 404 |

Junto a cada foto se guarda quién la subió y cuándo; sólo esa persona puede vincularla, durante 24 h, a un único registro.

---

## scrap

Las causas de merma son un árbol de 3 niveles (**tipo de producción → clasificación → causa**); la causa elegida debe ser una **hoja activa** (`nivel: 'causa'`). La API valida la jerarquía completa:

1. La causa (`causaId`) existe, es nivel `causa` (rechaza tipos o clasificaciones intermedias), aplica a la línea y está **activa con toda su rama**: si la causa o cualquiera de sus ancestros (clasificación o tipo) está `inactivo` → 422 en `causaId` (en `POST /mermas` y en el `PATCH` cuando se cambia la causa; una causa dada de baja después no bloquea editar registros antiguos).
2. Si la causa declara `aplicaA` (tipos de merma donde aplica), `tipo` debe estar incluido.
3. `tipoCausaId` y `clasificacionId` son **opcionales**: si no se envían, la API los **deriva** subiendo la cadena de padres de la causa (`cadenaCausaMerma`). Si se envían, deben coincidir con esa cadena o la API responde 422.
4. Si la causa tiene `requiereComentario`, `observacion` es obligatoria; si tiene `requiereSolicitud`, `numeroSolicitud` es obligatorio; si tiene `requiereEvidencia`, `evidenciaUrl` es obligatoria (y se valida igual que en paradas: subida por el mismo usuario, < 24 h, no usada).
5. `sabor` (nombre) debe existir en el catálogo de sabores (sin distinguir mayúsculas).

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/mermas` | GET | `ordenId?`, `lineaId[]`, `tipo[]` (`MP\|EP\|PT`), `causaId[]`, `desde`, `hasta`, `page`, `pageSize` | `Paginated<MermaListItem>` | 401 |
| `/mermas` | POST · `ROLES_CAPTURA_MERMA` | `CreateMerma { ordenId, lineaId, tipo, cantidadKg (0,01–500), sabor (≤80), tipoCausaId?, clasificacionId?, causaId, numeroSolicitud? (≤50), evidenciaUrl? (≤200), responsableId, codigoBalde? (≤50), enviarPasteurizacion?, observacion? (≤300), tiempoRegistroSeg? (0–3600) }` | `MermaListItem` (201) — **persiste `evidenciaUrl`** | 403 rol, línea ajena u orden finalizada · 409 orden validada · 422 `causaId` no existe / no es hoja / rama inactiva / no aplica al `tipo` o a la línea · 422 `tipoCausaId`/`clasificacionId` no coincide con la cadena de la causa · 422 `observacion`, `numeroSolicitud` o `evidenciaUrl` exigidos por la causa · 422 `sabor` inexistente · 422 `cantidadKg` fuera de rango |
| `/mermas/:id` | PATCH · `ROLES_CAPTURA_MERMA` | `UpdateMerma` — si cambia `causaId` se revalida el árbol completo con los valores resultantes; `ordenId` y `lineaId` no se pueden cambiar | `MermaListItem` | 403 · 404 · 409 orden validada · 422 (incl. «Una merma no se puede mover a otra orden/línea») |

`enviarPasteurizacion` se conserva como flag informativo (marca la merma para el flujo histórico de pasteurización), aunque el módulo `/pasteurizacion` ya no forma parte de la navegación.

---

## speeds

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/velocidades` | GET | `ordenId?`, `lineaId[]`, `page`, `pageSize` | `Paginated<RegistroVelocidadListItem>` | 401 |
| `/velocidades` | POST · `ROLES_CAPTURA_VELOCIDAD` | `CreateVelocidad { ordenId, lineaId, velocidadReal (> 0, máx. 2 decimales), motivo?, responsableId, tiempoRegistroSeg (0–3600) }` | `RegistroVelocidadListItem` con `desvioPct` calculado contra `OrdenFabricacion.velocidadEstandar` (201); `registradaEn` en hora de planta; id `VEL-…-N<n>` sin carrera | 403 rol, línea ajena u orden finalizada · 409 orden validada · 422 velocidad ≤ 0 / `lineaId` distinta de la orden |

---

## realtime

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/tiempo-real/lineas` | GET | `lineaId[]`, `estado[]` (`produciendo\|parada\|sin_orden\|alerta\|sugerida`) | `TiempoRealResumen { actualizadoEn, diaOperativo, turno, turnoLabel, turnoRango, lineas: LineaEstado[] }` — una fila por línea **activa** (las dadas de baja en Configuración no se muestran en planta) | 401 |
| `/tiempo-real/lineas/:id/timeline` | GET | — | `LineaTimeline { lineaId, lineaCodigo, lineaNombre, ordenCodigo?, eventos: TimelineEvento[] }` | 404 |
| `/tiempo-real/tv` | GET | — | `TvResumen { actualizadoEn, turnoLabel, filas: TvRow[] }` — una fila por línea activa | 401 |
| `/tiempo-real/stream` | GET (SSE) | `token?` | `text/event-stream`, eventos `estado` con `RealtimeStreamEvent` cada 5 s. `EventSource` no admite cabeceras: **sólo esta ruta** acepta el JWT por query (`?token=…`); cualquier otra lo ignora | 401 |

**Día operativo:** el estado de cada línea se calcula sobre las órdenes de un "día operativo" (`diaOperativo(ordenes)`), no sobre la fecha real del reloj del servidor. Esto evita que las líneas caigan en `sin_orden` cuando el `HOY` fijo de los datos sembrados queda desalineado con la fecha actual: el servicio toma como "hoy" la fecha más reciente con una orden `en_curso` (o, si no hay ninguna, la fecha más reciente del dataset).

**Prioridad de estado de línea:** parada abierta → detección IoT sugerida → sin orden en curso → alerta activa → produciendo.

**Orden en curso y última parada.** La orden en curso de cada línea se elige **por estado** (`en_curso`), no por fecha: una orden del turno Noche iniciada antes de medianoche sigue en curso al día siguiente. Con una parada abierta, la tarjeta habla de **esa** parada y no de la última por inicio.

**Riesgo de la tarjeta.** `LineaEstado.alerta` (`AlertaLinea`) incluye **`tipo: TipoAlerta`** (`parada_prevista` · `merma_prevista` · `velocidad_baja` · `oee_bajo`) además de la probabilidad 0–100: la web rotula el riesgo con el tipo real de la alerta/predicción (una alerta de velocidad baja ya no se pinta como «riesgo de parada»).

### Sensores IoT (sólo lectura, `src/modules/realtime/iot/`)

El tablero lee el conteo de producción de los sensores ESP32 del servicio `iot-yambo` (MQTT → Postgres → API REST). La integración es **estrictamente de sólo lectura**: `IotApiClient` sólo hace `GET` (el método va fijo; `iot-api.client.spec.ts` vigila que no aparezca ninguna escritura) y, a diferencia del legado, **no** congela bases con `POST /api/lineales/:x/bases`. La API IoT exige `X-API-Key`, así que se consume siempre desde la API del MES, nunca desde el navegador.

| Variable | Uso |
| --- | --- |
| `IOT_API_URL` | Base del API IoT (sin `/api` final). Sin ella, o sin clave, la integración queda **desactivada**: no se toca la red y el tablero se comporta como antes (se avisa una vez en el log) |
| `IOT_API_KEY` | Cabecera `X-API-Key` |
| `IOT_LINEAS` | Vacía: todas las líneas del MES cuyo nombre coincide con una lineal instrumentada. `LIN-MOLD-A3,LIN-MOLD-A2`: sólo esas, enlazadas por nombre. `LIN-MOLD-A3=MOLDEADORA A3`: enlace explícito |
| `IOT_TIMEOUT_MS` | Timeout por petición (3000 por defecto) |

Llamadas al IoT (todas con caché compartida entre pantallas, sólo mientras alguien pide el tablero; ≤ 19 peticiones/min con una línea instrumentada, ≤ 31 con tres):

| Llamada | Para qué | Caché |
| --- | --- | --- |
| `GET /api/lineales` | Catálogo de lineales y sus sensores | 60 s |
| `GET /api/lineales/estado` | Velocidad medida (últimos ~2 min) y sensores en línea, una llamada para todas | 5 s (= cadencia del SSE) |
| `GET /api/lineales/:lineal/conteo?desde&hasta` | Producido de la orden en curso en `[inicio de la orden, ahora + 1 min]` | 10 s por orden |

**Hora de inicio de la orden.** `orden.inicio` es hora de pared de Lima sin zona; para pedir el conteo se convierte a UTC **interpretándola explícitamente como `America/Lima`** (UTC−5), independiente de la TZ del proceso (el despliegue fija `TZ=UTC`, y un `new Date(inicio)` desplazaría la ventana 5 h).

Campos nuevos de `LineaEstado` (todos opcionales; ausentes = línea sin sensores):

```ts
sensores?: SensoresLinea {
  lineal: string;           // 'MOLDEADORA A3'
  consultado: boolean;      // false = el IoT no respondió en este ciclo (no leer como «sensores caídos»)
  total: number; enLinea: number;
  sensores: { id: string; enLinea: boolean }[];   // enLinea con ventana de gracia de 3 min
  estado: 'ok' | 'parcial' | 'sensor_offline' | 'sin_conteo' | 'inconsistente' | 'sin_orden' | 'api_caida';
  ultimaLectura?: string;   // ISO local del último conteo recibido
}
fuenteProduccion?: 'sensores' | 'manual';  // 'sensores' si `producido` sale del conteo IoT
fuenteVelocidad?: 'sensores' | 'manual';   // 'sensores' si `velocidad` es la medida por el IoT
```

El conteo y la velocidad medidos mandan sobre los registros manuales **sólo cuando son de fiar**: el producido se publica en `ok`, `parcial` y `sensor_offline` (en este último, el último valor bueno; una lectura buena se sostiene 30 s ante fallos sueltos) y queda `null` (→ registros manuales) en `api_caida`, `sin_orden`, `sin_conteo` e `inconsistente` (el conteo retrocedió respecto al máximo visto: contador reiniciado). La velocidad medida se publica mientras haya orden en curso, también con la línea en parada.

---

## reports

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/reportes/indicadores` | GET | `periodo`, `desde`, `hasta`, `lineaId[]`, `turno[]`, `comparar=periodo_anterior\|anio_anterior` | `IndicadoresResumen { kpis, tendenciaOee, oeePorLinea, comparativaTurno }` | 401 · **422** con `periodo=personalizado`: `desde`/`hasta` ausentes, fechas imposibles (`2026-02-30`), rango invertido o > 5 años |
| `/reportes/paradas` | GET | idem + `clasificacion?` (`programada\|imprevista`; `imprevista` = paradas no programadas, la usa la tarjeta del Inicio) | `ParadasResumen { kpis, pareto, donut, detallePorCausa }` | 401 · 422 idem / `clasificacion` fuera del enum |
| `/reportes/mermas` | GET | idem | `MermasResumen { kpis, apiladasPorLinea, heatmap, tabla }` | 401 · 422 idem |
| `/reportes/exportar` | POST | `ExportRequest { datasets[] (sin repetidos), formato (xlsx\|csv\|pdf), desde, hasta, lineaId? (una o varias separadas por comas), turno?: ('D'\|'N')[] }` | `ExportJob` `estado: 'generando'` (202) — id sin carrera | 422 sin datasets / repetidos · **422** fechas imposibles, `hasta < desde`, rango > 5 años o `lineaId` inexistente |
| `/reportes/exportaciones` | GET | — | `{ data: ExportJob[] }` (historial, `listo` / `generando`). `url` es la ruta **relativa al prefijo del API** (`/reportes/exportaciones/:id/descargar`) y sólo aparece si el archivo se puede servir | 401 |
| `/reportes/exportaciones/:id/descargar` | GET | — | binario (`Content-Disposition: attachment`). Requiere `Authorization`, así que el frontend lo pide con `fetch` y lo guarda desde un blob (`descargarArchivo`), no con `<a download>` | 404 sin archivo |

Datasets válidos: `ordenes`, `paradas`, `mermas`, `velocidades`, `indicadores`, `alertas`, `evidencia`.

- **Paradas y Mermas sobre hechos reales.** Ya no se leen de tablas pre-agregadas (`parada_agregada`, `merma_*`, `indicador_kpi`, una foto sin periodo): se calculan sobre `parada` / `merma` filtrando por el **día operativo de su orden** (`orden.fecha`), la línea y el turno de la orden. Así las tarjetas «Paradas no programadas» (sólo `imprevista`) y «Merma del día» del Inicio respetan periodo, línea y turno. `% tiempo` = minutos de parada / tiempo planificado de las mismas órdenes; `% sobre producción` = kg de merma / kg producidos (producido × `pesoKg`).
- **`sinDatos`.** Cada `KpiValor` puede traer `sinDatos: true` cuando la ventana no tiene órdenes: `valor` llega a 0 pero la UI pinta «—» / «Sin datos», no un 0 % que parezca una medición.
- **`comparar=anio_anterior`** compara con el mismo rango un año antes (antes usaba siempre el periodo anterior).
- **Exportación.** Todas las hojas aplican el mismo rango, línea(s) y turno(s) que la página; paradas, mermas y velocidades se fechan por el día operativo de su orden.

---

## alerts

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/alertas` | GET | `tipo[]`, `severidad[]`, `lineaId[]`, `estado[]`, `search`, `desde`, `hasta`, **`pendientes?`** (`true`: solo las que esperan el resultado real —`atendida` o `vencida` con `acierto: null`—, filtradas y paginadas en el servidor; las `descartada` nunca cuentan), `page`, `pageSize` | `Paginated<Alerta>` | 401 · 422 |
| `/alertas/resumen` | GET | — | `AlertasResumen { activas, atendidasHoy, pendientesConfirmar, vencidas, epAcumulada, epConfirmadas }` — `pendientesConfirmar` usa el mismo criterio que `pendientes=true` (excluye descartadas); `epConfirmadas` = filas del Anexo 06 (con 0 la EP no se ha medido y la UI muestra «—») | 401 |
| `/alertas/recientes` | GET | `limit` (def. 3) | `{ data: Alerta[] }` — popover de la campana (07.E) | 401 |
| `/alertas/:id` | GET | — | `Alerta` con `factores[]` | 404 |
| `/alertas/:id/atender` | POST · `ROLES_ATENDER_ALERTA` (200) | `AtenderAlerta { accionTomada }` (10–300 caracteres, sin contar espacios de los extremos) | `{ alerta, resumen }` | 403 rol o línea ajena (maquinista) · 404 · **409 transición inválida** (ver máquina de estados) · 422 |
| `/alertas/:id/descartar` | POST · `ROLES_ATENDER_ALERTA` (200) | `DescartarAlerta { motivo }` (5–300 car.) | `{ alerta, resumen }` | 403 · 404 · 409 transición inválida · 422 |
| `/alertas/:id/confirmar` | POST · `ROLES_CONFIRMAR_EP` (200) | `ConfirmarEvento { ocurrio, observacion? (≤300) }` | `{ alerta, resumen, ep: number }` — `ep` es la EP acumulada en % | 403 · 404 · 409 transición inválida o confirmación simultánea · 422 |
| `/alertas/confirmar-lote` | POST · `ROLES_CONFIRMAR_EP` (200) | `{ confirmaciones: [{ alertaId, ocurrio, observacion? }] }` (1–200) | `{ data: Alerta[], resumen, ep: number }` — **atómico**: o se confirman todas o ninguna | 403 · 404 alguna alerta inexistente · **409** alguna no admite confirmación (también el segundo de dos envíos simultáneos; nunca 500) · 422 lista vacía, > 200 o ids repetidos |
| `/alertas/umbrales` | GET | — | `Umbrales` (incluye `version`) | 401 |
| `/alertas/umbrales` | PUT · `jefe`, `supervisor` | `Umbrales { velocidadBajoEstandarPct, oeeMinimo, probabilidadMinima, notificarN8n, mostrarTv, tciToleranciaMin, tciToleranciaPct, tciToleranciaDiasSap, version? }` | `Umbrales` con `version` + 1 | 403 · **409 versión** (otra persona guardó después) · 422 (un campo vacío es error, no 0) |

**Máquina de estados** (validada en el servidor; transición inválida → 409 con `details.estado`):

- `activa` → `atendida` (atender) · `descartada` (descartar).
- `atendida` · `vencida` → `confirmada` (confirmar el evento real, Anexo 06).
- `activa` → `confirmada` sólo si su ventana ya cerró (el motor aún no la había vencido); con la ventana abierta → 409 «No se puede confirmar todavía».
- `descartada` y `confirmada` son finales. Cada cambio de estado es un `UPDATE … WHERE estado IN (…)`: de dos peticiones simultáneas una gana y la otra recibe 409. El motor marca `vencida` con un `UPDATE` condicionado a `estado = 'activa'` (ya no pisa una alerta atendida entre lectura y guardado) e inserta las alertas nuevas con id único y reintento.

**Web.** «Configurar umbrales» sólo se muestra a los roles con permiso sobre `PUT /alertas/umbrales` (jefe y supervisor). En el drawer de umbrales los interruptores «Notificar por n8n / WhatsApp» y «Mostrar en Modo TV» están **deshabilitados** con la etiqueta «próximamente» (no tienen consumidor en la API ni en `/tv`); sus valores se siguen reenviando en el `PUT`.

Desde la fase 3 (evidencia real), `Umbrales` suma 3 campos que sólo alimentan la validación de calidad (TCI, ver sección **evidence**): `tciToleranciaMin` (± minutos al comparar horas contra sensores, por defecto 5), `tciToleranciaPct` (± % en cantidades kg y velocidades u/min, por defecto 5) y `tciToleranciaDiasSap` (± días entre la merma y su transferencia SAP, por defecto 1). Se editan en Configuración › Umbrales de alerta › sección «Validación de calidad (TCI)» (`UmbralesTab.tsx`); el drawer de alertas (`UmbralesDrawer.tsx`) no expone estos 3 campos pero los reenvía tal cual en cada `PUT` para no perderlos.

**Tipos:** `parada_prevista` · `merma_prevista` · `velocidad_baja` · `oee_bajo`.
**Severidades:** `critica` · `alta` · `media`. **Estados:** `activa` · `atendida` · `vencida` · `confirmada` · `descartada`.

---

## analytics

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/analitica/resumen` | GET | — | `AnaliticaResumen { modelo, kpis { ep, epConfirmadas, precision, recall, alertas30d }, insights, riesgoPorLinea, prediccionesActivas }` — con `epConfirmadas = 0` la EP se muestra «—»; `riesgoPorLinea` sólo puntúa líneas activas **con historial** (al menos una orden) | 401 · 403 |
| `/analitica/patrones` | GET | `periodo?`, `lineaId[]`, `variable?` | `Patrones { heatmap (causa × turno, minutos), recurrencias }` | 401 |
| `/analitica/predicciones` | GET | — | `Predicciones { serie (predicho vs real 30 d), historico }` | 401 |
| `/analitica/modelo` | GET | — | `Modelo { fasesCrispDm[6], metricas, versiones, variablesEntrada }` | 401 |
| `/analitica/estado-datos` | GET | `estado?=suficiente\|insuficiente` | `EstadoDatos { suficiente, eventos, requeridos, progresoPct, estimacion }`. Sin query devuelve el estado calculado (la planta sembrada tiene 2 140 eventos → `suficiente`); con `estado` se fuerza la variante para revisar el estado vacío de 08.E | 401 |
| `/analitica/reentrenar` | POST | — | `ReentrenamientoJob` (202) | 403 solo `jefe`/`investigador` |
| `/analitica/reentrenar/continuo` | POST | — | 202 | 403 solo `jefe`/`investigador` |
| `/analitica/modelo/diagnostico` | GET | — | Matriz de confusión, corte temporal y perfil del corpus | 403 solo `jefe`/`investigador` |
| `/analitica/dataset/exportar` | GET | — | CSV del feature store (línea × fecha × turno × modo) | 403 solo `investigador` |
| `/analitica/predicciones/recalcular` | POST | — | 200 — fuerza un ciclo de inferencia sin esperar al cron de 15 min | 403 solo `jefe`/`investigador` |
| `/analitica/modelo/:version/activar` | POST | — | `Modelo` con la versión marcada `vigente` | 403 solo `jefe`/`investigador` · 404 versión inexistente |

Todo `/analitica/*` lleva `@Roles(...ROLES_VER_ANALITICA)` a nivel de clase (`jefe`, `supervisor`, `investigador`; 403 al resto) y las acciones sobre el modelo se restringen más por handler (ver **Permisos por rol**). `GET /analitica/estado-datos?estado=` sólo fuerza la variante fuera de producción: con `NODE_ENV=production` el parámetro se ignora y se devuelve el estado calculado.

---

## evidence

Desde la fase 3 (rama `feat/evidencia-real`, 4-sep-2026) el módulo Evidencia dejó de sembrar datos hipotéticos de
**postest**: los 5 instrumentos (Anexos 02–06) arrancan vacíos y se llenan con el uso real del sistema. Sólo se
conserva el **pretest** del TRI (línea base medida a mano). Ver la nota **"Postest vacío por diseño"** al final de
esta sección.

### Endpoints

| Endpoint | Método | Roles | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- | --- |
| `/evidencia/resumen` | GET | `jefe`, `investigador`, **`supervisor`, `calidad`** | — | `EvidenciaResumen { pretestDesde…postestHasta, kpis: KpiTesis[5], comparativaTri }` | 401 |
| `/evidencia/tri` | GET | `jefe`, `investigador` | — | `EvidenciaTRI { postest, pretest, promedioPostest, promedioPretest, reduccionPct, meta, estado, descartadosPostest }` — `descartadosPostest` = filas con fecha imposible o tiempo fuera de `1 … 3600` s, que no entran en el promedio | 401 · 403 |
| `/evidencia/tri/pretest` | POST | `jefe`, `investigador` | `CargarPretestDto { registros: [{ fecha, eventoRegistrado, horaInicioRegistro, tiempoMin, observacion? }] }` | `{ data: RegistroTRI[], promedioPretest }` (201) — reemplaza la línea base en **una transacción** (si una fila falla, se conserva la anterior) | 422 lista vacía / fecha inexistente en el calendario / hora fuera de 00:00–23:59 |
| `/evidencia/fuentes` | GET | `jefe`, `investigador` | — | `FuenteExternaResumen[]` (las 3 fuentes: filas acumuladas, última importación, periodo) | 401 |
| `/evidencia/fuentes/:tipo/plantilla` | GET | `jefe`, `investigador` | `tipo` = `sensores\|solicitudes\|sap_mermas` | XLSX (`StreamableFile`): hoja de datos + hoja «Instrucciones» | 404 tipo no reconocido |
| `/evidencia/fuentes/:tipo/importar` | POST | `jefe`, `investigador` | multipart: `archivo` (xlsx/csv ≤ 5 MB), `mapeo?` (JSON texto `{columnaEsperada: cabeceraDelArchivo}`) | `ImportacionResultado { id, tipo, archivo, filasOk, filasRechazadas, filasDuplicadas, filasConflicto, rechazos[], periodo? }` (201) — todo o nada, en una transacción | 422 sin archivo / archivo vacío, dañado o no `.xlsx` válido / sin filas / `mapeo` no es JSON objeto · **413** archivo > 5 MB (`VALIDATION_ERROR`, `details.archivo`) · 404 tipo no reconocido |
| `/evidencia/fuentes/:tipo/importaciones` | GET | `jefe`, `investigador` | `tipo` | `ImportacionResumen[]` (historial, más reciente primero) | 404 tipo no reconocido |
| `/evidencia/tci/validar` | POST | `jefe`, `investigador` | `ValidarTciDto { desde?, hasta?, tipos? }` — sin rango usa desde la primera captura del postest hasta hoy; sin `tipos`, los 3 | `EvidenciaTCI` (200) — **reemplaza** las evaluaciones del rango | 422 fechas fuera de `YYYY-MM-DD` o inexistentes / `desde > hasta` / tipo no reconocido (`tipos` repetible o separado por comas) |
| `/evidencia/tci` | GET | `jefe`, `investigador` | `TciQueryDto extends PaginationDto { tipo?, resultado? ('valido'\|'invalido'), desde?, hasta? }` | `ListadoTCI { data: EvaluacionTCI[], meta, resumen: ResumenTCI }` | 401 |
| `/evidencia/tci/resumen` | GET | `jefe`, `investigador` | — | `ResumenTCI` (cabecera sin el detalle fila a fila: totales, `porTipo`, `ultimaValidacion`, `fuentes`) | 401 |
| `/evidencia/tci/:id` | PATCH | `jefe`, `investigador` (**ya no `calidad`**) | `OverrideTciDto { overrides?: {clave: boolean\|null}, observacion? }` — `null` devuelve el criterio a la regla | `EvaluacionTCI` recalculada (con `cumpleRegla` por criterio) | 403 · 404 · 422 clave de criterio no reconocida **o que no evalúa el tipo del registro** / observación > 300 car. |
| `/evidencia/tsp` | GET | `jefe`, `investigador` | — | `EvidenciaTSP { items[8], invitaciones, respuestas, invitados, promedio, pctAcuerdo, meta, estado, enlace }` | 401 |
| `/evidencia/tsp/invitaciones` | POST | `jefe`, `investigador` | `CrearInvitacionDto { usuarioId }` — `invitado`/`rol` se derivan del usuario | `InvitacionTSP { token, usuarioId, invitado, rol?, url, respondida: false, creadaEn }` (201) — token aleatorio de 128 bits; altas serializadas (dos envíos simultáneos no crean dos invitaciones) | 422 `usuarioId` vacío, inexistente o inactivo · 409 el usuario ya tiene invitación |
| `/evidencia/cfs` | GET | `jefe`, `investigador` | — | `EvidenciaCFS { items[9], cumplidas, totales, porcentaje, meta, estado }` | 401 |
| `/evidencia/cfs/:id` | PATCH | `jefe`, `investigador` | `VerificacionCfsDto { cumple?, observacion? (≤300 car.) }` — al menos uno; `cumple` verifica (sella `verificadaEn`); sólo `observacion` guarda la nota **sin** verificar; omitir `observacion` conserva la anterior | `{ item: VerificacionCFS, resumen: EvidenciaCFS }` | 403 · 404 · 422 sin `cumple` ni `observacion` |
| `/evidencia/ep` | GET | `jefe`, `investigador` | — | `EvidenciaEP { registros, prediccionesCorrectas, prediccionesTotales, porcentaje, meta, estado }` | 401 |
| `/evidencia/exportar` | POST | `jefe`, `investigador` | `ExportEvidenciaDto { kpis[] (≥1 de TRI\|TCI\|TSP\|CFS\|EP), formato? (xlsx\|csv\|pdf, def. xlsx), destino? (spss\|informe, def. spss) }` | `{ id, estado: 'generando' }` (202) — XLSX con una hoja por anexo | 422 lista de `kpis` vacía |
| `/encuesta/:token` | GET **público** | — | — | `EncuestaPublica { token, titulo, descripcion, items[8], respondida }` | 404 token inválido |
| `/encuesta/:token` | POST **público** | — | `EncuestaRespuestaDto { respuestas: number[8] (1–5), comentario? (≤500 car.) }` | `{ recibido, respuestas, pctAcuerdo }` (201) — recalcula el TSP; marca el token con un `UPDATE` condicional (dos envíos simultáneos: uno gana, el otro 409) | 404 · 409 token ya usado · 422 respuestas fuera de 1–5 o incompletas |

Desde el QA del 2-oct-2026 **todo** `/evidencia/*` exige `jefe` o `investigador` (`@Roles` a nivel de clase): antes
los `GET` no llevaban `@Roles` y cualquier rol podía leer tokens de encuesta, comentarios y overrides por API directa
(pendiente #1 del QA fase 3). La única excepción es `GET /evidencia/resumen`, abierto también a `supervisor` y
`calidad` porque su Home muestra el KPI TRI (`useResumenJefe`). En el sidebar el módulo sigue visible sólo para
`jefe` e `investigador` (`RoleGate`).

### Modelo `EvaluacionTCI` / `CriterioTCI` (Anexo 03)

```ts
interface EvaluacionTCI {
  id: string;
  n: number;
  fecha: string;              // YYYY-MM-DD del registro evaluado
  turno: Turno;                // 'D' | 'N', derivado de la hora del registro
  tipoRegistro: 'parada' | 'merma' | 'velocidad';
  registroId: string;          // id del registro operativo evaluado
  lineaId: string;
  lineaCodigo: string;
  referencia: string;          // resumen legible: '07:42 · PP-01-10 · 14 min'
  criterios: CriterioTCI[];
  valido: boolean;              // true si TODOS los criterios del tipo se cumplen
  observacion?: string;
  validadoEn: string;           // ISO-8601 de la corrida que produjo esta fila
  overrides?: Partial<Record<ClaveCriterioTci, boolean>>;
}

interface CriterioTCI {
  clave: 'completo' | 'sensor' | 'solicitud' | 'sap';
  label: string;                // 'Campos completos' | 'Coherencia con sensores' | 'N.º de solicitud' | 'Transferencia SAP'
  cumple: boolean;               // resultado efectivo, ya con el override aplicado
  detalle: string;                // explicación legible de la regla (ver ejemplos abajo)
  override?: boolean | null;      // valor forzado a mano desde 09.C; ausente = manda la regla
}
```

`EvidenciaTCI` (cabecera del Anexo 03, `ResumenTCI` = el mismo tipo sin `registros`):

```ts
interface EvidenciaTCI {
  registros: EvaluacionTCI[];
  registrosCorrectos: number;
  registrosTotales: number;
  porcentaje: number | null;      // RC / RT × 100; null sin registros evaluados
  meta: string;                    // '≥ 90 %'
  estado: EstadoKpi;                // 'sin_datos' hasta la primera validación
  porTipo: Record<'parada'|'merma'|'velocidad', { correctos: number; totales: number }>;
  ultimaValidacion?: { fecha: string; desde: string; hasta: string; evaluados: number };
  fuentes: FuenteExternaResumen[]; // estado de las 3 fuentes importadas
}
```

### Reglas de validación por tipo de registro (`evidence.rules.ts`)

Cada criterio es una función pura que recibe el registro operativo y las fuentes ya cargadas y devuelve `{cumple, detalle}`; `valido` = todos los criterios del tipo cumplidos (`esValido` / `esRegistroValidoTci`, compartida con `@mes/shared`). Las tolerancias (`ToleranciasTci { minutos, pct, diasSap }`) vienen de `Umbrales` (ver sección **alerts**, por defecto ±5 min, ±5 %, ±1 día).

| Tipo | Criterios (en orden) |
| --- | --- |
| `parada` | `completo` · `sensor` · `solicitud` |
| `merma` | `completo` · `sap` · `solicitud` |
| `velocidad` | `completo` · `sensor` |

- **`completo`** — todos los campos obligatorios del tipo están presentes (orden, línea, causa, acción tomada, responsable, duración > 0 en parada; equivalentes en merma/velocidad). Detalle: `"Los 6 campos obligatorios están completos"` o, si falta alguno, `"Faltan 2 campos obligatorios: acción tomada, responsable"`.
- **`sensor` en `parada`** — el inicio (y el fin, si existe) de la parada coinciden dentro de `±tolerancia.minutos` con un tramo `PARADA` de las lecturas de sensor de esa línea (los tramos se construyen fusionando lecturas consecutivas del mismo estado). Detalle si cumple: `"Sensor: parada detectada 10:42–10:58, registro 10:44–10:57 (Δ inicio 2 min)"`; si no: agrega `"> 5 min"` o `"Sin lecturas de sensor de LLEN-A1 para el 28/09/2026"` si no hay tramos.
- **`sensor` en `velocidad`** — la velocidad registrada difiere ≤ `tolerancia.pct` de la lectura de velocidad más cercana (`±tolerancia.minutos`) de esa línea. Detalle: `"Sensor 09:10: 132,0 u/min vs 128,4 u/min registradas (Δ 2,7 %)"`, o `"— supera el 5 %"` si falla; `"Sin lecturas de velocidad de LLEN-A1 entre las 09:12 ± 5 min"` sin dato cercano.
- **`solicitud`** — si la causa `requiereSolicitud`, el número debe existir en la importación de solicitudes; si el registro trae un número aunque no lo exija, también se verifica (dato anotado a mano igual debe ser trazable); sólo se da por cumplido sin verificar si la causa no lo exige y el registro no trae número. Detalle: `"La causa PN-02-01 no exige n.º de solicitud"`, `"La causa … exige n.º de solicitud y el registro no lo tiene"`, o `"Solicitud SM-4471 no encontrada en la importación del 02/09"` / `"…porque aún no se importó ninguna solicitud"`.
- **`sap` (sólo `merma`)** — existe una transferencia SAP de la misma línea y producto (código de 7 dígitos vía la orden), con fecha dentro de `±tolerancia.diasSap` y kilos dentro de `±tolerancia.pct`. Detalle: `"SAP: doc 4900012345 12,4 kg (Δ 3,2 %)"`, o el mismo texto con `"vs 15,0 kg registrados (Δ … % > 5 %)"` si falla, o `"Sin transferencia SAP del producto 1120002 en LLEN-A1 para el 28/09/2026 (± 1 día)"` sin candidata, o `"La orden de la merma no tiene producto con código SAP"` si el producto no resuelve.

**Overrides** (`PATCH /evidencia/tci/:id`): fuerzan `cumple` de un criterio a `true`/`false` (o `null` para devolverlo a la regla), anteponen `"Override manual (válido/inválido) · "` al detalle original y quedan en `overrides` + `observacion` de la fila. `RevisarEvaluacionDrawer.tsx` en el frontend expone un switch por criterio y exige la justificación.

### Fuentes externas — plantillas de importación

No hay integración en vivo con sensores ni con SAP: se descarga una plantilla XLSX (generada con `exceljs`, hoja de
datos con 3 filas de ejemplo + hoja «Instrucciones»; en modo mock se genera en el navegador con `xlsx`/SheetJS), se
llena con lo que exporta el sistema de origen y se vuelve a subir. Cada importación **acumula** filas (no
reemplaza) y queda registrada (`ImportacionFuente`: quién, cuándo, archivo, filas ok/rechazadas/duplicadas, periodo
cubierto).

| Plantilla | Columnas (`COLUMNAS_FUENTE`) | Notas |
| --- | --- | --- |
| `plantilla-sensores.xlsx` | `linea`, `fecha_hora`, `estado`, `velocidad_unid_min` | `linea` = código del maestro (`LLEN-M2`, `EXTR-2`…); `estado` = `PRODUCIENDO` \| `PARADA`; `velocidad_unid_min` opcional. Cada lectura abre un tramo que dura hasta la siguiente lectura de la misma línea. |
| `plantilla-solicitudes.xlsx` | `numero_solicitud`, `fecha`, `linea`, `tipo`, `estado`, `descripcion` | `numero_solicitud` único (clave natural); `linea` opcional; `tipo` = `MANTENIMIENTO`\|`MERMA`\|`OTRO` (def. `MANTENIMIENTO`); `estado` = `ABIERTA`\|`ATENDIDA`\|`CERRADA` (def. `ABIERTA`). |
| `plantilla-transferencias-sap.xlsx` | `documento`, `fecha`, `linea`, `codigo_producto`, `cantidad_kg`, `tipo_merma`, `motivo` | `documento` único; `codigo_producto` debe existir en el maestro de productos (7 dígitos); `cantidad_kg` > 0; `tipo_merma` opcional `MP`\|`EP`\|`PT`. |

**Formatos aceptados** (lectura tolerante, `tabla.util.ts`):
- **Cabeceras**: normalizadas sin tildes/mayúsculas/espacios (`"Fecha / Hora"` → `fecha_hora`); el `mapeo` opcional del multipart permite corregir columnas con otro nombre en el archivo (`{"fecha_hora":"Timestamp"}`).
- **Archivo**: `.xlsx` (primera hoja) o `.csv` (separador `,`/`;`/tab autodetectado, RFC 4180 con comillas), ≤ 5 MB (413 por encima); un archivo vacío o un ZIP/PDF renombrado es 422 «El archivo está dañado o no es un Excel (.xlsx) válido».
- **Fechas**: `Date` de Excel, serie numérica de Excel, ISO `2026-08-28T10:42` / `2026-08-28`, o latina `28/09/2026 10:42`, `28-09-26`, con sufijo `AM`/`PM`/`a. m.`/`p. m.`. Son **hora de pared** de planta, sin zona, independientes de la TZ del proceso; una fecha u hora inexistente (`31/02/2026`, `25:70`) se rechaza en vez de «correr» al día siguiente.
- **Números**: coma o punto decimal, con o sin separador de miles (`1 234,5` → `1234.5`).
- **Deduplicación**: clave natural por tipo — sensores `lineaId|fechaHora`, solicitudes `SOL|numero` (mayúsculas), SAP `SAP|documento` (mayúsculas); una fila con la misma clave **y los mismos datos** que otra ya importada (misma importación o una anterior) se cuenta en `filasDuplicadas` y se ignora sin ser un error; si la clave coincide pero **los datos difieren**, la fila se rechaza con `conflicto: true` (cuenta en `filasConflicto` y en `filasRechazadas`) en vez de descartarse en silencio.
- **Motivos de rechazo** (`RechazoFila { fila, motivo }`, `fila` = número de fila del archivo, 1 = cabecera): campo obligatorio faltante (`"Falta el código de línea"`, `"Falta el n.º de solicitud"`, `"Falta el n.º de documento SAP"`, `"Falta el código de producto"`), fecha/hora no reconocida (`"Fecha/hora inválida: «…»"`), número no reconocido o fuera de rango (`"La cantidad «…» no es un número"`, `"La cantidad en kg debe ser mayor que 0"`), referencia inexistente en el maestro (`"La línea «…» no existe en el maestro"`, `"El producto «…» no existe en el maestro"`), o valor fuera del enum esperado (`"Estado «…» fuera de PRODUCIENDO | PARADA"`, y equivalentes para `tipo`/`estado` de solicitud y `tipo_merma`).

### TSP — invitaciones + encuesta pública (Anexo 04)

1. `POST /evidencia/tsp/invitaciones { usuarioId }` crea una invitación nominal a un **usuario del MES** (`GET /usuarios`) con un **token de un solo uso**; `invitado` y `rol` se copian de la cuenta (`nombre`, `ROLE_LABEL[rol]`) y devuelve `{ token, url }` (`url` = enlace público completo, `http://localhost:3000/encuesta/tsp-2026-01`). 422 si el usuario no existe o está inactivo; 409 si ya tiene una invitación (pendiente o respondida). `NuevaInvitacionModal.tsx` elige el usuario en un `Select` (activos, excluye a los ya invitados) y ofrece copiar el enlace.
2. El enlace se comparte fuera del sistema (WhatsApp, papel); `/encuesta/:token` es pública (`@Public()`, sin JWT).
3. `GET /encuesta/:token` sirve la ficha (8 ítems, sin exponer si ya fue respondida más que con el flag `respondida`); `POST /encuesta/:token { respuestas: number[8], comentario? }` guarda las respuestas (409 si el token ya se usó) y **recalcula el TSP** de inmediato.
4. `GET /evidencia/tsp` agrega: `invitaciones` (con `respondida`/`respondidaEn`), `respuestas`, `invitados`, `promedio` Likert global (`null` sin respuestas) y `pctAcuerdo` (`PO/PT × 100`, % de respuestas 4 o 5).

No hay seeds de invitaciones ni respuestas: el Anexo 04 arranca vacío y cada fila la crea el investigador desde la web.

### CFS editable (Anexo 05)

Seed inicial: 9 funcionalidades (`RF1`…`RF9`) con `cumple: false`, `observacion: ''`, sin verificar (`verificadaEn: null`). `PATCH /evidencia/cfs/:id { cumple, observacion? }` marca cada una desde la web (checklist de `CfsTab.tsx`), le sella `verificadaEn` (ISO-8601) y devuelve el ítem actualizado más el resumen recalculado; no hay automatización — el investigador o calidad la marca a mano viendo la pantalla que evidencia el requisito (`ruta`). `verificadaEn` distingue «verificada y no cumple» (`cumple: false` con fecha) de «sin verificar» (`cumple: false` sin fecha, el estado inicial): `EvidenciaCFS.verificadas` cuenta las funcionalidades ya revisadas y `porcentaje` es `null` (`estado: 'sin_datos'`) mientras `verificadas === 0`, igual que los demás KPI de la fase 3.

### EP desde alertas (Anexo 06)

Sin seed de `registro_ep`: un registro se crea automáticamente al **confirmar una alerta** (`POST /alertas/:id/confirmar` o `/alertas/confirmar-lote`, ver sección **alerts**), tanto si acertó como si no. `GET /evidencia/ep` agrega `prediccionesCorrectas/prediccionesTotales` y el `porcentaje` (`PCC/PTG × 100`, `null` sin ninguna confirmación).

**Seeds de alertas coherentes con el EP (QA 2-oct-2026).** El seed ya no deja alertas con resultado sin su fila del Anexo 06: las alertas `atendida` llevan `acierto: null` (pendientes de confirmar) y las que venían `confirmada` sin fila EP pasan a **`vencida` con `acierto: null`**. Así el EP arranca en «sin datos» (`porcentaje: null`, `estado: 'sin_datos'`, `epConfirmadas: 0` en `/alertas/resumen` y `/analitica/resumen`) y sólo se mueve con confirmaciones reales; esas alertas aparecen en `GET /alertas?pendientes=true` para confirmarlas.

### Postest vacío por diseño

Desde el 4-sep-2026 el seed de tesis (`thesis-evidence.seed.ts`) **no** siembra postest: los 5 KPIs arrancan en
`estado: 'sin_datos'` y `valor: null` hasta que exista al menos una muestra real (una captura con `tiempoRegistroSeg`,
una validación TCI, una respuesta de encuesta, un ítem CFS marcado, una alerta confirmada). `comparativaTri` devuelve
la barra de `Postest` con `minutos: null`. Sólo se conserva el **pretest** del TRI: 10 registros medidos a mano
(`fechaMenos`, 24-ago→21-sep-2026), promedio **2,9 min**, cargado por `ThesisEvidenceSeeder` y editable desde la web
con `POST /evidencia/tri/pretest`.

Los valores **TRI 1,4 min / TCI 93,3 % (28/30) / TSP 84,2 % (128/152) / CFS 100 % (9/9) / EP 83,5 % (137/164)** que
documentaban versiones anteriores de este archivo eran **valores de la fase 1 (seed hipotético, retirado el
4-sep-2026)**: un postest sintético que nunca vino de uso real del sistema. Con la fase 3 el postest se llena desde
la web con datos reales — TRI automático desde cada captura (evento `evidence.tri.registro`), TCI validando contra
las 3 fuentes externas importadas, TSP desde la encuesta pública, CFS marcado a mano por el investigador, EP desde
las alertas confirmadas — y no tiene un valor fijo que documentar aquí hasta que la planta lo genere.

Los seeds de tesis restantes (paradas, mermas, velocidades operativas fuera del Anexo 02) siguen **redistribuyendo
entre las 9 líneas × 2 turnos** sin añadir ni quitar registros: eso no cambió con la fase 3.

---

## Notas de implementación del mock

- **`/ordenes/resumen.todas` devuelve 1 248** (total histórico del repositorio, spec 05.A) mientras que `meta.total` de `/ordenes` refleja las órdenes cargadas en el dataset. La UI debe usar `resumen` para las summary cards y el subtítulo del header, y `meta` para el pie de la tabla.
- `porValidar`, `conParadas`, `conMermas` sí se calculan sobre el dataset sembrado.
- El Home (spec 02.C) ya no muestra un TRI fijo: `homeKpisSecundarios` en el mock sólo trae `merma` y `paradas_no_programadas`; el TRI del Home se compone desde `GET /evidencia/resumen` (`useResumenJefe`) y es `null` mientras no haya capturas postest reales — un valor fijo ahí volvería a ser información hipotética de postest.
- La orden de ejemplo `OF-2026-0815` sigue viva en el seed histórico; tras la migración de maestros su maquinista real de referencia es Jorge Quispe (`USR-02`, `LIN-EXTR-2`) en vez del antiguo "L2 Conos".
- **Mocks alineados con la API del QA 2-oct-2026** (`apps/web/src/mocks/handlers`): `ordenes-sap` (listado y sincronizar), alta de orden desde `ordenSapId`, `planSap` en el detalle, `pendientes` y `epConfirmadas` en alertas, `version` y 409 de concurrencia en catálogos y umbrales, matrices de roles de captura/alertas/evidencia y el directorio reducido de usuarios.
- **Web.** Los selectores de usuarios de órdenes (maquinista, supervisor) piden `GET /usuarios?activo=true`; la etiqueta de riesgo de Tiempo real usa `AlertaLinea.tipo`; «Configurar umbrales» se oculta a quien no puede hacer `PUT /alertas/umbrales`; los interruptores n8n/TV del drawer de umbrales quedan deshabilitados («próximamente»); en producción las rutas `/dev` sólo se sirven con `NEXT_PUBLIC_HABILITAR_DEV=true`.

Resumen de la ronda de QA que introdujo estos contratos: [`qa-2026-10-02.md`](./qa-2026-10-02.md).
