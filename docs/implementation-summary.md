# Resumen de implementación — MES Yamboly (28 ago 2026 · fase 2: 3–4 sep 2026)

Implementación en código del rediseño Figma (`WOfwZEmPx1Hcw7ehaIsnpx`, sección `MES · YAMBOLY`) siguiendo la skill `figma-design-to-code` (`get_design_context` por frame, gates G1/G2–G4/G5). Estado tras la fase 1 (28-ago-2026): **`pnpm typecheck` · `lint` · `build` · `test:e2e` (55/55) en verde**. Estado tras la fase 2 "maestros reales" (4-sep-2026, ver sección al final de este documento): **`pnpm typecheck` (7/7) · `lint` limpio · `build` (4/4) · `pnpm --filter @mes/api test:e2e` (118/118 en 7 suites) en verde; `pnpm dev` levanta web (:3000) y api (:4000)**.

## 1. Figma

| Concepto | Resultado |
|---|---|
| Vistas encontradas | 57 frames de pantalla (11 páginas: 00 Overview, 01 Shell & Patterns, 02–10 módulos) + 17 componentes MES-local |
| Vistas implementadas | **57 / 57** (`docs/figma-map.md` frame → ruta; `docs/qa-report.md` veredicto por frame: 42 alta fidelidad, 14 ajustados durante QA, 0 pendientes de fidelidad; desviaciones justificadas listadas frame a frame) |
| Componentes MDS identificados | Button (216 var.), Badge, Tag, Input, Dropdown/Select inline, Checkbox/Radio, Toggle, Tooltip, Filter pill, Summary card, Sidebar, Topbar, KPI/Alert/Insight card, plantillas List/Record/Form/Dashboard/Settings/Analytics |
| Componentes reutilizados (DS en código, `@mes/ui`) | **Primitives (18):** Button, Badge, Tag, Input, Textarea, Select, SelectInline, Checkbox, RadioGroup/Radio, Switch, Tooltip, Avatar, Skeleton, Divider, Overline, Spinner, ProgressBar, SectionTitle. **Patterns (27):** Sidebar, Topbar, PageHeader, PageContent, Breadcrumb, Tabs, KpiCard, AlertCard, InsightCard, SummaryCard, LineCard (5 estados), Stepper (h/v), EmptyState (4 variantes), Modal (+TimerChip), Drawer (left/right), Popover, DropdownMenu, Toaster, Table (+densidad), Pagination, FilterBar (inline/stacked), StickyFooter, ListDetailLayout, DescriptionList, HeatmapCell, Timeline, Icon (mapa Figma → lucide, `docs/icons-map.md`) |
| Componentes nuevos (no existían en MDS, construidos con sus tokens) | ChartFrame/ChartTooltip/chartTheme (gráficos sin card), Sparkline, HeatmapCausaTurno, TurnoTimeline, TecladoNumerico, AdjuntarFoto, ContextoCaptura, AppPageHeader (breadcrumb + header), NotificationsPopover, ShellSkeleton/PageSkeleton, Forbidden/RoleGate |
| Tokens | `packages/ui/src/tokens/theme.css`: 22 tokens semánticos MDS 1:1 + 3 añadidos (`primary-subtle-border #93C5FD`, `primary-subtle-fill #DBEAFE`, `radius-chip 6`), 13 estilos Inter + `metric` 28/34, radios xs/sm/md/lg/pill, 5 sombras + focus, spacing semántico (sidebar 260, topbar 64, page-x, sección 48, controles 36/40/48, filas 56/44/32), z-index, easing, tokens Modo TV. Sin modo oscuro (MDS White First) |

## 2. Frontend (`apps/web`, Next.js 15.3 App Router)

