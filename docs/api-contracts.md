# Contratos de API — MES Yamboly

Prefijo de todos los endpoints: **`/api/v1`** (`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`).
Tipos compartidos: `@mes/types` (`packages/types/src`). Mocks msw equivalentes: `apps/web/src/mocks/handlers`.

## Convenciones

| Tema | Regla |
| --- | --- |
| Colecciones paginadas | `{ data: T[], meta: { page, pageSize, total, totalPages } }` (`Paginated<T>`) |
| Colecciones no paginadas | `{ data: T[] }` (catálogos, subrecursos de una orden) |
| Errores | `{ statusCode, code, message, details? }` (`ApiError`) |
| Códigos de error | `VALIDATION_ERROR` 422 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `BUSINESS_RULE` 422 · `INTERNAL_ERROR` 500 |
| Detalle de validación | `details` es un mapa **campo → mensaje** (`{ "cantidadKg": "La cantidad debe ser mayor que 0" }`); las vistas lo pintan bajo cada campo con `aplicarErroresApi` |
| `BUSINESS_RULE` vs `VALIDATION_ERROR` | Ambos son 422; `VALIDATION_ERROR` es un dato de entrada inválido (formato, rango, referencia inexistente), `BUSINESS_RULE` es una regla de negocio incumplida con datos por lo demás válidos (p. ej. un jefe intentando desactivar su propia cuenta) |
| POST de acción | Los `POST` que **no crean** un recurso (atender/descartar/confirmar una alerta, activar una versión, finalizar, cambiar estado, restablecer contraseña) responden **200**; sólo las altas reales responden 201 y los trabajos encolados 202 |
| Autenticación | `Authorization: Bearer <accessToken>` en todo salvo `POST /auth/login` y `/encuesta/:token` |
| Paginación | `?page=1&pageSize=25` (máx. 200) |
| Filtros múltiples | clave repetida (`?lineaId=LIN-LLEN-M2&lineaId=LIN-LLEN-A1`) o separada por comas |
| Periodos | `?periodo=hoy\|semana\|mes\|trimestre\|personalizado`; con `personalizado` se envían `desde`/`hasta` (`YYYY-MM-DD`) |
| Fechas | ISO-8601: `YYYY-MM-DD` para fechas, `YYYY-MM-DDTHH:mm:ss` para marcas de tiempo |
| Errores simulables (solo mock) | `?__error=500\|401\|403\|404\|409\|422\|empty` o cabecera `x-mock-error` |
| Baja lógica | Nunca hay borrado físico con histórico: `DELETE` marca el registro `inactivo` (catálogos) o `baja` (máquinas) y responde `BajaLogicaResponse` (ver sección **catalogs**) |

---

## Datos maestros reales

Desde la rama `feat/maestros-reales` los catálogos de planta ya no son datos de ejemplo: son el maestro real de Yamboly, extraído de un **dump de Postgres (formato custom `pg_dump`, sistema Strapi v5) del sistema anterior**.

- **Script de extracción**: `apps/api/scripts/extraer-maestros.mjs` — lee el dump con `pg_restore -a -t <tabla> -f -` (requiere el binario `pg_restore` de **libpq**, p. ej. `/opt/homebrew/opt/libpq/bin/pg_restore` en macOS/Homebrew) y escribe JSON commiteable en `apps/api/src/database/seeds/data/real/*.json`. Es una tarea de un solo uso: los JSON generados **no se regeneran en runtime**, se versionan y los consume el seeder al arrancar la API.
- **Tablas leídas**: `lineas`, `sedes`, `sabores`, `productos`, `producto_lineas` (+ tablas de enlace `_lnk`), `tipo_paradas`, `categoria_generals`, `categoria_especificas`, `merma_tipo_produccions`, `merma_clasificacions`, `merma_causas`.
- **Máquinas (equipos de línea)** son la única entidad **curada a mano** (no viene de una tabla del dump): 33 registros en `apps/api/src/database/seeds/data/catalogs.ts` (`maquinas`), 2–4 equipos reales por línea (envolvedora, codificadora, dosificadora, túnel de frío, tapadora, faja transportadora, descargador, pinzas…).

### Conteos del maestro real

