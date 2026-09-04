# Resumen de implementación — MES Yamboly (28 ago 2026 · fase 2: 3–4 sep 2026 · fase 2b: 4 sep 2026 tarde · fase 3: 4 sep 2026 noche)

Implementación en código del rediseño Figma (`WOfwZEmPx1Hcw7ehaIsnpx`, sección `MES · YAMBOLY`) siguiendo la skill `figma-design-to-code` (`get_design_context` por frame, gates G1/G2–G4/G5). Estado tras la fase 1 (28-ago-2026): **`pnpm typecheck` · `lint` · `build` · `test:e2e` (55/55) en verde**. Estado tras la fase 2 "maestros reales" (4-sep-2026 mañana, ver sección al final de este documento): **`pnpm typecheck` (7/7) · `lint` limpio · `build` (4/4) · `pnpm --filter @mes/api test:e2e` (118/118 en 7 suites) en verde**. Estado tras la fase 2b — ajustes de configuración y tiempo real (4-sep-2026 tarde, sin máquina/equipo ni sedes; ver «Fase 2b» al final): **`pnpm typecheck` en verde · `lint` limpio · `build` en verde · `pnpm --filter @mes/api test:e2e` (114/114 en 7 suites) en verde; `pnpm dev` levanta web (:3000) y api (:4000)**. Estado tras la fase 3 — evidencia real y validación de calidad TCI (4-sep-2026 noche, ver «Fase 3» al final): postest de tesis vaciado de datos hipotéticos, importadores de fuentes externas y motor de validación TCI, invitaciones TSP; **`pnpm typecheck`/`lint`/`build` en verde · `pnpm --filter @mes/api test:e2e` 131/131 en 8 suites** (7 suites de la fase 2b + `evidence-validacion.e2e-spec.ts` nueva; `thesis.e2e-spec.ts` reescrita al flujo real), **98 endpoints** bajo `/api/v1`, **37 entidades** TypeORM.

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

- **Rutas (16, antes 18):** `/login` · `/` (Home por rol) · `/tiempo-real` (+ 6 flujos de captura como modales/drawers, antes 7 — el paso Máquina del wizard de parada se retiró en fase 2b) · `/tv` · `/ordenes` · `/ordenes/[id]` (7 pestañas) · `/reportes` (5 pestañas) · `/alertas` (+ drawer detalle, modal lote, drawer umbrales) · `/analitica` (4 pestañas + estado insuficiente) · `/evidencia` (7 pestañas) · `/encuesta/[token]` (pública) · `/configuracion` (6 pestañas: causas de parada, causas de merma, **líneas** (antes «máquinas»), productos y velocidades, umbrales, **usuarios** (antes «sedes y usuarios» — fase 2b retira el catálogo de sedes, ver «Fase 2b» al final)) · `/perfil` · `/dev/ui`, `/dev/api` (QA) · 404. `/pasteurizacion` y `/personal` (placeholders de la fase 1) se retiraron en la fase 2 (E9-05) — ver sección de fase 2 al final de este documento.
- **Layouts:** `AppShell` (sidebar 260 fija ≥1280, drawer con hamburguesa <1280, topbar 64 **sin selector de sede** desde fase 2b, guard de sesión y rol), `AuthLayout`, `TvLayout`, `PublicLayout`.
- **Features (14):** auth, home, realtime, capture, orders, downtimes, scrap, speeds, catalogs, reports, alerts, analytics, evidence, settings — cada una con `api.ts` (servicio tipado), `hooks.ts` (TanStack Query) y `components/` (117 componentes de vista en total, ninguna página monolítica).
- **Capa de datos:** UI → hooks → `features/*/api.ts` → `services/api/client.ts` (baseURL, JWT, ApiError tipado, 401→logout, 422→errores de campo) → **mock (msw 2, `apps/web/src/mocks`)** o **HTTP NestJS**, según `NEXT_PUBLIC_DATA_SOURCE`.
- **Mocks:** datasets deterministas (semilla fija), idénticos a los seeds de la API: 9 líneas (antes 6), 41 sabores, 201 productos (antes 11), 333 velocidades estándar producto×línea (antes 178, velocidad única por producto), 83 causas de parada + 56 causas de merma (antes 45 causas planas), 2 turnos D/N, 11 usuarios, 60 OF (OF-2026-0815 exacta a Figma), 188 paradas, 92 mermas, 24 alertas, predicciones 30 d, modelo v3.2, evidencia TRI/TCI/TSP/CFS/EP con los valores del diseño; store mutable (crear parada → OF/tiempo real; confirmar alerta → EP; encuesta → TSP); latencia 150–400 ms; errores con `?__error=`. Desde fase 2b **sin catálogo de sedes** (única sede Lima) **ni de máquinas** (33 registros hasta el cierre de fase 2, retirados junto con el nivel máquina/equipo — ver «Fase 2b»).
- **Estados implementados:** loading (skeletons por bloque), empty, no-results, error (+ reintentar), success/toast, validación zod por paso, confirmación (Danger siempre con modal), disabled (Primary base con overlay), read-only, forbidden (RoleGate), 404, unauthorized (redirección).
- **Responsive:** verificado 1440 / 1280 / 1024 / 768 / 390 sin scroll horizontal del body; tablas con scroll propio; grids que reflowan; Modo TV 1920 y 1440.