- **Rutas (16, antes 18):** `/login` · `/` (Home por rol) · `/tiempo-real` (+ 7 flujos de captura como modales/drawers) · `/tv` · `/ordenes` · `/ordenes/[id]` (7 pestañas) · `/reportes` (5 pestañas) · `/alertas` (+ drawer detalle, modal lote, drawer umbrales) · `/analitica` (4 pestañas + estado insuficiente) · `/evidencia` (7 pestañas) · `/encuesta/[token]` (pública) · `/configuracion` (6 pestañas: causas de parada, causas de merma, máquinas, productos y velocidades, umbrales, sedes y usuarios) · `/perfil` · `/dev/ui`, `/dev/api` (QA) · 404. `/pasteurizacion` y `/personal` (placeholders de la fase 1) se retiraron en la fase 2 (E9-05) — ver sección de fase 2 al final de este documento.
- **Layouts:** `AppShell` (sidebar 260 fija ≥1280, drawer con hamburguesa <1280, topbar 64, guard de sesión y rol), `AuthLayout`, `TvLayout`, `PublicLayout`.
- **Features (14):** auth, home, realtime, capture, orders, downtimes, scrap, speeds, catalogs, reports, alerts, analytics, evidence, settings — cada una con `api.ts` (servicio tipado), `hooks.ts` (TanStack Query) y `components/` (117 componentes de vista en total, ninguna página monolítica).
- **Capa de datos:** UI → hooks → `features/*/api.ts` → `services/api/client.ts` (baseURL, JWT, ApiError tipado, 401→logout, 422→errores de campo) → **mock (msw 2, `apps/web/src/mocks`)** o **HTTP NestJS**, según `NEXT_PUBLIC_DATA_SOURCE`.
- **Mocks:** datasets deterministas (semilla fija), idénticos a los seeds de la API desde la fase 2 (maestros reales): 9 líneas (antes 6), 9 sedes, 41 sabores, 201 productos (antes 11), 333 velocidades estándar producto×línea (antes 178, velocidad única por producto), 33 máquinas (antes 12), 83 causas de parada + 56 causas de merma (antes 45 causas planas), 2 turnos D/N, 11 usuarios, 60 OF (OF-2026-0815 exacta a Figma), 188 paradas, 92 mermas, 24 alertas, predicciones 30 d, modelo v3.2, evidencia TRI/TCI/TSP/CFS/EP con los valores del diseño; store mutable (crear parada → OF/tiempo real; confirmar alerta → EP; encuesta → TSP); latencia 150–400 ms; errores con `?__error=`.
- **Estados implementados:** loading (skeletons por bloque), empty, no-results, error (+ reintentar), success/toast, validación zod por paso, confirmación (Danger siempre con modal), disabled (Primary base con overlay), read-only, forbidden (RoleGate), 404, unauthorized (redirección).
- **Responsive:** verificado 1440 / 1280 / 1024 / 768 / 390 sin scroll horizontal del body; tablas con scroll propio; grids que reflowan; Modo TV 1920 y 1440.

## 3. Backend (`apps/api`, NestJS 11 + TypeORM + SQLite)

- **Módulos (12):** auth, users, catalogs, orders, downtimes, scrap, speeds, realtime, reports, alerts, analytics, evidence. Estructura `module / controller / service / dto / mappers`, entidades en `database/entities` (34), seeds ordenados (`SEEDERS`) que reproducen los mocks y se ejecutan al arrancar si la BD está vacía (`pnpm seed` la regenera).
- **Endpoints:** 95 rutas bajo `/api/v1` (79 antes de la fase 2; contrato en `docs/api-contracts.md`), colecciones `{data, meta}`, errores `{statusCode, code, message, details}` (422 con `campo → mensaje`), SSE `/tiempo-real/stream`, descarga de XLSX reales (exceljs) en reportes y evidencia (una hoja por anexo 02–06), encuesta pública con token de un solo uso.
- **Validación:** DTOs con class-validator/transformer (18 archivos DTO), `ValidationPipe` whitelist, excepciones de negocio tipadas (`BUSINESS_RULE`, `CONFLICT`, `NOT_FOUND`).
- **Seguridad (P0/P1 del diagnóstico):** JWT (`JwtAuthGuard` global + `@Public()`), `RolesGuard` por endpoint (6 roles), contraseñas bcrypt, sin claves en el cliente, CORS restringido, autorización en servidor (no solo en front).
- **IA (RF8/RF9):** `AlertsEngineService` (reglas de umbral) + `PredictionProvider` inyectable: `RuleBasedPredictionProvider` (activo) y `PythonHttpPredictionProvider` (stub para el microservicio scikit-learn vía `PREDICTION_SERVICE_URL`, con fallback). Evento `evidence.tri.registro` alimenta TRI automáticamente desde cada captura.
- **Swagger:** `http://localhost:4000/docs` (12 tags, bearer auth, DTOs y errores documentados).
- **Tests:** 7 suites e2e (auth, orders, downtimes, realtime, thesis + catalogs-crud, users desde la fase 2) — 118/118 (55/55 al cierre de la fase 1).
- **Pendiente backend:** microservicio Python real; exportación CSV/PDF (solo XLSX). `/pasteurizacion` y `/personal` se retiraron en la fase 2 (ya no aplican como pendiente, ver sección **Fase 2** al final de este documento).