| Catálogo | Cantidad |
| --- | --- |
| Sedes | 9 |
| Líneas | 9 (4 llenadoras · 2 extrusoras · 3 moldeadoras) |
| Sabores | 41 |
| Productos | 201 |
| Velocidades estándar (pares producto × línea) | 333 |
| Máquinas (equipos de línea) | 33 |
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
| Máquina | `MAQ-<secuencial 2 dígitos>` | `MAQ-01` |
| Sede | `SED-<CIUDAD>` | `SED-LIMA` |
| Sabor | `SAB-<codigo 7 dígitos>` | `SAB-2110124` |
| Usuario | `USR-<secuencial 2 dígitos>` | `USR-01` |

> Los códigos legibles (`codigo`) siguen el patrón corto del maestro real: líneas `LLEN-M2` / `EXTR-2` / `MOLD-A3`, causas de parada y de merma `PN-02-01` / `MP-01-01` (los tipos raíz usan prefijos `PP`, `PN`, `PS` para parada y `MP` para merma, según el maestro original), máquinas `MQ-LLENM2-01`, sedes `LIMA`/`AREQ`/`CUZC` (3–4 letras mayúsculas).

---

## auth

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/auth/login` | POST | `LoginRequest { email, password, recordarme? }` — `email` acepta correo o DNI | `LoginResponse { accessToken, user }` | 401 credenciales inválidas · 422 validación |
| `/auth/me` | GET | — | `User` (incluye `ultimoAcceso`, sellado en cada login) | 401 sin token o token inválido |
| `/auth/logout` | POST | — | `204 No Content` | 401 |

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

### Turnos

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/turnos` | GET | — | `{ data: TurnoDef[] }` — `D` Día 06:00–18:00 y `N` Noche 18:00–06:00 | 401 |

### Sedes

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/sedes` | GET | — | `{ data: Sede[] }` — 9 sedes reales | 401 |
| `/sedes` | POST | `CreateSede { codigo, nombre, ciudad, activa? }` — `codigo` 3–4 letras mayúsculas | `Sede` (201) | 403 solo `jefe` · 409 código duplicado · 422 |
| `/sedes/:id` | PATCH | `Partial<CreateSede>` | `Sede` | 403 solo `jefe` · 404 · 409 |

### Sabores

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/sabores` | GET | `estado?` | `{ data: Sabor[] }` — 41 sabores reales, sin FK con producto (`Producto.saborId` es informativo) | 401 |

### Líneas

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/lineas` | GET | `sedeId?`, `tipoProceso?` (`llenadora\|extrusora\|moldeadora`), `estado?` | `{ data: Linea[] }` — 9 líneas reales (máquinas físicas): 4 llenadoras (`LLEN-M2`, `LLEN-M1`, `LLEN-A1`, `LLEN-A2`), 2 extrusoras (`EXTR-2`, `EXTR-3`), 3 moldeadoras (`MOLD-A2`, `MOLD-A3`, `MOLD-A4`) | 401 |

No hay mantenedor CRUD de líneas todavía (alta/edición futura; hoy solo lectura en la UI).

### Productos

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/productos` | GET | `lineaId?` (solo productos con par producto × línea **activo** en esa línea), `search?` (código, nombre o descripción), `estado?` | `{ data: Producto[] }` — 201 productos reales, código de 7 dígitos. **`Producto` ya no lleva `lineaId` ni `velocidadEstandar`**: viven en el par (`VelocidadEstandar`) | 401 |
| `/productos` | POST | `CreateProducto { codigo, descripcionLarga, descripcionCorta, nombre, alias?, marca?, presentacion?, unidadesPorCaja?, pesoKg, saborId?, sabor?, estado? }` | `Producto` (201) | 403 (`jefe`/`supervisor`) · 409 código duplicado · 422 |
| `/productos/:id` | PATCH | `Partial<CreateProducto>` | `Producto` | 403 · 404 · 409 |
| `/productos/:id` | DELETE | — | `BajaLogicaResponse` (`etiquetaConservados: 'órdenes'`) — baja lógica, el producto pasa a `inactivo` y conserva sus órdenes | 403 (solo `jefe`) · 404 |

### Velocidades estándar (par producto × línea)

