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

### Sabores

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/sabores` | GET | `estado?` | `{ data: Sabor[] }` — 41 sabores reales, sin FK con producto (`Producto.saborId` es informativo) | 401 |

### Líneas

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/lineas` | GET | `tipoProceso?` (`llenadora\|extrusora\|moldeadora`), `estado?` | `{ data: LineaListItem[] }` — 9 líneas reales (máquinas físicas): 4 llenadoras (`LLEN-M2`, `LLEN-M1`, `LLEN-A1`, `LLEN-A2`), 2 extrusoras (`EXTR-2`, `EXTR-3`), 3 moldeadoras (`MOLD-A2`, `MOLD-A3`, `MOLD-A4`); cada fila añade `productosConVelocidad` y `paradas30d` | 401 |
| `/lineas` | POST | `CreateLinea { codigo, nombre, nombreCorto, tipoProceso, estado?, capacidadUnidadesMin? }` — `codigo` formato `LLEN-M2` / `EXTR-2` / `MOLD-A3` | `Linea` (201) | 403 (`jefe`/`supervisor`) · 409 código duplicado · 422 |
| `/lineas/:id` | PATCH | `Partial<CreateLinea>` — edita código, nombre, nombre corto, tipo de proceso, estado o capacidad | `Linea` | 403 · 404 · 409 |
| `/lineas/:id` | DELETE | — | `BajaLogicaResponse` (`estado: 'inactivo'`, `etiquetaConservados: 'órdenes y paradas'`) — la línea pasa a `inactivo` y conserva su histórico | 403 (`jefe`/`supervisor`) · 404 |

La línea **es** la máquina física de planta: no existe un nivel de equipo por debajo y la parada se registra hasta aquí. `Linea` no expone `sedeId` (la aplicación opera una única sede, Lima).

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
| `/usuarios` | GET | `rol[]`, `lineaId?` (incluye además a los usuarios sin línea: jefe, supervisores, calidad), `activo?` (`true` solo activos, `false` solo inactivos) | `{ data: User[] }` — directorio de personas para los selectores de captura (responsable, maquinista, supervisor). **Sin restricción de rol**: lo consumen tanto Configuración como los wizards | 401 |
| `/usuarios` | POST | `CreateUsuario { nombre, email, dni (8 dígitos), rol, cargo, lineaId?, password (≥8) }` | `User` (201, hash bcrypt, iniciales derivadas del nombre) | 403 (solo `jefe`) · 409 correo o DNI duplicado · 422 |
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
| `/paradas` | POST | `CreateParada { ordenId, lineaId, tipoCausaId?, causaId, inicio, accionTomada (≥10 car.), numeroSolicitud?, evidenciaUrl?, afectaOee?, responsableId, origen?, deteccionId?, tiempoRegistroSeg? }` — la parada se registra hasta la **línea** (no hay nivel máquina); `tipoCausaId` se deduce del árbol si se omite | `ParadaListItem` (201) | 422 `accionTomada` obligatoria (mín. 10 caracteres) · 422 `lineaId`/`causaId` inexistente · 422 `numeroSolicitud` si la causa lo exige (`requiereSolicitud`) |
| `/paradas/:id` | PATCH | `UpdateParada` (+ `fin?: string \| null`, `motivoEdicion?`) | `ParadaListItem`; el cambio de causa, máquina y hora de fin se escriben en la bitácora. `fin` recalcula `duracionMin`; `fin: null` reabre la parada (spec 05.F) | 404 · 422 |
| `/paradas/:id/finalizar` | POST | `FinalizeParada { fin, comentarioCierre? }` | `ParadaListItem` con `duracionMin` | 404 · 409 ya finalizada |
| `/detecciones-iot` | GET | `estado=sugerida\|confirmada\|descartada` | `{ data: DeteccionIoT[] }` | 401 |
| `/detecciones-iot/:id/confirmar` | POST | `{ causaId, accionTomada, tiempoRegistroSeg? }` | `{ deteccion, parada }` (201) — crea una parada `origen: 'iot'` vinculada a la orden en curso de la línea | 404 · 409 ya procesada · 422 sin orden en curso en la línea |
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
| `/tiempo-real/lineas` | GET | `lineaId[]`, `estado[]` (`produciendo\|parada\|sin_orden\|alerta\|sugerida`) | `TiempoRealResumen { actualizadoEn, diaOperativo, turno, turnoLabel, turnoRango, lineas: LineaEstado[] }` — una fila por línea (9) | 401 |
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
| `/alertas/umbrales` | PUT | `Umbrales { velocidadBajoEstandarPct, oeeMinimo, probabilidadMinima, notificarN8n, mostrarTv, tciToleranciaMin, tciToleranciaPct, tciToleranciaDiasSap }` | `Umbrales` | 403 solo `jefe` · 422 |