## 3. Backend (`apps/api`, NestJS 11 + TypeORM + SQLite)

- **Módulos (12):** auth, users, catalogs, orders, downtimes, scrap, speeds, realtime, reports, alerts, analytics, evidence (2 controllers: `evidence` + `survey`, la encuesta pública). Estructura `module / controller / service / dto / mappers`, entidades en `database/entities` (**37** vigentes desde la fase 3 — 4 nuevas: `importacion_fuente`, `lectura_sensor`, `solicitud_externa`, `transferencia_sap`; 33 al cierre de la fase 2b, antes 34/35 con `Maquina` y `Sede`, ambas retiradas en fase 2b), seeds ordenados (`SEEDERS`) que reproducen los mocks y se ejecutan al arrancar si la BD está vacía (`pnpm seed` la regenera).
- **Endpoints:** **98** rutas bajo `/api/v1` vigentes desde la fase 3 (91 al cierre de la fase 2b, 95 al cierre de la fase 2, 79 antes de la fase 2; contrato en `docs/api-contracts.md`) — la fase 3 suma 7 rutas nuevas en `evidence.controller.ts` (fuentes externas: listar, plantilla, importar, historial de importaciones — 4; TCI: validar, resumen — 2, `PATCH /evidencia/tci/:id` ya existía y se adaptó al nuevo modelo de criterios; `POST /evidencia/tsp/invitaciones` — 1), verificado contando `@Get|@Post|@Patch|@Delete|@Put` en los 13 `*.controller.ts` de `apps/api/src/modules/**` (17 en `evidence.controller.ts` + 2 en `survey.controller.ts`, antes 10 + 2). Colecciones `{data, meta}`, errores `{statusCode, code, message, details}` (422 con `campo → mensaje`), SSE `/tiempo-real/stream`, descarga de XLSX reales (exceljs) en reportes y evidencia (una hoja por anexo 02–06, más 3 plantillas de fuentes externas), encuesta pública con token de un solo uso.
- **Validación:** DTOs con class-validator/transformer (21 archivos DTO), `ValidationPipe` whitelist, excepciones de negocio tipadas (`BUSINESS_RULE`, `CONFLICT`, `NOT_FOUND`).
- **Seguridad (P0/P1 del diagnóstico):** JWT (`JwtAuthGuard` global + `@Public()`), `RolesGuard` por endpoint (6 roles), contraseñas bcrypt, sin claves en el cliente, CORS restringido, autorización en servidor (no solo en front).
- **IA (RF8/RF9):** `AlertsEngineService` (reglas de umbral) + `PredictionProvider` inyectable: `RuleBasedPredictionProvider` (activo) y `PythonHttpPredictionProvider` (stub para el microservicio scikit-learn vía `PREDICTION_SERVICE_URL`, con fallback). Evento `evidence.tri.registro` alimenta TRI automáticamente desde cada captura; desde la fase 3 el TCI (Anexo 03) deja de depender de la validación de orden y se valida con un motor de reglas propio contra fuentes externas importadas (ver «Fase 3» al final).
- **Swagger:** `http://localhost:4000/docs` (12 tags, bearer auth, DTOs y errores documentados).
- **Tests:** **8 suites e2e** (auth, orders, downtimes, realtime, thesis, catalogs-crud, users, `evidence-validacion` nueva de la fase 3) — **131/131** (114/114 al cierre de la fase 2b, 118/118 al cierre de la fase 2, 55/55 al cierre de la fase 1); ver «Fase 3» al final para el detalle por archivo.
- **Pendiente backend:** microservicio Python real; exportación CSV/PDF (solo XLSX); conector en vivo con sensores/SAP (hoy sólo importación XLSX/CSV manual, ver «Fase 3»). `/pasteurizacion` y `/personal` se retiraron en la fase 2 (ya no aplican como pendiente, ver sección **Fase 2** al final de este documento).

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
| ¿Backend NestJS funciona? | Sí: **98 endpoints** (91 al cierre de la fase 2b, 95 al cierre de la fase 2, 79 al cierre de la fase 1), seeds con maestros reales + evidencia real, **131 e2e en 8 suites** (114 al cierre de la fase 2b, 118 al cierre de la fase 2, 55 al cierre de la fase 1), Swagger |
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

