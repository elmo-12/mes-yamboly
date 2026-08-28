# Resumen de implementación — MES Yamboly (28 ago 2026)

Implementación en código del rediseño Figma (`WOfwZEmPx1Hcw7ehaIsnpx`, sección `MES · YAMBOLY`) siguiendo la skill `figma-design-to-code` (`get_design_context` por frame, gates G1/G2–G4/G5). Estado: **`pnpm typecheck` · `lint` · `build` · `test:e2e` (55/55) en verde; `pnpm dev` levanta web (:3000) y api (:4000)**.

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

- **Rutas (18):** `/login` · `/` (Home por rol) · `/tiempo-real` (+ 7 flujos de captura como modales/drawers) · `/tv` · `/ordenes` · `/ordenes/[id]` (7 pestañas) · `/reportes` (5 pestañas) · `/alertas` (+ drawer detalle, modal lote, drawer umbrales) · `/analitica` (4 pestañas + estado insuficiente) · `/evidencia` (7 pestañas) · `/encuesta/[token]` (pública) · `/configuracion` (6 pestañas) · `/perfil` · `/pasteurizacion`, `/personal` (módulos conservados, placeholder documentado) · `/dev/ui`, `/dev/api` (QA) · 404.
- **Layouts:** `AppShell` (sidebar 260 fija ≥1280, drawer con hamburguesa <1280, topbar 64, guard de sesión y rol), `AuthLayout`, `TvLayout`, `PublicLayout`.
- **Features (14):** auth, home, realtime, capture, orders, downtimes, scrap, speeds, catalogs, reports, alerts, analytics, evidence, settings — cada una con `api.ts` (servicio tipado), `hooks.ts` (TanStack Query) y `components/` (117 componentes de vista en total, ninguna página monolítica).
- **Capa de datos:** UI → hooks → `features/*/api.ts` → `services/api/client.ts` (baseURL, JWT, ApiError tipado, 401→logout, 422→errores de campo) → **mock (msw 2, `apps/web/src/mocks`)** o **HTTP NestJS**, según `NEXT_PUBLIC_DATA_SOURCE`.
- **Mocks:** 11 datasets deterministas (semilla fija): 6 líneas, 12 máquinas, 45 causas, 11 productos, 60 OF (OF-2026-0815 exacta a Figma), 188 paradas, 92 mermas, 178 velocidades, 24 alertas, predicciones 30 d, modelo v3.2, evidencia TRI/TCI/TSP/CFS/EP con los valores del diseño; store mutable (crear parada → OF/tiempo real; confirmar alerta → EP; encuesta → TSP); latencia 150–400 ms; errores con `?__error=`.
- **Estados implementados:** loading (skeletons por bloque), empty, no-results, error (+ reintentar), success/toast, validación zod por paso, confirmación (Danger siempre con modal), disabled (Primary base con overlay), read-only, forbidden (RoleGate), 404, unauthorized (redirección).
- **Responsive:** verificado 1440 / 1280 / 1024 / 768 / 390 sin scroll horizontal del body; tablas con scroll propio; grids que reflowan; Modo TV 1920 y 1440.

## 3. Backend (`apps/api`, NestJS 11 + TypeORM + SQLite)

- **Módulos (12):** auth, users, catalogs, orders, downtimes, scrap, speeds, realtime, reports, alerts, analytics, evidence. Estructura `module / controller / service / dto / mappers`, entidades en `database/entities` (34), seeds ordenados (`SEEDERS`) que reproducen los mocks y se ejecutan al arrancar si la BD está vacía (`pnpm seed` la regenera).
- **Endpoints:** 79 rutas bajo `/api/v1` (contrato en `docs/api-contracts.md`), colecciones `{data, meta}`, errores `{statusCode, code, message, details}` (422 con `campo → mensaje`), SSE `/tiempo-real/stream`, descarga de XLSX reales (exceljs) en reportes y evidencia (una hoja por anexo 02–06), encuesta pública con token de un solo uso.
- **Validación:** DTOs con class-validator/transformer (18 archivos DTO), `ValidationPipe` whitelist, excepciones de negocio tipadas (`BUSINESS_RULE`, `CONFLICT`, `NOT_FOUND`).
- **Seguridad (P0/P1 del diagnóstico):** JWT (`JwtAuthGuard` global + `@Public()`), `RolesGuard` por endpoint (6 roles), contraseñas bcrypt, sin claves en el cliente, CORS restringido, autorización en servidor (no solo en front).
- **IA (RF8/RF9):** `AlertsEngineService` (reglas de umbral) + `PredictionProvider` inyectable: `RuleBasedPredictionProvider` (activo) y `PythonHttpPredictionProvider` (stub para el microservicio scikit-learn vía `PREDICTION_SERVICE_URL`, con fallback). Evento `evidence.tri.registro` alimenta TRI automáticamente desde cada captura.
- **Swagger:** `http://localhost:4000/docs` (12 tags, bearer auth, DTOs y errores documentados).
- **Tests:** 5 suites e2e (auth, orders, downtimes, realtime, thesis) — 55/55.
- **Pendiente backend:** microservicio Python real; exportación CSV/PDF (solo XLSX); `/pasteurizacion` y `/personal` sin módulo (conservados fuera del alcance de la tesis).

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
| ¿Backend NestJS funciona? | Sí: 79 endpoints, seeds, 55 e2e, Swagger |
| ¿Endpoints documentados? | Sí: Swagger + `docs/api-contracts.md` |
| ¿Contratos coherentes front↔back? | Sí: `@mes/types` compartido; 11 divergencias corregidas en integración |
| ¿Compila? | Sí: `pnpm typecheck`, `lint`, `build` en verde (4 paquetes) |
| ¿Sin errores de consola? | Sí: 0 errores/warnings de React/Next/recharts/Radix en todas las rutas (QA) |
| ¿Arquitectura escalable? | Monorepo por paquetes, features por dominio, módulos NestJS por dominio, contratos compartidos, proveedor de IA intercambiable, SQLite → PostgreSQL cambiando el datasource |
| ¿README permite ejecutar desde cero? | Sí (`README.md`) |

## 6. Pendientes conocidos
- Microservicio Python (scikit-learn) real; hoy reglas deterministas + stub HTTP.
- Serie "periodo anterior" en la tendencia OEE (campo nuevo en contrato).
- `TvRow` sin `ofCodigo/producto` (subtítulo del Modo TV usa el detalle de alerta); dropdown "Rol" en la encuesta.
- Exportación CSV/PDF; "Exportar" en Alertas e "Importar/Exportar catálogo" en Configuración (sin endpoint).
- `paradasConservadas` (historial + vivas) vs. contador del panel (solo historial) en baja de causas — unificar.
- Módulos conservados `/pasteurizacion` y `/personal`: placeholders, fuera del alcance de la tesis por decisión del usuario.