La velocidad estándar vive en el par `producto × línea` (`VelocidadEstandar`, tabla `producto_linea`), no en el producto. `velocidadUnidHora` es el dato fuente del maestro; `velocidadUnidMin = velocidadUnidHora / 60` (1 decimal) es la que consume el cálculo de OEE y la que se **congela** en `OrdenFabricacion.velocidadEstandar` al iniciar la orden.

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/velocidades-estandar` | GET | `productoId?`, `lineaId?`, `estado?` | `{ data: VelocidadEstandarListItem[] }` — 333 pares, con `productoCodigo`, `productoNombre`, `lineaCodigo`, `lineaNombre`, `tipoProceso` resueltos | 401 |
| `/velocidades-estandar` | POST | `CreateVelocidadEstandar { productoId, lineaId, velocidadUnidHora (1–60 000), mermaEstandarPct?, cipMin?, arranqueMin?, estado? }` — `velocidadUnidMin` **no se envía**, la API la deriva | `VelocidadEstandar` (201) | 403 (`jefe`/`supervisor`) · 409 el par ya existe · 422 producto o línea inexistente |
| `/velocidades-estandar/:id` | PATCH | `Partial<CreateVelocidadEstandar>` — recalcula `velocidadUnidMin` si cambia `velocidadUnidHora` | `VelocidadEstandar` | 403 · 404 · 409 |
| `/velocidades-estandar/:id` | DELETE | — | `BajaLogicaResponse` (`etiquetaConservados: 'órdenes'`) — el par pasa a `inactivo`; las órdenes que lo congelaron conservan su valor | 403 (solo `jefe`) · 404 |

### Máquinas (equipos de línea)

Equipo físico dentro de una línea (envolvedora, codificadora, dosificadora, túnel de frío, tapadora, faja transportadora, descargador, pinzas…), 2–4 por línea. **Obligatoria** en el wizard de registro de parada (`maquinaId`).

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/maquinas` | GET | `lineaId?`, `estado?` (`operativa\|mantenimiento\|baja`) | `{ data: Maquina[] }` — 33 equipos reales, con `paradas30d` | 401 |
| `/maquinas` | POST | `CreateMaquina { codigo, nombre, tipo, lineaId, estado? }` — `codigo` formato `MQ-<línea>-<nn>` | `Maquina` (201) | 403 (`jefe`/`supervisor`) · 409 código duplicado · 422 |
| `/maquinas/:id` | PATCH | `Partial<CreateMaquina>` — edita código, nombre, tipo, línea o estado (mantenedor completo, no solo estado) | `Maquina` | 403 · 404 · 409 |
| `/maquinas/:id` | DELETE | — | `BajaLogicaResponse` (`estado: 'baja'`, `etiquetaConservados: 'paradas'`) — la máquina pasa a `baja` y conserva sus paradas históricas | 403 (`jefe`/`supervisor`) · 404 |

### Causas de parada

Árbol de 3 niveles **Tipo → General → Específica** (mismo patrón `TT-GG-EE` que antes; 5 tipos → 26 generales → 52 específicas = 83 causas). Ahora acepta `codigoLegado`, el código del sistema original (`PNP`, `RUT04`, `FAL02`, `IMP10`…) que se conserva a modo de trazabilidad.

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/causas-parada` | GET | `formato=arbol\|plano` (def. `arbol`), `nivel?` (`tipo\|general\|especifica`), `lineaId?` | `{ data: CausaParadaNodo[] }` (árbol con `hijos[]`) o `{ data: CausaParada[] }` (plano) | 401 |
| `/causas-parada` | POST | `CreateCausaParada { codigo, nombre, nivel, parentId?, clasificacion? (programada\|imprevista), afectaOee?, requiereEvidencia?, requiereSolicitud?, tiempoEstandarMin?, lineasAplicables?, estado?, codigoLegado? }` | `CausaParada` (201) | 403 (`jefe`/`supervisor`) · 409 código duplicado |
| `/causas-parada/:id` | PATCH | `Partial<CreateCausaParada>` (acepta `codigoLegado`) | `CausaParada` | 403 · 404 |
| `/causas-parada/:id` | DELETE | — | `BajaCausaParadaResponseDto` (`BajaLogicaResponse` + `paradasConservadas`, `etiquetaConservados: 'paradas'`) | 403 (`jefe`/`supervisor`) · 404 |

### Causas de merma

Mismo patrón de árbol de 3 niveles que las causas de parada, pero con nomenclatura propia: **Tipo de producción → Clasificación → Causa** (5 tipos → 11 clasificaciones → 40 causas = 56 causas). Los tipos de merma (`MP`/`EP`/`PT`) se marcan por causa en `aplicaA`.

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/causas-merma` | GET | `formato=arbol\|plano` (def. `arbol`), `nivel?` (`tipo\|clasificacion\|causa`), `tipo?` (`MP\|EP\|PT`), `lineaId?` | `{ data: CausaMermaNodo[] }` o `{ data: CausaMerma[] }` | 401 |
| `/causas-merma` | POST | `CreateCausaMerma { codigo, nombre, nivel, parentId?, aplicaA?, lineasAplicables?, requiereEvidencia?, requiereComentario?, requiereSolicitud?, estado? }` — `codigo` formato `MP-01`, `MP-01-A` o `MP-01-01` | `CausaMerma` (201) | 403 (`jefe`/`supervisor`) · 409 código duplicado · 422 formato |
| `/causas-merma/:id` | PATCH | `Partial<CreateCausaMerma>` | `CausaMerma` | 403 · 404 |
| `/causas-merma/:id` | DELETE | — | `BajaLogicaResponse` (`etiquetaConservados: 'mermas'`) — las mermas sembradas siguen referenciando la causa dada de baja | 403 (`jefe`/`supervisor`) · 404 |