## 4. Integración

| Vista | Mock msw | API NestJS real |
|---|---|---|
| Todas las rutas (login, home, tiempo real + captura, tv, órdenes, reportes, alertas, analítica, evidencia, encuesta, configuración, perfil) | ✅ | ✅ (verificado flujo a flujo por I1, sin errores de consola/red) |

Cambio de modo: `NEXT_PUBLIC_DATA_SOURCE=mock|api` en `apps/web/.env.local` (por defecto `mock`, para poder navegar sin backend). Diferencias conocidas entre mock y API: el mock es más laxo (no aplica 403 en umbrales ni 422 en exportar sin datasets) y `ordenes/resumen.todas` = 1 248 (texto de Figma) frente a 60 órdenes reales en el listado.

## 5. Validación final (§30 del encargo)

| Pregunta | Respuesta |
|---|---|
| ¿Todas las vistas relevantes de Figma implementadas? | Sí, 57/57 (`docs/figma-map.md`, `docs/qa-report.md`) |
| ¿Navegación entre ellas funciona? | Sí: sidebar por grupos y rol, breadcrumb dinámico, tabs en URL, listado→detalle→editar→guardar→toast→refetch |
| ¿Alta fidelidad con Figma? | 42 frames alta fidelidad + 14 ajustados en QA; desviaciones justificadas por regla MDS/contrato documentadas |
| ¿Componentes reutilizables bien abstraídos? | DS en `@mes/ui` (45 componentes) consumido por todas las vistas; sin duplicados (dos implementaciones de gráficos se unificaron) |
| ¿Design System consistente? | Tokens 1:1 con Figma, sin valores mágicos; reglas MDS codificadas (cards funcionales, sombras solo flotantes, un Primary, Danger con confirmación, Badge no interactivo) |
| ¿Mocks suficientes? | Sí: tablas, filtros, búsqueda, paginación, detalles, dashboards, gráficos, formularios, vacíos, errores, loading, estados de negocio |
| ¿Formularios funcionan? | Sí: react-hook-form + zod compartido con el backend; 422 del servidor mapeado a campos |
| ¿Estados loading/error/empty cubiertos? | Sí en todas las rutas (`loading.tsx`, `error.tsx`, EmptyState por vista) |
| ¿Frontend desacoplado de mocks? | Sí: las vistas solo usan hooks; el adapter se elige por variable de entorno |
| ¿Backend NestJS funciona? | Sí: 95 endpoints (79 al cierre de la fase 1), seeds con maestros reales, 118 e2e en 7 suites (55 al cierre de la fase 1), Swagger |
| ¿Endpoints documentados? | Sí: Swagger + `docs/api-contracts.md` |
| ¿Contratos coherentes front↔back? | Sí: `@mes/types` compartido; 11 divergencias corregidas en integración |
| ¿Compila? | Sí: `pnpm typecheck`, `lint`, `build` en verde (4 paquetes) |
| ¿Sin errores de consola? | Sí: 0 errores/warnings de React/Next/recharts/Radix en todas las rutas (QA) |
| ¿Arquitectura escalable? | Monorepo por paquetes, features por dominio, módulos NestJS por dominio, contratos compartidos, proveedor de IA intercambiable, SQLite → PostgreSQL cambiando el datasource |
| ¿README permite ejecutar desde cero? | Sí (`README.md`) |

## 6. Pendientes conocidos (estado al cierre de la fase 1, 28-ago-2026)