> **Nota (4-sep-2026, tarde):** esta sección documenta el estado de la fase 2 tal como cerró la mañana del 4-sep-2026
> — incluye el mantenedor de "Máquinas" (33 equipos, confirmados en `apps/api/.../catalogs.ts` y en el mock,
> coherentes entre sí) y el catálogo de "Sedes" (9 reales). Esa misma tarde el producto decidió retirar ambos del
> alcance (la parada llega hasta línea, única sede Lima); no se reescribió esta sección para conservar el registro
> histórico de la decisión anterior. El estado **vigente** —91 endpoints, 114/114 e2e, pestañas Líneas/Usuarios—
> está en **«Fase 2b — ajustes del 4-sep»**, al final de este documento.

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

**Total: 95 endpoints bajo `/api/v1`** (79 al cierre de la fase 1) — **91 tras la fase 2b** (`/sedes` y `/maquinas` retirados, `POST/PATCH/DELETE /lineas` añadidos), ver «Fase 2b» al final.

### Frontend

- **Tabs de Configuración (6):** causas de parada, causas de merma (nueva), máquinas, productos y velocidades (reescrita), umbrales, sedes y usuarios (pasa de solo lectura a mantenedor completo). Fase 2b renombra «máquinas» → «líneas» y «sedes y usuarios» → «usuarios» (sin sedes), ver «Fase 2b».
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

---

## Fase 2b — ajustes de configuración y tiempo real (4-sep-2026, tarde)