### Usuarios y colaboradores

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/usuarios` | GET | `rol[]`, `sedeId?`, `lineaId?` (incluye además a los usuarios sin línea: jefe, supervisores, calidad), `activo?` (`true` solo activos, `false` solo inactivos) | `{ data: User[] }` — directorio de personas para los selectores de captura (responsable, maquinista, supervisor). **Sin restricción de rol**: lo consumen tanto Configuración como los wizards | 401 |
| `/usuarios` | POST | `CreateUsuario { nombre, email, dni (8 dígitos), rol, cargo, sedeId, lineaId?, password (≥8) }` | `User` (201, hash bcrypt, iniciales derivadas del nombre) | 403 (solo `jefe`) · 409 correo o DNI duplicado · 422 |
| `/usuarios/:id` | PATCH | `Partial<CreateUsuario>` sin `password` (un `password` en el body se descarta por `whitelist`; usar el endpoint de abajo) | `User` | 403 · 404 · 409 correo o DNI duplicado |
| `/usuarios/:id/estado` | POST | `{ activo: boolean }` | `User` (200) | 403 · 404 · **422 `BUSINESS_RULE`** si el `jefe` intenta desactivar su propia cuenta |
| `/usuarios/:id/restablecer-password` | POST | `{ password: string (≥8) }` | `User` (200, sin `passwordHash`) | 403 (solo `jefe`) · 404 |
| `/colaboradores` | GET | — | `{ data: Colaborador[] }` — cuadrilla del turno del paso "Equipo" de la OF | 401 |

Un usuario `activo: false` no puede iniciar sesión (`401 UNAUTHORIZED` en `/auth/login`).

---

## orders

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/ordenes` | GET | `periodo`, `desde`, `hasta`, `lineaId[]`, `turno[]` (`D\|N`), `estado[]`, `search`, `sort=fecha\|codigo\|oee\|producido`, `orden=asc\|desc`, `page`, `pageSize` | `Paginated<OrdenListItem>` | 401 |
| `/ordenes/resumen` | GET | — | `OrdenesResumen { todas, porValidar, conParadas, conMermas, ultimaSincronizacion }` | 401 |
| `/ordenes/:id` | GET | acepta id (`ORD-0815`) o código (`OF-2026-0815`) | `OrdenListItem` | 404 |
| `/ordenes` | POST | `CreateOrden { codigo, lineaId, productoId, lote, vencimiento, turno (D\|N), planificado, maquinistaId, supervisorId, operarios, colaboradorIds[] }` | `OrdenListItem` (201) | 409 código duplicado · **422 `{ productoId: 'El producto no tiene velocidad estándar en esta línea' }`** si no existe un par producto × línea activo |
| `/ordenes/:id/finalizar` | POST | `FinalizeOrden { producido, conteoCodificadora, evidenciaUrl?, comentario? }` | `OrdenListItem` (estado → `por_validar`) | 404 · 409 ya finalizada · 422 |
| `/ordenes/:id/validar` | POST | `ValidateOrden { produccionRegistrada, paradasConCausa, mermasClasificadas, evidenciaEtiqueta, observacion? }` (los 4 booleanos deben ser `true`) | `OrdenListItem` (estado → `validada`) | 404 · 409 en curso o ya validada · 422 |
| `/ordenes/:id/paradas` | GET | — | `{ data: ParadaListItem[], resumen: { cantidad, minutos, afectanOee } }` | 404 |
| `/ordenes/:id/mermas` | GET | — | `{ data: MermaListItem[], resumen: { cantidad, kg } }` | 404 |
| `/ordenes/:id/velocidades` | GET | — | `{ data: RegistroVelocidadListItem[] }` | 404 |
| `/ordenes/:id/bitacora` | GET | `tipo[]` (`creacion\|edicion\|parada\|merma\|velocidad\|validacion\|sistema`) | `{ data: AuditEvent[] }` desc por fecha | 404 |