> Lista histórica. La lista vigente, fusionada con lo detectado en la fase 2, vive en «Pendientes actualizados»
> dentro de la sección **Fase 2** más abajo — dos ítems de esta lista ya se resolvieron ahí (`paradasConservadas`
> unificado en `BajaLogicaResponse`, y `/pasteurizacion`/`/personal` retirados) y no se repiten.

- Microservicio Python (scikit-learn) real; hoy reglas deterministas + stub HTTP.
- Serie "periodo anterior" en la tendencia OEE (campo nuevo en contrato).
- `TvRow` sin `ofCodigo/producto` (subtítulo del Modo TV usa el detalle de alerta); dropdown "Rol" en la encuesta.
- Exportación CSV/PDF; "Exportar" en Alertas e "Importar/Exportar catálogo" en Configuración (sin endpoint).
- ~~`paradasConservadas` (historial + vivas) vs. contador del panel (solo historial) en baja de causas — unificar.~~ Resuelto en fase 2.
- ~~Módulos conservados `/pasteurizacion` y `/personal`: placeholders, fuera del alcance de la tesis.~~ Retirados en fase 2.

---

## Fase 2 — mantenedores completos y datos maestros reales (3–4 sep 2026)

Segunda fase de implementación, en la rama `feat/maestros-reales` (base `main` en `2bb7f89`). Sustituye el modelo
de planta de la fase 1 (5 líneas + PT-01, turnos M/T/N, catálogos de ejemplo) por el **maestro real de Yamboly**
extraído del sistema anterior, y completa los mantenedores de Configuración que en la fase 1 quedaban de solo
lectura. Estado final verificado: `pnpm typecheck` 7/7 · `pnpm lint` limpio · `pnpm build` 4/4 ·
`pnpm --filter @mes/api test:e2e` **118/118 en 7 suites**.

### Decisiones

| Decisión | Detalle |
| --- | --- |
| 9 líneas reales sustituyen 5 líneas + PT-01 | Máquinas físicas de planta: 4 llenadoras (M2, M1, A1, A2), 2 extrusoras (2, 3), 3 moldeadoras (A2, A3, A4); campo `tipoProceso` (`llenadora\|extrusora\|moldeadora`) |
| `Maquina` = equipo de la línea | Envolvedora, codificadora, descargador, pinzas, faja, productora, túnel de frío, dosificadora…; 2–4 por línea; obligatoria en el wizard de parada |
| Velocidad estándar por par (producto, línea) | Nueva entidad `VelocidadEstandar` (tabla `producto_linea`): `velocidadUnidHora` (fuente del dump) y `velocidadUnidMin` (= /60, 1 decimal), congelada en `OrdenFabricacion.velocidadEstandar` al iniciar; `Producto` pierde `lineaId` y `velocidadEstandar` |
| Turnos D/N sustituyen M/T/N | `D` Día 06:00–18:00, `N` Noche 18:00–06:00 (turno único de 12 h, no 3 de 8 h) |
| Árbol de causas de merma de 3 niveles | `tipo → clasificación → causa`, mismo patrón que las causas de parada (`TT-GG-EE`), códigos `MP-01`, `MP-01-A`, `MP-01-01`; causas de parada ganan `codigoLegado` |
| 9 sedes reales | Roles se mantienen (jefe, supervisor, maquinista, calidad, mermas, investigador); `GET /sedes` se mueve de `users` a `catalogs` |
| Retiro de `/pasteurizacion` y `/personal` | Placeholders sin valor para la tesis; el flag `enviarPasteurizacion` de merma se conserva como dato |
| Datos reales congelados en JSON | `apps/api/src/database/seeds/data/real/*.json`, generados una sola vez desde el dump; no se regeneran en runtime |

### Modelo de datos

