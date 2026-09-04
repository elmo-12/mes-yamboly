# MES Yamboly

Sistema de ejecución de manufactura (MES) con analítica IA para Helatony's S.A.C. (Yamboly). Implementación en código, con alta fidelidad, del diseño Figma (Master Design System v2.3.1 · sección `MES · YAMBOLY`, 57 pantallas) sobre los **maestros reales** de la planta.

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
│       ├── scripts/         extraer-maestros.mjs (dump → seeds/data/real/*.json)
│       └── src/{main.ts,config,common,database/{entities,seeds},modules/<dominio>}
├── packages/
│   ├── ui/                  @mes/ui — Design System (tokens MDS + 45 componentes)
│   ├── types/                @mes/types — contratos front↔back (tipos + zod)
│   ├── shared/               @mes/shared — formatters es-PE, OEE, KPIs de tesis
│   └── config/               @mes/config — tsconfig base
└── docs/                     contratos, mapa Figma, design system, QA, resumen de implementación
```
Capa de datos del frontend: `UI → hooks (TanStack Query) → features/<dominio>/api.ts → services/api/client → mock (msw) | API NestJS`. Las vistas nunca importan mocks.

## Requisitos
Node ≥ 20 (probado con 22) · pnpm 11 (`corepack enable pnpm`) · en macOS, Xcode CLT si `sqlite3` no encuentra prebuilt.

## Instalación y ejecución
```bash
pnpm install
pnpm dev        # web http://localhost:3000 · api http://localhost:4000/api/v1 · Swagger http://localhost:4000/docs
```
`pnpm dev` compila `@mes/types`/`@mes/shared` en watch, arranca Next y Nest; el backend crea `apps/api/data/mes.sqlite` y la siembra con los datos maestros reales la primera vez.

Si `sqlite3` falla con `Could not locate the bindings file`:
```bash
cd node_modules/.pnpm/sqlite3*/node_modules/sqlite3 && npm run install
```

**Tras cambiar entidades de TypeORM** (nuevas columnas, tablas): `synchronize: true` **no borra columnas existentes**, así que hay que forzar la resiembra antes de levantar la API de nuevo:
```bash
rm -f apps/api/data/mes.sqlite
# o, equivalente:
pnpm --filter @mes/api seed
```

## Modos de datos
| Modo | `apps/web/.env.local` | Uso |
|---|---|---|
| **mock** (por defecto) | `NEXT_PUBLIC_DATA_SOURCE=mock` | Navegar toda la app sin backend (msw intercepta en el navegador; datos deterministas y mutables en sesión, calcados de `apps/api/src/database/seeds/data`) |
| **api** | `NEXT_PUBLIC_DATA_SOURCE=api` + `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` | Contra NestJS + SQLite (persistente, JWT real) |

## Credenciales de demostración (contraseña `Yamboly2026`, 11 usuarios en `SED-LIMA`)
| Correo | Nombre | Rol | Línea |
|---|---|---|---|
| `jefe@yamboly.lat` | Carlos Mendoza | Jefe de producción | — (administra catálogos y usuarios) |
| `ana.rios@yamboly.lat` | Ana Ríos | Supervisora, turno Día | — |
| `diego.salazar@yamboly.lat` | Diego Salazar | Supervisor, turno Noche | — |
| `maria.torres@yamboly.lat` | María Torres | Encargada de merma | — |
| `rosa.huaman@yamboly.lat` | Rosa Huamán | Analista de calidad | — |
| `investigador@yamboly.lat` | Investigador Tesis | Investigador (solo módulo Evidencia) | — |
| `jorge.quispe@yamboly.lat` | Jorge Quispe | Maquinista | Extrusora 2 (`LIN-EXTR-2`) |
| `luis.vargas@yamboly.lat` | Luis Vargas | Maquinista | Llenadora M2 (`LIN-LLEN-M2`) |
| `sofia.cardenas@yamboly.lat` | Sofía Cárdenas | Maquinista | Llenadora M1 (`LIN-LLEN-M1`) |
| `pedro.ccahuana@yamboly.lat` | Pedro Ccahuana | Maquinista | Moldeadora A3 (`LIN-MOLD-A3`) |
| `elena.ramos@yamboly.lat` | Elena Ramos | Maquinista | Moldeadora A4 (`LIN-MOLD-A4`) |

Encuesta pública: `/encuesta/tsp-2026-01` … `tsp-2026-22`.

## Datos maestros reales
Los catálogos de planta (líneas, sabores, productos, velocidades estándar, causas de parada y de merma) ya no son datos de ejemplo: son el **maestro real de Yamboly**, extraído de un dump de Postgres (formato custom `pg_dump`, sistema Strapi v5) del sistema anterior a la migración.

- **Origen:** `apps/api/src/database/seeds/data/real/*.json` (9 líneas, 41 sabores, 201 productos, 333 velocidades estándar, 83 causas de parada, 56 causas de merma, 2 turnos).
- **Regenerar los JSON desde el dump** (solo si cambia el dump o el mapeo de columnas):
  ```bash
  node apps/api/scripts/extraer-maestros.mjs
  ```
  Requiere el binario `pg_restore` de **libpq** disponible en la ruta configurada en el script (p. ej. `/opt/homebrew/opt/libpq/bin/pg_restore` en macOS/Homebrew). No restaura ninguna base de datos: lee el dump en modo texto (`pg_restore -a -t <tabla> -f -`) y escribe los JSON commiteados; es una tarea de un solo uso, los JSON **no se regeneran en runtime**.
- **Convenciones del dominio:**
  - **Línea = máquina física** de planta (Llenadora M2, Extrusora 2, Moldeadora A3…), no una familia de producto. Sustituye al antiguo esquema `L1…L5`.
  - **No existe el nivel máquina/equipo:** la línea es la máquina, y la parada se registra hasta la línea.
  - **Una única sede (Lima):** no hay catálogo de sedes ni filtros por sede en la API pública.
  - **La velocidad estándar vive en el par producto × línea** (`VelocidadEstandar`, tabla `producto_linea`), no en el producto: un mismo producto puede tener velocidades distintas en cada línea donde se fabrica. Se congela en la orden al iniciarla.
  - **Turnos:** `D` (Día, 06:00–18:00) y `N` (Noche, 18:00–06:00); reemplazan al esquema anterior de 3 turnos.
- Contrato completo de cada endpoint, conteos y convención de ids: `docs/api-contracts.md` (sección "Datos maestros reales").

## Variables de entorno
- `apps/web/.env.local` (ver `.env.example`): `NEXT_PUBLIC_DATA_SOURCE`, `NEXT_PUBLIC_API_URL`.
- `apps/api/.env` (ver `.env.example`): `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DB_PATH`, `CORS_ORIGIN`, `SWAGGER_PATH`, `PREDICTION_SERVICE_URL` (microservicio Python opcional; sin él se usan reglas), `PREDICTION_TIMEOUT_MS`.

## Scripts
| Comando | Qué hace |
|---|---|
| `pnpm dev` | web + api en paralelo |
| `pnpm build` | build de todos los paquetes |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint en todo el monorepo |
| `pnpm --filter @mes/api test:e2e` | tests e2e (SQLite en memoria), incluye `catalogs-crud` y `users` sobre el maestro real |
| `pnpm seed` / `pnpm --filter @mes/api seed` | borra y regenera la base SQLite con los datos maestros reales |
| `pnpm --filter @mes/web dev` / `--filter @mes/api dev` | una sola app |
| `node apps/api/scripts/extraer-maestros.mjs` | regenera `seeds/data/real/*.json` desde el dump Postgres (requiere `pg_restore`) |

## Frontend
Rutas: `/login`, `/` (Home por rol), `/tiempo-real` (+ captura rápida: parada, merma, velocidad, iniciar/finalizar orden, parada sugerida IoT), `/tv`, `/ordenes`, `/ordenes/[id]`, `/reportes`, `/alertas`, `/analitica`, `/evidencia`, `/encuesta/[token]`, `/configuracion`, `/perfil`. Páginas de QA en desarrollo: `/dev/ui` (todo el Design System) y `/dev/api` (endpoints).

### Configuración — mantenedores
`/configuracion` (`apps/web/src/features/settings`) tiene 6 pestañas, cada una con su propio mantenedor CRUD contra `docs/api-contracts.md`:

| Pestaña | Mantiene | Componente |
|---|---|---|
| Causas de parada | Árbol Tipo → General → Específica (+ `codigoLegado`) | `CausasParadaTab` / `CausaParadaDetalle` |
| Causas de merma | Árbol Tipo de producción → Clasificación → Causa | `CausasMermaTab` / `CausaMermaDetalle` |
| Líneas | Líneas de planta = máquinas físicas (código, nombre, nombre corto, proceso, capacidad, estado) | `LineasTab` / `LineaDrawer` / `DesactivarLineaModal` |
| Productos y velocidades | Matriz producto × línea (`VelocidadEstandar`, u/h → u/min) | `ProductosVelocidadesTab` / `ProductoDrawer` / `VelocidadEstandarModal` |
| Umbrales de alerta | Umbrales del motor de reglas/IA | `UmbralesTab` |
| Usuarios | Directorio de personas (alta, edición, activar/desactivar, restablecer contraseña) | `UsuariosTab` / `UsuarioDrawer` / `RestablecerPasswordModal` |

## Backend
12 módulos (auth, users, catalogs, orders, downtimes, scrap, speeds, realtime, reports, alerts, analytics, evidence) bajo `/api/v1`, respuestas `{ data, meta }` para colecciones y errores `{ statusCode, code, message, details }`. Contrato completo en `docs/api-contracts.md`; Swagger en `/docs`.

## Mocks
`apps/web/src/mocks/{data,handlers,store.ts}`: mismos datos que los seeds del backend (maestro real: 9 líneas, 41 sabores, 201 productos, 333 velocidades, causas de parada y de merma en árbol, turnos `D`/`N`, alertas, modelo v3.2, instrumentos TRI/TCI/TSP/CFS/EP). Errores simulables con `?__error=500` en cualquier llamada.

## Decisiones de arquitectura
- **Design System en código antes que las vistas** (`@mes/ui`), tokens 1:1 con las variables de Figma; reglas MDS codificadas (la página es el contenedor, cards solo funcionales, sombras solo en flotantes, un Primary por pantalla, Danger con confirmación).
- **Contratos compartidos** (`@mes/types` con zod) usados por vistas, mocks msw y DTOs NestJS → cambiar de mock a API no toca las vistas.
- **SQLite con TypeORM** para arrancar sin infraestructura; migrar a PostgreSQL = cambiar el datasource.
- **IA intercambiable**: `PredictionProvider` (reglas por defecto, HTTP hacia el microservicio scikit-learn cuando exista).
- **Seguridad en servidor**: JWT + roles por endpoint; sin claves en el cliente.
- **Baja lógica siempre**: ningún catálogo se borra físicamente si tiene histórico; `DELETE` responde `BajaLogicaResponse` (ver `docs/api-contracts.md`).
- Los módulos del sistema anterior sin impacto en la tesis (Pasteurización, Personal) se retiraron de la navegación; el flag `enviarPasteurizacion` de merma se conserva como dato informativo.

Más detalle: `docs/implementation-summary.md`, `docs/qa-report.md`, `docs/figma-map.md`, `docs/design-system.md`.