**Estados de orden:** `en_curso` · `cerrada` · `por_validar` · `validada` · `incompleta`.

Al crear la orden, la API resuelve el **par activo** producto × línea (`LookupsService.parActivo`) y congela dos campos en la orden: `velocidadEstandar` (u/min, la que alimenta el desempeño del OEE) y `velocidadEstandarId` (el id de `VelocidadEstandar` del que se copió, `null` en órdenes previas a la migración de maestros). Si el par no existe o está `inactivo`, la orden **no puede crearse** (422 sobre `productoId`, ver arriba) porque el OEE quedaría sin referencia de desempeño.

---

## downtimes

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/paradas` | GET | `ordenId?`, `lineaId[]`, `causaId[]` (matchea tanto la causa hoja como su tipo raíz), `desde`, `hasta`, `abiertas=true`, `page`, `pageSize` | `Paginated<ParadaListItem>` | 401 |
| `/paradas` | POST | `CreateParada { ordenId, lineaId, maquinaId, tipoCausaId?, causaId, inicio, accionTomada (≥10 car.), numeroSolicitud?, evidenciaUrl?, afectaOee?, responsableId, origen?, deteccionId?, tiempoRegistroSeg? }` — `maquinaId` **obligatoria** (equipo de la línea); `tipoCausaId` se deduce del árbol si se omite | `ParadaListItem` (201) | 422 `accionTomada` obligatoria (mín. 10 caracteres) · 422 `maquinaId`/`causaId` inexistente · 422 `numeroSolicitud` si la causa lo exige (`requiereSolicitud`) |
| `/paradas/:id` | PATCH | `UpdateParada` (+ `fin?: string \| null`, `motivoEdicion?`) | `ParadaListItem`; el cambio de causa, máquina y hora de fin se escriben en la bitácora. `fin` recalcula `duracionMin`; `fin: null` reabre la parada (spec 05.F) | 404 · 422 |
| `/paradas/:id/finalizar` | POST | `FinalizeParada { fin, comentarioCierre? }` | `ParadaListItem` con `duracionMin` | 404 · 409 ya finalizada |
| `/detecciones-iot` | GET | `estado=sugerida\|confirmada\|descartada` | `{ data: DeteccionIoT[] }` | 401 |
| `/detecciones-iot/:id/confirmar` | POST | `{ causaId, maquinaId, accionTomada, tiempoRegistroSeg? }` | `{ deteccion, parada }` (201) — crea una parada `origen: 'iot'` vinculada a la orden en curso de la línea | 404 · 409 ya procesada · 422 sin orden en curso en la línea |
| `/detecciones-iot/:id/descartar` | POST | — | `DeteccionIoT` (`estado: 'descartada'`) | 404 |

`tiempoRegistroSeg` alimenta el KPI **TRI**: cada parada, merma, orden o velocidad creada emite el evento `TRI_REGISTRO_EVENT` y añade una fila al Anexo 02 (postest).

---

## scrap

Las causas de merma son un árbol de 3 niveles (**tipo de producción → clasificación → causa**); la causa elegida debe ser una **hoja activa** (`nivel: 'causa'`). La API valida la jerarquía completa:

1. La causa (`causaId`) existe, está `activo` y es nivel `causa` (rechaza tipos o clasificaciones intermedias).
2. Si la causa declara `aplicaA` (tipos de merma donde aplica), `tipo` debe estar incluido.
3. `tipoCausaId` y `clasificacionId` son **opcionales**: si no se envían, la API los **deriva** subiendo la cadena de padres de la causa (`cadenaCausaMerma`). Si se envían, deben coincidir con esa cadena o la API responde 422.
4. Si la causa tiene `requiereComentario`, `observacion` es obligatoria; si tiene `requiereSolicitud`, `numeroSolicitud` es obligatorio.

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/mermas` | GET | `ordenId?`, `lineaId[]`, `tipo[]` (`MP\|EP\|PT`), `causaId[]`, `desde`, `hasta`, `page`, `pageSize` | `Paginated<MermaListItem>` | 401 |
| `/mermas` | POST | `CreateMerma { ordenId, lineaId, tipo, cantidadKg (0,01–500), sabor, tipoCausaId?, clasificacionId?, causaId, numeroSolicitud?, responsableId, codigoBalde?, enviarPasteurizacion?, observacion?, tiempoRegistroSeg? }` | `MermaListItem` (201) | 422 `causaId` no existe / no es hoja / dada de baja / no aplica al `tipo` · 422 `tipoCausaId`/`clasificacionId` no coincide con la cadena de la causa · 422 `observacion` u `numeroSolicitud` exigidos por la causa · 422 `cantidadKg` fuera de rango |
| `/mermas/:id` | PATCH | `UpdateMerma` — si cambia `causaId` se revalida el árbol completo con los valores resultantes | `MermaListItem` | 404 · 422 |