- **`Sabor`** — catálogo independiente nuevo (41 registros, id `SAB-<código 7 dígitos>`); `Producto.sabor` es informativo (heurística de texto sobre el dump, sin FK), el wizard de merma usa `/sabores` como catálogo, no como validación cruzada.
- **`VelocidadEstandar` (tabla `producto_linea`)** — par único `(productoId, lineaId)`, `velocidadUnidHora`/`velocidadUnidMin`, `cipMin`/`arranqueMin`; 409 en par duplicado; id `VE-<secuencial 4 dígitos>`.
- **Árbol `CausaMerma`** — 3 niveles (`tipo → clasificación → causa`), `GET /causas-merma?formato=arbol|plano&nivel&tipo&lineaId`, id `CME-<código>`; 56 causas reales materializadas por par (tipo, clasificación) donde el dump tenía relaciones muchos-a-muchos.
- **`Producto` sin línea** — 201 productos reales (código de 7 dígitos, descripción, sabor, presentación), ya no fijado a una línea ni a una velocidad única.
- **Turnos `D`/`N`** — reemplazan `M`/`T`/`N` en ~18 vistas (órdenes, reportes, analítica, home, evidencia, heatmaps, comparativa por turno).
- **Sedes** — 9 reales (Arequipa, Ayacucho, Chiclayo, Huancayo, Iquitos, Lima, Moyobamba, Pucallpa, Tarapoto), id `SED-<CIUDAD>`.

### Endpoints nuevos (por recurso)

| Recurso | Endpoints |
| --- | --- |
| `catalogs` — sedes | `GET/POST/PATCH /sedes` (movido desde `users`) |
| `catalogs` — sabores | `GET /sabores` |
| `catalogs` — productos | `GET/POST/PATCH/DELETE /productos` |
| `catalogs` — velocidades estándar | `GET/POST/PATCH/DELETE /velocidades-estandar` |
| `catalogs` — máquinas | `GET/POST/PATCH/DELETE /maquinas` |
| `catalogs` — causas de parada | `GET/POST/PATCH/DELETE /causas-parada` (con `codigoLegado`) |
| `catalogs` — causas de merma | `GET/POST/PATCH/DELETE /causas-merma` (nuevo árbol de 3 niveles) |
| `catalogs` — turnos, líneas | `GET /turnos`, `GET /lineas` |
| `users` — usuarios | `POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/estado`, `POST /usuarios/:id/restablecer-password`, `GET /colaboradores` |

**Total: 95 endpoints bajo `/api/v1`** (79 al cierre de la fase 1).

### Frontend

- **Tabs de Configuración (6):** causas de parada, causas de merma (nueva), máquinas, productos y velocidades (reescrita), umbrales, sedes y usuarios (pasa de solo lectura a mantenedor completo).
- **Árbol genérico:** `CausasTree.tsx` (nodo `{id, codigo, nombre, estado, nivel, hijos}`) reutilizado por `CausasParadaTab` y el nuevo `CausasMermaTab`; detalle compartido en `CausaDetalleShell.tsx` (`CausaParadaDetalle.tsx`, `CausaMermaDetalle.tsx`).
- **Overlays nuevos:** `ProductoDrawer`, `EliminarProductoModal`, `VelocidadEstandarModal`, `EliminarVelocidadModal`, `MatrizVelocidades` (tabla producto × 9 líneas), `SedeDrawer`, `DesactivarSedeModal`, `UsuarioDrawer`, `RestablecerPasswordModal`, `DesactivarUsuarioModal`, `MaquinaDrawer` (gana modo edición), `NuevaCausaModal`, `EliminarCausaModal`, `EliminarMaquinaModal`.
- **Wizards de captura** reconectados al par (producto, línea): `IniciarOrdenWizard` (resuelve y congela `velocidadUnidMin`, 422 bajo `productoId` si no hay par vigente), `MermaWizard` (selector en cascada tipo → clasificación → causa sobre el árbol real), `VelocidadDrawer` (`desvioPct` contra el estándar del par, etiqueta u/min).
- **Capa de datos:** `features/catalogs/causas.ts` (árbol genérico) y `features/catalogs/hooks.ts`/`api.ts` ampliados para los 5 nuevos recursos; mocks msw en paridad total con la API (misma `SEED`, store mutable).

### Datos reales