Tercera fase de implementación, en la rama `feat/ajustes-configuracion` (sobre `feat/maestros-reales`, commit
`19172ce`). El mismo día del cierre de la fase 2, el producto revisó dos decisiones de modelo (nivel máquina/equipo
y catálogo de sedes) y las revirtió; esta fase aplica esa decisión al código, no añade funcionalidad nueva. Estado
final verificado: `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde · `pnpm --filter @mes/api test:e2e`
**114/114 en 7 suites**.

### Los 7 puntos del ajuste

1. **Sin nivel máquina/equipo:** la parada se registra hasta **línea** (línea = máquina física de planta); se
   elimina `Maquina` de `@mes/types`, de la API (`/maquinas` retirado), de los mocks, del wizard de parada
   (`ParadaWizard.tsx` pierde el paso "Máquina") y de Configuración.
2. **Pestaña Máquinas → Líneas:** mantenedor completo de las 9 líneas (alta, edición, baja lógica) —
   `LineasTab.tsx` / `LineaDrawer.tsx` / `DesactivarLineaModal.tsx`, `POST/PATCH/DELETE /lineas`.
3. **Solo existe la sede Lima:** sedes fuera de la UI y de la API (`/sedes` eliminado); la pestaña **Usuarios**
   (antes «Sedes y usuarios») queda sin sede; sin selector de sede en el topbar ni en el tiempo real;
   `SEDE_UNICA_ID` como constante interna.
4. **"Ver velocidades" abre un modal** (`VelocidadesModal`) con alta/edición/baja anidadas, en vez del panel
   inferior de `ProductosVelocidadesTab`.
5. **Se quita "Código del sistema anterior"** del detalle de causa de parada (`CausaParadaDetalle.tsx`); el dato
   `codigoLegado` se conserva en el JSON de causas, solo deja de mostrarse en la UI.
6. **Tiempo real sin filtro de líneas ni de sede:** `LineasFilterBar` y `TiempoRealHeader` simplificados; `LineCard`
   ampliada (2 columnas en ≥1280 px, métricas en grilla 2×2, barra de progreso etiquetada, mensaje contextual).
7. **Fix ⌘K:** `AppShell.tsx` leía `e.key` sin comprobar que existiera; guarda añadida antes de comparar
   `e.key === 'k'`.

### Conteos

| Concepto | Antes (cierre fase 2) | Después (fase 2b) |
| --- | --- | --- |
| Endpoints bajo `/api/v1` | 95 | **91** (`/sedes` −3, `/maquinas` −4, `POST/PATCH/DELETE /lineas` +3) |
| Entidades TypeORM (`database/entities`) | 34 (con `Maquina`, `Sede`) | **33** |
| Suite e2e | 118/118 en 7 suites | **114/114** en 7 suites (−10 casos de máquinas/sedes, +6 de líneas) |
| Pestañas de Configuración | 6 (…, Máquinas, …, Sedes y usuarios) | 6 (…, **Líneas**, …, **Usuarios**) |
| Máquinas (equipos de línea) | 33 registros curados a mano | retirado |
| Sedes | 9 reales | retirado (única sede Lima, `SEDE_UNICA_ID` interno) |

El conteo de endpoints se verificó contando `@Get|@Post|@Patch|@Delete|@Put` en los 13 archivos
`apps/api/src/modules/**/**.controller.ts`: alerts 10 · analytics 7 · auth 3 · catalogs 22 · downtimes 7 ·
evidence 10 · survey 2 · orders 10 · realtime 3 · reports 6 · scrap 3 · speeds 2 · users 6 = **91**.

### Referencias que quedan como estaban (fuera del alcance de esta fase)

`docs/api-contracts.md`, `README.md` y `docs/BRIEF-agentes.md` se actualizaron en el mismo commit por la tarea de
código (`19172ce`) y ya reflejan el modelo vigente (sin máquinas ni sedes). Este documento (`implementation-summary.md`)
y `docs/qa-report.md` se actualizan en esta revisión de `docs/`; las secciones anteriores del documento marcadas
como históricas («Fase 2», sección 3 «Backend» con conteos previos) se anotaron con referencias a esta sección en
vez de reescribirse.

### Pendientes detectados en el QA de fase 2b

- El overlay del modal anidado dentro de `VelocidadesModal` no oscurece el modal base: `--z-overlay` (60) queda por
  debajo de `--z-modal` (70).
- `LineaEstado.oeeTurnoPct` no existe en el contrato — la `LineCard` ampliada muestra «Última parada» en su lugar,
  no un OEE de turno.
- `DashboardMaquinista` en revisión (pendiente de verificar contra la `LineCard` ampliada).

Detalle completo en «QA fase 2b (4-sep-2026 tarde)» en `docs/qa-report.md`.

---

## Fase 3 — Evidencia real y validación TCI (4-sep-2026, noche)

Cuarta fase de implementación, en la rama `feat/evidencia-real` (sobre `main`, que ya incluye la fase 2b). El
producto decidió que el módulo Evidencia de tesis dejara de sembrar un **postest hipotético** (los valores fijos
TRI 1,4 min / TCI 93,3 % / TSP 84,2 % / CFS 100 % / EP 83,5 % de las fases anteriores) y pasara a llenarse con **uso
real del sistema**: capturas para el TRI, una encuesta pública para el TSP, un checklist manual para el CFS,
confirmaciones de alertas para la EP, y — la pieza nueva de esta fase — un motor de **validación de calidad (TCI)**
que contrasta cada registro contra 3 fuentes externas importadas (sensores, solicitudes, transferencias SAP), sin
integración en vivo. Estado final verificado: `pnpm --filter @mes/types build && pnpm typecheck && pnpm lint &&
pnpm build` en verde · `pnpm --filter @mes/api test:e2e` **131/131 en 8 suites**.

### Decisiones

| Decisión | Detalle |
| --- | --- |
| Vaciar el postest hipotético | Los seeds de tesis dejan de sembrar TRI postest, evaluaciones TCI, respuestas TSP y registros EP; sólo se conserva el **pretest** del TRI (10 filas medidas a mano, 2,9 min, `ThesisEvidenceSeeder`). Los 5 KPI arrancan en `estado: 'sin_datos'`, `valor: null`. |
| TRI automático desde cada captura | Cada parada, merma, velocidad u orden emite `evidence.tri.registro` con `tiempoRegistroSeg`; el listener agrega una fila al Anexo 02 postest — sin cambios respecto a fases anteriores, pero ahora es la **única** fuente del postest (antes convivía con el seed hipotético). |
| TCI contra fuentes externas importadas, no contra la validación de orden | El Anexo 03 dejaba de calcularse con `E3-03` (validar orden); ahora un motor de reglas propio (`evidence.rules.ts` en la API, `evidencia-validacion.ts` en el mock) evalúa cada parada/merma/velocidad contra sensores, solicitudes y transferencias SAP subidas por archivo. |
| Sin integración en vivo con sensores ni SAP | Las 3 fuentes se cargan por **XLSX/CSV** con plantilla propia, descargada desde la web y llenada a mano con lo que exporta el sistema de origen; no hay conector automático (queda como pendiente, ver abajo). |
| Tolerancias configurables | ±5 min en tiempos, ±5 % en cantidad/velocidad, ±1 día en fecha SAP — nuevos campos en `Umbrales`, editables en Configuración › Umbrales › «Validación de calidad (TCI)». |
| TSP con invitaciones nominales | En vez de un enlace único compartido, cada invitado recibe un token de un solo uso (`POST /evidencia/tsp/invitaciones`); el Anexo 04 agrega respondidas/pendientes por invitación. |
| CFS y EP sin seed de datos | CFS arranca con las 9 funcionalidades sin verificar (`cumple: false`, sin `verificadaEn`); EP no siembra `registro_ep` — se crea al confirmar una alerta real, y las 7 alertas «confirmadas» de demostración del seed **no** cuentan como evidencia. |

### Modelo de datos

- **`EvaluacionTCI`/`CriterioTCI`** (`packages/types/src/evidence.ts`) — reemplazan el modelo anterior de 4 columnas fijas de verificación. Cada evaluación referencia un registro operativo (`tipoRegistro: 'parada'|'merma'|'velocidad'`, `registroId`) y trae de 2 a 3 `CriterioTCI` según el tipo (`completo` siempre; `sensor`+`solicitud` en parada; `sap`+`solicitud` en merma; `sensor` en velocidad), cada uno con `cumple`, `detalle` legible y un `override` opcional. `valido` = todos los criterios cumplidos.
- **Entidades nuevas** (`apps/api/src/database/entities`): `importacion_fuente` (id, tipo, archivo, importadoEn/Por, filasOk/Rechazadas, desde/hasta), `lectura_sensor` (línea, fechaHora, estado, velocidadUnidMin), `solicitud_externa` (numero único, fecha, línea opcional, tipo, estado), `transferencia_sap` (documento único, fecha, línea, productoCodigo de 7 dígitos, cantidadKg, tipoMerma opcional). `evaluacion_calidad` se reescribió al nuevo modelo de criterios (simple-json).
- **`Umbrales`** (`packages/types/src/alerts.ts`) suma `tciToleranciaMin` (5), `tciToleranciaPct` (5) y `tciToleranciaDiasSap` (1).
- **`EvidenciaCFS`** distingue ahora «verificada y no cumple» de «sin verificar»: `VerificacionCFS.verificadaEn` (ISO-8601 o `null`) y `EvidenciaCFS.verificadas`/`porcentaje: number | null` — el KPI CFS también puede estar en `sin_datos` hasta la primera verificación.
- **`KpiTesis.estado`** gana el valor `'sin_datos'` (con `valor: null`) para los 5 instrumentos mientras no exista ninguna muestra real; `EvidenciaResumen.comparativaTri` devuelve la barra `Postest` con `minutos: null` en ese caso.

### Endpoints (`apps/api/src/modules/evidence`)

7 rutas nuevas en `evidence.controller.ts` (10 → 17) más las 2 ya existentes de `survey.controller.ts` sin cambios: fuentes externas (`GET /evidencia/fuentes`, `GET /evidencia/fuentes/:tipo/plantilla`, `POST /evidencia/fuentes/:tipo/importar`, `GET /evidencia/fuentes/:tipo/importaciones`), TCI (`POST /evidencia/tci/validar`, `GET /evidencia/tci/resumen`) y TSP (`POST /evidencia/tsp/invitaciones`); `GET /evidencia/tci` se reescribió de una lista simple a `ListadoTCI` paginado con filtros (`tipo`, `resultado`, `desde`, `hasta`) y `PATCH /evidencia/tci/:id` se adaptó al nuevo modelo de criterios (override por clave + observación). Servicios nuevos: `EvidenceImportService` (plantillas + importación tolerante XLSX/CSV, `tabla.util.ts`) y `EvidenceValidationService` (motor de reglas, `evidence.rules.ts`). Contrato completo, ejemplos de `detalle` por criterio y motivos de rechazo de cada plantilla: `docs/api-contracts.md` § **evidence**.

### Frontend

- **Pestañas de Evidencia (7, sin cambio de conteo):** Resumen · TRI · **TCI** (rediseñada) · **TSP** (con invitaciones) · CFS · EP · Exportar, todas bajo `?tab=` en `EvidenciaPage.tsx`.
- **Componentes nuevos** (`apps/web/src/features/evidence/components`): `ImportarFuenteModal.tsx` (sube XLSX/CSV ≤ 5 MB con vista previa de filas y mapeo de columnas), `ValidarTciModal.tsx` (lanza `POST /evidencia/tci/validar` por rango/tipo, advierte que reemplaza las evaluaciones del rango), `RevisarEvaluacionDrawer.tsx` (detalle de una evaluación: cada criterio con su explicación y un switch para forzar el resultado, exige justificación), `NuevaInvitacionModal.tsx` (invitación nominal a la encuesta TSP, token de un solo uso, copia el enlace).
- **Configuración › Umbrales** (`UmbralesTab.tsx`) gana la sección «Validación de calidad (TCI)» con los 3 campos de tolerancia; `UmbralesDrawer.tsx` (el de Alertas) no la muestra pero reenvía esos 3 campos tal cual en cada `PUT` para no perderlos (comentario explícito en el componente).
- **Capa de datos:** `features/evidence/api.ts` ampliado con los métodos de fuentes/TCI/invitaciones; `apps/web/package.json` suma la dependencia `xlsx` (SheetJS) para generar las plantillas y leer el archivo subido en el navegador cuando `NEXT_PUBLIC_DATA_SOURCE=mock`.

### Mocks (paridad literal con la API)

- **`apps/web/src/mocks/evidencia-validacion.ts`** es un **espejo literal** de `evidence.rules.ts` + `EvidenceValidationService`: mismas funciones (`construirTramos`, `criterioCompleto`, `criterioSensorParada`, `criterioSensorVelocidad`, `criterioSolicitud`, `criterioSapMerma`), mismo orden de criterios por tipo, mismos textos de `detalle` — el comentario de cabecera del archivo lo declara así explícitamente.
- **`apps/web/src/mocks/evidencia-fuentes.ts`** / **`evidencia-tabla.ts`** generan y leen las plantillas XLSX en el navegador con **SheetJS** (`xlsx`), replicando `tabla.util.ts` (normalización de cabeceras, fechas Excel/ISO/latina, números con coma decimal, deduplicación por clave natural).
- Store mutable (`apps/web/src/mocks/store.ts`): `ImportacionFuenteMock`, `LecturaSensorMock`, `SolicitudExternaMock`, `TransferenciaSapMock` — importar en modo mock acumula en el store de la sesión igual que la API en SQLite.
- Los seeds de tesis del mock (`apps/web/src/mocks/data/evidence.ts`) se vaciaron de postest igual que `thesis-evidence.seed.ts`: sólo pretest TRI y las 9 verificaciones CFS sin verificar.

### Tests

- **8 suites e2e** (antes 7): `evidence-validacion.e2e-spec.ts` **nueva** (15 pruebas — genera fixtures XLSX/CSV en el propio test, importa, valida y verifica cada criterio, overrides, tolerancias) y `thesis.e2e-spec.ts` **reescrita** al flujo real (26 pruebas: estado vacío → capturas → importaciones → validación TCI → encuesta → TSP → CFS `PATCH` → alerta confirmada → EP), antes 25.
- **131/131** pruebas en verde: auth 5 · orders 11 · downtimes 6 · realtime 11 · thesis 26 · catalogs-crud 39 · users 17 · evidence-validacion 16 (`grep -c "it(" apps/api/test/*.ts`).

### Pendientes

- **Conector en vivo con sensores/ERP-SAP** (no forma parte del alcance de esta fase): hoy sólo importación manual por XLSX/CSV; un conector automático reemplazaría el paso de "descargar plantilla → llenar → subir" por lecturas en tiempo real, con el mismo motor de reglas de `evidence.rules.ts` como validador.
- **`LineaEstado.oeeTurnoPct`** sigue sin existir en el contrato (heredado de la fase 2b, no tocado en esta fase).
- **Evidencia fotográfica de merma** (`Merma.evidenciaUrl` sin persistir) sigue pendiente, sin relación con esta fase (ver `E2-07` en `docs/product-backlog.md`).
- **QA de integración de la fase 3** todavía no corrió (recorrido ruta por ruta en `mock`/`api`, fidelidad, responsive, consola); ver `docs/qa-report.md` § «QA fase 3 (pendiente de la pasada de integración)».
- **Plantillas de evidencia sin frame Figma propio**: el flujo de importación (modal, vista previa, mapeo de columnas) y el drawer de revisión de criterios se diseñaron en código sobre los patrones MDS existentes, sin una lectura de Figma dedicada (ver `docs/figma-map.md` / `docs/figma-specs-modulos.md` § «Desviaciones respecto a Figma»).