`enviarPasteurizacion` se conserva como flag informativo (marca la merma para el flujo histórico de pasteurización), aunque el módulo `/pasteurizacion` ya no forma parte de la navegación.

---

## speeds

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/velocidades` | GET | `ordenId?`, `lineaId[]`, `page`, `pageSize` | `Paginated<RegistroVelocidadListItem>` | 401 |
| `/velocidades` | POST | `CreateVelocidad { ordenId, lineaId, velocidadReal, motivo?, responsableId, tiempoRegistroSeg }` | `RegistroVelocidadListItem` con `desvioPct` calculado contra `OrdenFabricacion.velocidadEstandar` (201) | 422 velocidad ≤ 0 |

---

## realtime

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/tiempo-real/lineas` | GET | `sedeId?` (**def. `SED-LIMA`**), `lineaId[]`, `estado[]` (`produciendo\|parada\|sin_orden\|alerta\|sugerida`) | `TiempoRealResumen { actualizadoEn, turno, turnoLabel, turnoRango, sedeId, lineas: LineaEstado[] }` — una fila por cada línea de la sede (9 en `SED-LIMA`) | 401 |
| `/tiempo-real/lineas/:id/timeline` | GET | — | `LineaTimeline { lineaId, lineaCodigo, lineaNombre, ordenCodigo?, eventos: TimelineEvento[] }` | 404 |
| `/tiempo-real/tv` | GET | — | `TvResumen { actualizadoEn, turnoLabel, filas: TvRow[] }` — 9 filas, una por línea | 401 |
| `/tiempo-real/stream` | GET (SSE) | `token?` | `text/event-stream`, eventos `estado` con `RealtimeStreamEvent` cada 5 s. `EventSource` no admite cabeceras: **sólo esta ruta** acepta el JWT por query (`?token=…`); cualquier otra lo ignora | 401 |

**Día operativo:** el estado de cada línea se calcula sobre las órdenes de un "día operativo" (`diaOperativo(ordenes)`), no sobre la fecha real del reloj del servidor. Esto evita que las líneas caigan en `sin_orden` cuando el `HOY` fijo de los datos sembrados queda desalineado con la fecha actual: el servicio toma como "hoy" la fecha más reciente con una orden `en_curso` (o, si no hay ninguna, la fecha más reciente del dataset).

**Prioridad de estado de línea:** parada abierta → detección IoT sugerida → sin orden en curso → alerta activa → produciendo.

---