- **Script de un solo uso:** `apps/api/scripts/extraer-maestros.mjs` — lee el dump Postgres (formato custom `pg_dump`, Strapi v5) con `pg_restore -a -t <tabla> -f -` y escribe los JSON commiteados en `apps/api/src/database/seeds/data/real/*.json`; no se ejecuta en runtime.
- **Tablas leídas:** `lineas`, `sedes`, `sabores`, `productos`, `producto_lineas` (+ `_lnk`), `tipo_paradas`, `categoria_generals`, `categoria_especificas`, `merma_tipo_produccions`, `merma_clasificacions`, `merma_causas`. Deduplicado por `document_id` (fila publicada de Strapi), conversión u/h → u/min con 1 decimal, sabor asignado por coincidencia de texto.
- **Máquinas** son la única entidad curada a mano (no vienen del dump): 33 registros en `apps/api/src/database/seeds/data/catalogs.ts`.
- **Conteos:** 9 líneas, 9 sedes, 41 sabores, 201 productos, 333 velocidades producto×línea sembradas (340 en el JSON extraído: 6 sin producto vigente y 1 duplicado descartados), 33 equipos, causas de parada 83 (5 tipos / 26 generales / 52 específicas), causas de merma 56 (5 tipos / 11 clasificaciones / 40 causas), 2 turnos, 11 usuarios.

### Tests

- 7 suites e2e (2 nuevas: `catalogs-crud.e2e-spec.ts`, `users.e2e-spec.ts`; 5 actualizadas al modelo real: `auth`, `orders`, `downtimes`, `realtime`, `thesis`).
- **118/118** pruebas en verde: auth 5 · orders 11 · downtimes 6 · realtime 11 · thesis 25 · catalogs-crud 43 · users 17.

### Pendientes actualizados (fusiona la fase 1 y lo detectado en el QA de fase 2)

- Microservicio Python (scikit-learn) real; hoy reglas deterministas + stub HTTP (E6-05).
- Exportación CSV/PDF (sólo XLSX hoy); "Exportar" en Alertas e "Importar/Exportar catálogo" en Configuración, sin endpoint en el contrato (E4-05, E12-*).
- Serie "periodo anterior" en la tendencia OEE (E12-03); `TvRow` sin `ofCodigo/producto` (E12-02); dropdown "Rol" en la encuesta pública (E12-04).
- Snapshot mock de `lineaEstados`, escrito a mano, difiere de la API en 3 líneas y en el turno.
- `LineCard` en estado «Sin orden» muestra la última OF cerrada en vez de indicar que no hay orden activa.
- `/analitica`: riesgo por línea muestra el top-5 en API frente a 9 líneas en mock.
- Configuración › Umbrales sigue con el modelo reducido de 5 campos, no las 8 + acciones de cabecera del frame Figma (decisión previa, no reabierta).
- Los seeds de tesis en la API usan el reloj real (`thesis-seed.util.ts: hoy()`) en vez de la constante `HOY` fija que usa el mock.
- `Merma` no persiste `evidenciaUrl` — la foto sólo se exige en el cliente, no queda guardada en el backend.
- 20 de 201 productos sin `sabor` resuelto (sin FK en el dump original); `tiempoEstandarMin` = 0 en todas las velocidades específicas (el dump es anterior a esa funcionalidad).
- Cosméticos: presentación «2.54 kg(5L)» literal del dump sin normalizar; chips que truncan texto largo.
- Importar históricos reales de paradas y mermas (E9-06); migración a PostgreSQL (E9-07); tiempos estándar de cambio producto×producto (E9-08) — todos `S6+`, sin fecha asignada.

**Resueltos en esta fase** (ya no aparecen como pendientes): `paradasConservadas` se unificó en el campo genérico
`BajaLogicaResponse.conservados`/`etiquetaConservados` (la API conserva el alias `paradasConservadas` sólo en la
baja de causas de parada, por compatibilidad, con el mismo valor que `conservados`); `/pasteurizacion` y
`/personal` se retiraron de la navegación y del código (E9-05); ids `VE-` duplicados al crear velocidades (bug
corregido en el QA de esta fase).

Detalle completo de correcciones, veredictos de fidelidad y responsive de esta fase en «QA fase 2 · maestros
reales y mantenedores (4-sep-2026)», al inicio de `docs/qa-report.md`.