Desde la fase 3 (evidencia real), `Umbrales` suma 3 campos que sólo alimentan la validación de calidad (TCI, ver sección **evidence**): `tciToleranciaMin` (± minutos al comparar horas contra sensores, por defecto 5), `tciToleranciaPct` (± % en cantidades kg y velocidades u/min, por defecto 5) y `tciToleranciaDiasSap` (± días entre la merma y su transferencia SAP, por defecto 1). Se editan en Configuración › Umbrales de alerta › sección «Validación de calidad (TCI)» (`UmbralesTab.tsx`); el drawer de alertas (`UmbralesDrawer.tsx`) no expone estos 3 campos pero los reenvía tal cual en cada `PUT` para no perderlos.

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

Desde la fase 3 (rama `feat/evidencia-real`, 4-sep-2026) el módulo Evidencia dejó de sembrar datos hipotéticos de
**postest**: los 5 instrumentos (Anexos 02–06) arrancan vacíos y se llenan con el uso real del sistema. Sólo se
conserva el **pretest** del TRI (línea base medida a mano). Ver la nota **"Postest vacío por diseño"** al final de
esta sección.

### Endpoints

| Endpoint | Método | Roles | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- | --- |
| `/evidencia/resumen` | GET | cualquier rol autenticado | — | `EvidenciaResumen { pretestDesde…postestHasta, kpis: KpiTesis[5], comparativaTri }` | 401 |
| `/evidencia/tri` | GET | cualquiera | — | `EvidenciaTRI { postest, pretest, promedioPostest, promedioPretest, reduccionPct, meta, estado }` | 401 |
| `/evidencia/tri/pretest` | POST | `jefe`, `investigador` | `CargarPretestDto { registros: [{ fecha, eventoRegistrado, horaInicioRegistro, tiempoMin, observacion? }] }` | `{ data: RegistroTRI[], promedioPretest }` (201) | 422 lista vacía / fecha u hora inválida |
| `/evidencia/fuentes` | GET | cualquiera | — | `FuenteExternaResumen[]` (las 3 fuentes: filas acumuladas, última importación, periodo) | 401 |
| `/evidencia/fuentes/:tipo/plantilla` | GET | cualquiera | `tipo` = `sensores\|solicitudes\|sap_mermas` | XLSX (`StreamableFile`): hoja de datos + hoja «Instrucciones» | 404 tipo no reconocido |
| `/evidencia/fuentes/:tipo/importar` | POST | `jefe`, `investigador` | multipart: `archivo` (xlsx/csv ≤ 5 MB), `mapeo?` (JSON texto `{columnaEsperada: cabeceraDelArchivo}`) | `ImportacionResultado { id, tipo, archivo, filasOk, filasRechazadas, filasDuplicadas, rechazos[], periodo? }` (201) | 422 sin archivo / archivo sin filas / `mapeo` no es JSON objeto · 404 tipo no reconocido |
| `/evidencia/fuentes/:tipo/importaciones` | GET | cualquiera | `tipo` | `ImportacionResumen[]` (historial, más reciente primero) | 404 tipo no reconocido |
| `/evidencia/tci/validar` | POST | `jefe`, `investigador` | `ValidarTciDto { desde?, hasta?, tipos? }` — sin rango usa desde la primera captura del postest hasta hoy; sin `tipos`, los 3 | `EvidenciaTCI` (200) — **reemplaza** las evaluaciones del rango | 422 fechas fuera de `YYYY-MM-DD` / tipo no reconocido |
| `/evidencia/tci` | GET | cualquiera | `TciQueryDto extends PaginationDto { tipo?, resultado? ('valido'\|'invalido'), desde?, hasta? }` | `ListadoTCI { data: EvaluacionTCI[], meta, resumen: ResumenTCI }` | 401 |
| `/evidencia/tci/resumen` | GET | cualquiera | — | `ResumenTCI` (cabecera sin el detalle fila a fila: totales, `porTipo`, `ultimaValidacion`, `fuentes`) | 401 |
| `/evidencia/tci/:id` | PATCH | `jefe`, `investigador`, `calidad` | `OverrideTciDto { overrides?: {clave: boolean\|null}, observacion? }` — `null` devuelve el criterio a la regla | `EvaluacionTCI` recalculada | 404 · 422 clave de criterio no reconocida / observación > 300 car. |
| `/evidencia/tsp` | GET | cualquiera | — | `EvidenciaTSP { items[8], invitaciones, respuestas, invitados, promedio, pctAcuerdo, meta, estado, enlace }` | 401 |
| `/evidencia/tsp/invitaciones` | POST | `jefe`, `investigador` | `CrearInvitacionDto { usuarioId }` — `invitado`/`rol` se derivan del usuario | `InvitacionTSP { token, usuarioId, invitado, rol?, url, respondida: false, creadaEn }` (201) | 422 `usuarioId` vacío, inexistente o inactivo · 409 el usuario ya tiene invitación |
| `/evidencia/cfs` | GET | cualquiera | — | `EvidenciaCFS { items[9], cumplidas, totales, porcentaje, meta, estado }` | 401 |
| `/evidencia/cfs/:id` | PATCH | `jefe`, `investigador` | `VerificacionCfsDto { cumple, observacion? (≤300 car., default '') }` | `{ item: VerificacionCFS, resumen: EvidenciaCFS }` | 404 · 422 |
| `/evidencia/ep` | GET | cualquiera | — | `EvidenciaEP { registros, prediccionesCorrectas, prediccionesTotales, porcentaje, meta, estado }` | 401 |
| `/evidencia/exportar` | POST | cualquiera | `ExportEvidenciaDto { kpis[] (≥1 de TRI\|TCI\|TSP\|CFS\|EP), formato? (xlsx\|csv\|pdf, def. xlsx), destino? (spss\|informe, def. spss) }` | `{ id, estado: 'generando' }` (202) — XLSX con una hoja por anexo | 422 lista de `kpis` vacía |
| `/encuesta/:token` | GET **público** | — | — | `EncuestaPublica { token, titulo, descripcion, items[8], respondida }` | 404 token inválido |
| `/encuesta/:token` | POST **público** | — | `EncuestaRespuestaDto { respuestas: number[8] (1–5), comentario? (≤500 car.) }` | `{ recibido, respuestas, pctAcuerdo }` (201) — recalcula el TSP | 404 · 409 token ya usado · 422 respuestas fuera de 1–5 o incompletas |