## reports

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/reportes/indicadores` | GET | `periodo`, `desde`, `hasta`, `lineaId[]`, `turno[]`, `comparar=periodo_anterior\|anio_anterior` | `IndicadoresResumen { kpis, tendenciaOee, oeePorLinea, comparativaTurno }` | 401 |
| `/reportes/paradas` | GET | idem | `ParadasResumen { kpis, pareto, donut, detallePorCausa }` | 401 |
| `/reportes/mermas` | GET | idem | `MermasResumen { kpis, apiladasPorLinea, heatmap, tabla }` | 401 |
| `/reportes/exportar` | POST | `ExportRequest { datasets[], formato (xlsx\|csv\|pdf), desde, hasta, lineaId? }` | `ExportJob` `estado: 'generando'` (202) | 422 sin datasets |
| `/reportes/exportaciones` | GET | — | `{ data: ExportJob[] }` (historial, `listo` / `generando`). `url` es la ruta **relativa al prefijo del API** (`/reportes/exportaciones/:id/descargar`) y sólo aparece si el archivo se puede servir | 401 |
| `/reportes/exportaciones/:id/descargar` | GET | — | binario (`Content-Disposition: attachment`). Requiere `Authorization`, así que el frontend lo pide con `fetch` y lo guarda desde un blob (`descargarArchivo`), no con `<a download>` | 404 sin archivo |

Datasets válidos: `ordenes`, `paradas`, `mermas`, `velocidades`, `indicadores`, `alertas`, `evidencia`.

---

## alerts

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/alertas` | GET | `tipo[]`, `severidad[]`, `lineaId[]`, `estado[]`, `search`, `desde`, `hasta`, `page`, `pageSize` | `Paginated<Alerta>` | 401 |
| `/alertas/resumen` | GET | — | `AlertasResumen { activas, atendidasHoy, pendientesConfirmar, vencidas, epAcumulada }` | 401 |
| `/alertas/recientes` | GET | `limit` (def. 3) | `{ data: Alerta[] }` — popover de la campana (07.E) | 401 |
| `/alertas/:id` | GET | — | `Alerta` con `factores[]` | 404 |
| `/alertas/:id/atender` | POST | `AtenderAlerta { accionTomada }` (mín. 10 caracteres) | `{ alerta, resumen }` | 404 · 409 ya confirmada · 422 |
| `/alertas/:id/descartar` | POST | `DescartarAlerta { motivo }` | `{ alerta, resumen }` | 404 · 422 |
| `/alertas/:id/confirmar` | POST | `ConfirmarEvento { ocurrio, observacion? }` | `{ alerta, resumen, ep: number }` — `ep` es la EP acumulada en % | 404 · 409 ya confirmada · 422 |
| `/alertas/confirmar-lote` | POST | `{ confirmaciones: [{ alertaId, ocurrio, observacion? }] }` | `{ data: Alerta[], resumen, ep: number }` | 422 lista vacía |
| `/alertas/umbrales` | GET | — | `Umbrales` | 401 |
| `/alertas/umbrales` | PUT | `Umbrales { velocidadBajoEstandarPct, oeeMinimo, probabilidadMinima, notificarN8n, mostrarTv }` | `Umbrales` | 403 solo `jefe` · 422 |

**Tipos:** `parada_prevista` · `merma_prevista` · `velocidad_baja` · `oee_bajo`.
**Severidades:** `critica` · `alta` · `media`. **Estados:** `activa` · `atendida` · `vencida` · `confirmada` · `descartada`.

---

