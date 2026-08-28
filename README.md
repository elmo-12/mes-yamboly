# MES Yamboly

Sistema de ejecución de manufactura (MES) con analítica IA para Helatony's S.A.C. (Yamboly). Implementación en código, con alta fidelidad, del diseño Figma (Master Design System v2.3.1 · sección `MES · YAMBOLY`, 57 pantallas).

## Tecnologías
- **Frontend:** Next.js 15.3 (App Router) · React 19 · Tailwind v4 · TanStack Query · react-hook-form + zod · Recharts · Radix UI · lucide-react · msw 2 (mocks) · zustand (sesión).
- **Backend:** NestJS 11 · TypeORM + SQLite · JWT (passport-jwt) + roles · class-validator · Swagger · exceljs · event-emitter.
- **Monorepo:** pnpm 11 workspaces + Turborepo · TypeScript estricto.

## Estructura
```
mes-yamboly/
├── apps/
│   ├── web/                 Frontend (Figma → código)
│   │   └── src/{app,layouts,features,components,services,mocks,hooks,config,styles}
│   └── api/                 Backend NestJS
│       └── src/{main.ts,config,common,database/{entities,seeds},modules/<dominio>}
├── packages/
│   ├── ui/                  @mes/ui — Design System (tokens MDS + 45 componentes)
│   ├── types/               @mes/types — contratos front↔back (tipos + zod)
│   ├── shared/              @mes/shared — formatters es-PE, OEE, KPIs de tesis
│   └── config/              @mes/config — tsconfig base
└── docs/                    contratos, mapa Figma, design system, QA, resumen de implementación
```
Capa de datos del frontend: `UI → hooks (TanStack Query) → features/<dominio>/api.ts → services/api/client → mock (msw) | API NestJS`. Las vistas nunca importan mocks.

## Requisitos
Node ≥ 20 (probado con 22) · pnpm 11 (`corepack enable pnpm`) · en macOS, Xcode CLT si `sqlite3` no encuentra prebuilt.

## Instalación y ejecución
```bash
pnpm install
pnpm dev        # web http://localhost:3000 · api http://localhost:4000/api/v1 · Swagger http://localhost:4000/docs
```
`pnpm dev` compila `@mes/types`/`@mes/shared` en watch, arranca Next y Nest; el backend crea `apps/api/data/mes.sqlite` y la siembra con datos de demostración la primera vez.

Si `sqlite3` falla con `Could not locate the bindings file`:
```bash
cd node_modules/.pnpm/sqlite3*/node_modules/sqlite3 && npm run install
```

## Modos de datos
| Modo | `apps/web/.env.local` | Uso |
|---|---|---|
| **mock** (por defecto) | `NEXT_PUBLIC_DATA_SOURCE=mock` | Navegar toda la app sin backend (msw intercepta en el navegador; datos deterministas y mutables en sesión) |
| **api** | `NEXT_PUBLIC_DATA_SOURCE=api` + `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` | Contra NestJS + SQLite (persistente, JWT real) |

## Credenciales de demostración (contraseña `Yamboly2026`)
`jefe@yamboly.lat` (jefe de producción) · `ana.rios@yamboly.lat` (supervisora) · `jorge.quispe@yamboly.lat` (maquinista L2) · `maria.torres@yamboly.lat` (mermas) · `investigador@yamboly.lat` (investigador de tesis). Encuesta pública: `/encuesta/tsp-2026-01` … `tsp-2026-22`.

## Variables de entorno
- `apps/web/.env.local` (ver `.env.example`): `NEXT_PUBLIC_DATA_SOURCE`, `NEXT_PUBLIC_API_URL`.
- `apps/api/.env` (ver `.env.example`): `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DB_PATH`, `CORS_ORIGIN`, `SWAGGER_PATH`, `PREDICTION_SERVICE_URL` (microservicio Python opcional; sin él se usan reglas), `PREDICTION_TIMEOUT_MS`.

## Scripts
| Comando | Qué hace |
|---|---|
| `pnpm dev` | web + api en paralelo |
| `pnpm build` | build de todos los paquetes |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint en todo el monorepo |
| `pnpm --filter @mes/api test:e2e` | 55 tests e2e (SQLite en memoria) |
| `pnpm seed` | borra y regenera la base SQLite con los datos de demo |
| `pnpm --filter @mes/web dev` / `--filter @mes/api dev` | una sola app |

## Frontend
Rutas: `/login`, `/` (Home por rol), `/tiempo-real` (+ captura rápida: parada, merma, velocidad, iniciar/finalizar orden, parada sugerida IoT), `/tv`, `/ordenes`, `/ordenes/[id]`, `/reportes`, `/alertas`, `/analitica`, `/evidencia`, `/encuesta/[token]`, `/configuracion`, `/perfil`. Páginas de QA en desarrollo: `/dev/ui` (todo el Design System) y `/dev/api` (endpoints).

## Backend
12 módulos (auth, users, catalogs, orders, downtimes, scrap, speeds, realtime, reports, alerts, analytics, evidence), 79 endpoints bajo `/api/v1`, respuestas `{ data, meta }` para colecciones y errores `{ statusCode, code, message, details }`. Contrato completo en `docs/api-contracts.md`; Swagger en `/docs`.

## Mocks
`apps/web/src/mocks/{data,handlers,store.ts}`: mismos datos que los seeds del backend (líneas L1–L5 + PT-01, OF-2026-0815, causas PM-01…PS-07, alertas, modelo v3.2, instrumentos TRI/TCI/TSP/CFS/EP). Errores simulables con `?__error=500` en cualquier llamada.

## Decisiones de arquitectura
- **Design System en código antes que las vistas** (`@mes/ui`), tokens 1:1 con las variables de Figma; reglas MDS codificadas (la página es el contenedor, cards solo funcionales, sombras solo en flotantes, un Primary por pantalla, Danger con confirmación).
- **Contratos compartidos** (`@mes/types` con zod) usados por vistas, mocks msw y DTOs NestJS → cambiar de mock a API no toca las vistas.
- **SQLite con TypeORM** para arrancar sin infraestructura; migrar a PostgreSQL = cambiar el datasource.
- **IA intercambiable**: `PredictionProvider` (reglas por defecto, HTTP hacia el microservicio scikit-learn cuando exista).
- **Seguridad en servidor**: JWT + roles por endpoint; sin claves en el cliente.
- Módulos del sistema anterior sin impacto en la tesis (Pasteurización, Personal) se conservan en la navegación como placeholders.

Más detalle: `docs/implementation-summary.md`, `docs/qa-report.md`, `docs/figma-map.md`, `docs/design-system.md`.