Los `GET` de evidencia no llevan `@Roles`: cualquier persona autenticada puede consultarlos (el módulo completo sólo
es visible en el sidebar para `jefe` e `investigador`, `RoleGate` en el frontend). Las mutaciones sí están acotadas
por rol, como en la tabla.

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
- **Archivo**: `.xlsx` (primera hoja) o `.csv` (separador `,`/`;`/tab autodetectado, RFC 4180 con comillas), ≤ 5 MB.
- **Fechas**: `Date` de Excel, serie numérica de Excel, ISO `2026-08-28T10:42` / `2026-08-28`, o latina `28/09/2026 10:42`, `28-09-26`.
- **Números**: coma o punto decimal, con o sin separador de miles (`1 234,5` → `1234.5`).
- **Deduplicación**: clave natural por tipo — sensores `lineaId|fechaHora`, solicitudes `SOL|numero` (mayúsculas), SAP `SAP|documento` (mayúsculas); una fila con la misma clave que otra ya importada (misma importación o una anterior) se cuenta en `filasDuplicadas` y se ignora sin ser un error.
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

Sin seed de `registro_ep`: un registro se crea automáticamente al **confirmar una alerta** (`POST /alertas/:id/confirmar`, ver sección **alerts**), tanto si acertó como si no. Las 7 alertas «confirmadas» que sí trae el seed de alertas son operativas de demostración y **no generan EP** (no cuentan como evidencia de tesis). `GET /evidencia/ep` agrega `prediccionesCorrectas/prediccionesTotales` y el `porcentaje` (`PCC/PTG × 100`, `null` sin ninguna confirmación).

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