## analytics

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/analitica/resumen` | GET | — | `AnaliticaResumen { modelo, kpis { ep, precision, recall, alertas30d }, insights, riesgoPorLinea, prediccionesActivas }` | 401 |
| `/analitica/patrones` | GET | `periodo?`, `lineaId[]`, `variable?` | `Patrones { heatmap (causa × turno, minutos), recurrencias }` | 401 |
| `/analitica/predicciones` | GET | — | `Predicciones { serie (predicho vs real 30 d), historico }` | 401 |
| `/analitica/modelo` | GET | — | `Modelo { fasesCrispDm[6], metricas, versiones, variablesEntrada }` | 401 |
| `/analitica/estado-datos` | GET | `estado?=suficiente\|insuficiente` | `EstadoDatos { suficiente, eventos, requeridos, progresoPct, estimacion }`. Sin query devuelve el estado calculado (la planta sembrada tiene 2 140 eventos → `suficiente`); con `estado` se fuerza la variante para revisar el estado vacío de 08.E | 401 |
| `/analitica/reentrenar` | POST | — | `ReentrenamientoJob` (202) | 403 solo `jefe`/`investigador` |
| `/analitica/modelo/:version/activar` | POST | — | `Modelo` con la versión marcada `vigente` | 404 versión inexistente |

---

## evidence

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/evidencia/resumen` | GET | — | `EvidenciaResumen { pretestDesde…postestHasta, kpis: KpiTesis[5], comparativaTri }` | 401 |
| `/evidencia/tri` | GET | — | `EvidenciaTRI { postest, pretest, promedioPostest, promedioPretest, reduccionPct, meta, estado }` | 401 |
| `/evidencia/tri/pretest` | POST | `{ registros: [{ fecha, eventoRegistrado, horaInicioRegistro, tiempoMin }] }` (carga de hoja) | `{ data, promedioPretest }` (201) | 422 lista vacía |
| `/evidencia/tci` | GET | — | `EvidenciaTCI { registros, registrosCorrectos, registrosTotales, porcentaje, meta, estado }` | 401 |
| `/evidencia/tsp` | GET | — | `EncuestaTSP { items[8], respuestas, invitados, promedio, pctAcuerdo, meta, estado, enlace }` | 401 |
| `/evidencia/cfs` | GET | — | `EvidenciaCFS { items[9], cumplidas, totales, porcentaje, meta, estado }` | 401 |
| `/evidencia/cfs/:id` | PATCH | `{ cumple, observacion }` | `{ item, resumen }` | 404 · 422 |
| `/evidencia/ep` | GET | — | `EvidenciaEP { registros, prediccionesCorrectas, prediccionesTotales, porcentaje, meta, estado }` | 401 |
| `/evidencia/exportar` | POST | `ExportEvidencia { kpis[], formato, destino (spss\|informe) }` | `{ id, estado: 'generando' }` (202) | 422 |
| `/encuesta/:token` | GET **público** | — | `EncuestaPublica { token, titulo, descripcion, items[8], respondida }` | 404 token inválido |
| `/encuesta/:token` | POST **público** | `EncuestaRespuesta { token, respuestas: number[8] (1–5), comentario? }` | `{ recibido, respuestas, pctAcuerdo }` (201) — recalcula TSP | 404 · 422 respuestas fuera de rango |

### KPI de la tesis y sus fórmulas

| KPI | Fórmula | Meta | Valor del mock | Anexo |
| --- | --- | --- | --- | --- |
| TRI | `ΣTR / n` | reducción ≥ 40 % vs pretest | 1,4 min (−51,7 % vs 2,9 min) | 02 |
| TCI | `RC / RT × 100` | ≥ 90 % | 93,3 % (28/30) | 03 |
| TSP | `PO / PT × 100` | ≥ 80 % de acuerdo | 84,2 % (128/152, 19 respuestas) | 04 |
| CFS | `FV / FT × 100` | 9 / 9 | 100 % | 05 |
| EP | `PCC / PTG × 100` | ≥ 80 % | 83,5 % (137/164) | 06 |

Los seeds de tesis (paradas, mermas, velocidades) **redistribuyen entre las 9 líneas × 2 turnos** sin añadir ni quitar registros: los conteos e invariantes de TRI/TCI/TSP/CFS/EP no cambian con la migración de maestros.

---

## Notas de implementación del mock

- **`/ordenes/resumen.todas` devuelve 1 248** (total histórico del repositorio, spec 05.A) mientras que `meta.total` de `/ordenes` refleja las órdenes cargadas en el dataset. La UI debe usar `resumen` para las summary cards y el subtítulo del header, y `meta` para el pie de la tabla.
- `porValidar`, `conParadas`, `conMermas` sí se calculan sobre el dataset sembrado.
- El Home (spec 02.C) declara `TRI −48 % vs pretest` y Evidencia (spec 09.A) `−52 %`. Ambos textos se reproducen tal cual: el Home usa el valor fijo de `homeKpisSecundarios`, Evidencia el calculado sobre los 10 registros del Anexo 02.
- La orden de ejemplo `OF-2026-0815` sigue viva en el seed histórico; tras la migración de maestros su maquinista real de referencia es Jorge Quispe (`USR-02`, `LIN-EXTR-2`) en vez del antiguo "L2 Conos".
