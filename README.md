# MES Yamboly

Sistema de ejecución de manufactura (MES) con analítica IA para Helatony's S.A.C. (Yamboly). Implementación en código, con alta fidelidad, del diseño Figma (Master Design System v2.3.1 · sección `MES · YAMBOLY`, 57 pantallas) sobre los **maestros reales** de la planta.

## Tecnologías
- **Frontend:** Next.js 15.3 (App Router) · React 19 · Tailwind v4 · TanStack Query · react-hook-form + zod · Recharts · Radix UI · lucide-react · msw 2 (mocks) · zustand (sesión).
- **Backend:** NestJS 11 · TypeORM + PostgreSQL 16 (Docker; SQLite como respaldo y en los e2e) · JWT (passport-jwt) + roles · class-validator · Swagger · exceljs · event-emitter.
- **Monorepo:** pnpm 11 workspaces + Turborepo · TypeScript estricto.

## Estructura
```
mes-yamboly/
├── apps/
│   ├── web/                 Frontend (Figma → código)
│   │   └── src/{app,layouts,features,components,services,mocks,hooks,config,styles}
│   └── api/                 Backend NestJS
│       ├── scripts/         extraer-maestros.mjs (dump → seeds/data/real/*.json)
│       │                    migrar-sqlite-a-postgres.ts (SQLite → PostgreSQL)
│       │                    sincronizar-produccion.ts + sincronizacion/ (planta real → MES)
│       └── src/{main.ts,config,common,database/{entities,seeds},modules/<dominio>}
├── docker-compose.yml       PostgreSQL 16 (`pnpm db:up`)
├── packages/
│   ├── ui/                  @mes/ui — Design System (tokens MDS + 45 componentes)
│   ├── types/                @mes/types — contratos front↔back (tipos + zod)
│   ├── shared/               @mes/shared — formatters es-PE, OEE, KPIs de tesis
│   └── config/               @mes/config — tsconfig base
└── docs/                     contratos, mapa Figma, design system, QA, resumen de implementación,
                            plan-modulo-ia-analitica.md
```
Capa de datos del frontend: `UI → hooks (TanStack Query) → features/<dominio>/api.ts → services/api/client → mock (msw) | API NestJS`. Las vistas nunca importan mocks.

## Requisitos
Node ≥ 20 (probado con 22) · pnpm 11 (`corepack enable pnpm`) · **Docker** (probado con 29) para PostgreSQL · en macOS, Xcode CLT si `sqlite3` no encuentra prebuilt.

## Instalación y ejecución
```bash
pnpm install
pnpm db:up      # PostgreSQL 16 en Docker (espera a que el healthcheck pase a healthy)
pnpm dev        # web http://localhost:3000 · api http://localhost:4000/api/v1 · Swagger http://localhost:4000/docs
```
`pnpm dev` compila `@mes/types`/`@mes/shared` en watch, arranca Next y Nest; si la base está vacía el backend la siembra con los datos maestros reales (`SeedOnBootService`).

Si `sqlite3` falla con `Could not locate the bindings file`:
```bash
cd node_modules/.pnpm/sqlite3*/node_modules/sqlite3 && npm run install
```

**Tras cambiar entidades de TypeORM** (nuevas columnas, tablas): `synchronize: true` **no borra columnas existentes**, así que hay que forzar la resiembra antes de levantar la API de nuevo:
```bash
pnpm --filter @mes/api seed     # Postgres: vacía las tablas y resiembra · SQLite: borra el archivo y resiembra
```

## Base de datos (PostgreSQL en Docker)
La API es **multi-motor**: `apps/api/src/database/data-source.ts` elige el driver con una sola regla — si `DATABASE_URL` está definida usa **PostgreSQL**, si no cae a **SQLite**. Los e2e fuerzan `DATABASE_URL=''` + `DB_PATH=':memory:'`, así que siguen corriendo en SQLite en memoria sin Docker.

`docker-compose.yml` (raíz) levanta `postgres:16-alpine` con base `mes_yamboly`, usuario `mes`, contraseña `mes_dev`, puerto `5432:5432`, volumen nombrado `mes_pgdata`, `healthcheck` con `pg_isready` y `restart: unless-stopped`.

```bash
pnpm db:up      # docker compose up -d postgres
pnpm db:logs    # seguir el log del contenedor
pnpm db:down    # parar (el volumen mes_pgdata se conserva)
docker compose down -v   # parar y BORRAR los datos
```

En `apps/api/.env` (ver `.env.example`):
```bash
DATABASE_URL=postgres://mes:mes_dev@localhost:5432/mes_yamboly
DB_PATH=./data/mes.sqlite   # respaldo; sólo se usa si DATABASE_URL está vacía o comentada
```

### Migrar los datos de SQLite a PostgreSQL
`apps/api/scripts/migrar-sqlite-a-postgres.ts` copia una base SQLite existente a PostgreSQL conservando los ids: crea el esquema con `synchronize`, copia tabla por tabla en el orden de `entities/index.ts` en lotes de 500 con `ON CONFLICT DO NOTHING` (re-ejecutable sin duplicar) e imprime al final la tabla `entidad | sqlite | postgres`, fallando si algún conteo difiere.

```bash
pnpm db:up
pnpm db:migrar                                   # o: pnpm --filter @mes/api migrar:pg
pnpm db:migrar -- --reset                        # vacía PostgreSQL antes de copiar
pnpm db:migrar -- --sqlite=./data/otra.sqlite --url=postgres://…   # orígenes/destinos alternativos
```

### Volver a SQLite
Comenta `DATABASE_URL` en `apps/api/.env` y reinicia `pnpm dev`: la API vuelve a `DB_PATH` y siembra el archivo si no existe. El SQLite anterior sigue intacto en `apps/api/data/mes.sqlite` (el script de migración lo abre con `synchronize: false` y nunca lo modifica).

### Consultar la base
```bash
docker exec -it mes-postgres psql -U mes -d mes_yamboly
```
Nota: los identificadores llevan mayúsculas (`"lineaId"`, `"respondidaEn"`), así que en `psql` hay que entrecomillarlos.

## Modos de datos
| Modo | `apps/web/.env.local` | Uso |
|---|---|---|
| **mock** (por defecto) | `NEXT_PUBLIC_DATA_SOURCE=mock` | Navegar toda la app sin backend (msw intercepta en el navegador; datos deterministas y mutables en sesión, calcados de `apps/api/src/database/seeds/data`) |
| **api** | `NEXT_PUBLIC_DATA_SOURCE=api` + `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` | Contra NestJS + PostgreSQL (persistente, JWT real) |

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

## Sincronización con la producción real
`pnpm sync:real` (o `pnpm --filter @mes/api sincronizar`) trae de la base del sistema **en producción** —`yamboli-back`, Strapi 5 sobre PostgreSQL `sitemaster`— las últimas jornadas de planta y **reemplaza** con ellas los datos de producción sembrados. Es la diferencia entre navegar una demo y navegar la planta: Tiempo real muestra el turno de hoy con sus OF, maquinistas y paradas abiertas; Órdenes, las OF reales del último mes con sus paradas y mermas; Reportes, el OEE calculado sobre esos mismos registros.

```bash
pnpm sync:real                        # últimos 30 días hasta hoy
pnpm sync:real -- --desde=2026-08-01 --hasta=2026-08-31
pnpm sync:real -- --simular           # lee y mapea, no escribe nada (dry run)
pnpm sync:real -- --desde=2026-03-01 --hasta=2026-08-27 --simular --informe=sync-180-dry.json
pnpm sync:real -- --desde=2026-03-01 --hasta=2026-08-27 --agregados-dias=30 --informe=sync-180.json
pnpm sync:real -- --sin-agregados     # no recalcula las tablas de Reportes
pnpm sync:real -- --tiempos-tri       # vuelca los eventos en la hoja del TRI (ver abajo)
```

- **Ventana reproducible:** `--dias` vale 30 por defecto. Si supera 60 es obligatorio indicar `--desde` y `--hasta`; `--desde` tampoco se acepta solo. Así una ventana usada para ML no cambia según el día de ejecución.
- **Opciones de control:** `--agregados-dias=30` limita la foto pre-agregada de Reportes a los últimos 30 días de la carga; `--informe=ruta.json` guarda `{ ventana, comando, conteos, incidencias[motivo][mes], altas, verificaciones }`; `--costo-merma=9.5`, `--sin-agregados` y `--tiempos-tri` conservan el comportamiento descrito arriba.
- **Conexión al origen:** `--origen=postgres://…`, si no `ORIGEN_DATABASE_URL`, y si no las claves `DATABASE_*` del `.env` de `yamboli-back` (`ORIGEN_ENV_YAMBOLI_BACK`, por defecto `../../../yamboli-back/.env`). La sesión usa `application_name=mes-sync`, es **sólo lectura**, aplica límites de consulta/bloqueo y extrae las cinco consultas bajo un único snapshot `REPEATABLE READ`. El log muestra la zona horaria de PostgreSQL y la conexión se cierra antes de tocar el destino.
- **Orden operativo obligatorio para una carga:** (1) `pnpm simular -- --revertir`; (2) respaldo recuperable del MES, por ejemplo `pg_dump "$DATABASE_URL" --format=custom --file=mes-antes-sync.dump`; (3) el mismo comando de ventana con `--simular --informe=…`; (4) revisar el informe y ejecutar la carga quitando únicamente `--simular`. No se debe omitir el respaldo: la sincronización reemplaza las seis tablas indicadas abajo.
- **Qué se trae** (sólo lo que el MES ya modela; el origen guarda mucho más):

  | Origen (Strapi) | MES |
  |---|---|
  | `orden_fabricacion_dbs` + `orden_fabricacions` | `orden_fabricacion` |
  | `paradas` | `parada` |
  | `calidads` | `merma` |
  | `rendimientos` | `registro_velocidad` |

- **Reemplaza, no acumula:** cada corrida vacía `orden_fabricacion`, `parada`, `merma`, `registro_velocidad`, `audit_event` y `deteccion_iot`, e inserta la ventana pedida. Es idempotente: volver a ejecutarlo deja el mismo resultado.
- **Verificación y aborto:** el reemplazo, los conteos y las validaciones ocurren en una sola transacción; cualquier fallo revierte todo. Se aborta si los conteos insertados no coinciden, alguna fecha cae fuera de la ventana, queda una orden abierta anterior a `hasta − 1 día`, se descarta más de 0,5 % de las órdenes, se intenta dar de alta una causa distinta de `PN-04-SC`, las paradas `PN-04-SC` superan 1 % global o 2 % en cualquier mes, o las mermas descartadas por causa nula superan 3 % global o 5 % en cualquier mes.
- **Catálogos:** se resuelven contra el maestro real que ya vive en el MES (línea por nombre, producto por código, causas por `codigoLegado` y nombre). Lo que el origen usa y el maestro aún no conoce se da de alta y se lista al final de la corrida — así aparecieron los 15 maquinistas y supervisores reales, la causa `PS-05-09` y `PN-04-SC`.
- **Conversiones y criterios** (documentados en `apps/api/scripts/sincronizacion/`):
  - El origen trabaja en **cajas** y el MES en **unidades**: todo se multiplica por `unidadesPorCaja`. La velocidad estándar pasa de u/h a u/min.
  - Las horas de negocio del origen (`hora_inicio`, `hora_fin`, `hora`) están en hora de Lima; `created_at` en UTC. De la diferencia entre ambas sale `tiempoRegistroSeg`, el KPI de tiempo de registro (TRI).
  - El OEE de las órdenes cerradas es el que publica el sistema real. Las órdenes aún abiertas llegan sin desempeño ni calidad calculados, así que se completan con `computeOee` del propio MES sobre datos igualmente reales (unidades de la codificadora, minutos transcurridos, paradas con impacto, kg de merma).
  - Las paradas que el origen cerró **sin categorizar** no se descartan: van a la causa `PN-04-SC · Sin categorizar`, para no falsear la disponibilidad y dejar el hueco a la vista. Si `tiempo` viene nulo, `duracionMin` se reconstruye como `fin − inicio` y la incidencia queda en el informe mensual.
  - `tipo_mermas` del origen clasifica por **destino** (recuperable / reproceso / desperdicio) y el MES por **estado del material** (MP / EP / PT). La correspondencia está en `mapeo.ts` y el nombre original se conserva en `observacion`, así que la traducción es reversible.
  - La línea `MIXPLANT 2` (pasteurización) y las OF planificadas que nunca se ejecutaron quedan fuera: no tienen representación en el MES.
- **Reportes** se recalcula al final de cada corrida (`sincronizacion/agregados.ts`): las pestañas Paradas y Mermas leen tablas pre-agregadas, acotadas por `--agregados-dias` (30 por defecto), no todo el histórico transaccional. La pestaña **Indicadores** es la excepción — desde `reports-oee.ts` se calcula sobre las órdenes y paradas de la ventana pedida (ver abajo).
- **Hoja del TRI (Anexo 02), desactivada por defecto:** `--tiempos-tri` vuelca los eventos importados en `registro_tiempo`. No se hace por defecto porque mide otra cosa: el MES cronometra el formulario (RF14) y el sistema anterior sólo guarda la hora declarada del evento y el `created_at` de la fila, así que lo medible es la **latencia hasta el registro** (220,8 min de media, 97,8 de mediana sobre 668 paradas). Contarla como postest del MES convierte el 86,2 % de reducción frente al pretest manual en un «no cumple». El indicador se puebla registrando paradas desde el propio MES.
- **Lo que sigue sembrado:** `alerta`, `prediccion` y `modelo_version` —es decir, las vistas **Alertas** y **Analítica IA**— no vienen del sistema real porque allí no existen. El plan para sustituirlas por un módulo de IA entrenado con estos datos está en `docs/plan-modulo-ia-analitica.md`.

## Variables de entorno
- `apps/web/.env.local` (ver `.env.example`): `NEXT_PUBLIC_DATA_SOURCE`, `NEXT_PUBLIC_API_URL`.
- `apps/api/.env` (ver `.env.example`): `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL` (PostgreSQL; si está definida manda sobre `DB_PATH`), `DB_PATH` (respaldo SQLite), `CORS_ORIGIN`, `SWAGGER_PATH`, `PREDICTION_SERVICE_URL` (microservicio Python opcional; sin él se usan reglas), `PREDICTION_TIMEOUT_MS`, `ORIGEN_DATABASE_URL` y `ORIGEN_ENV_YAMBOLI_BACK` (origen de `pnpm sync:real`).

## Scripts
| Comando | Qué hace |
|---|---|
| `pnpm dev` | web + api en paralelo |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:logs` | PostgreSQL 16 en Docker: levantar / parar / seguir el log |
| `pnpm db:migrar` | copia `apps/api/data/mes.sqlite` a PostgreSQL (`--reset` para vaciar antes) |
| `pnpm sync:real` | trae la producción real de `yamboli-back` (30 días por defecto) y recalcula Reportes |
| `pnpm simular` | genera el conteo de línea para demostraciones (`--revertir` lo deshace) |
| `pnpm build` | build de todos los paquetes |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint en todo el monorepo |
| `pnpm --filter @mes/api test:e2e` | tests e2e (SQLite en memoria, sin Docker), incluye `catalogs-crud` y `users` sobre el maestro real |
| `pnpm seed` / `pnpm --filter @mes/api seed` | regenera la base (PostgreSQL o SQLite, según `DATABASE_URL`) con los datos maestros reales |
| `pnpm --filter @mes/web dev` / `--filter @mes/api dev` | una sola app |
| `node apps/api/scripts/extraer-maestros.mjs` | regenera `seeds/data/real/*.json` desde el dump Postgres (requiere `pg_restore`) |

## Exponer la aplicación (mes.yamboly.lat)
El frontend habla con la API **a través del propio servidor de Next**: `NEXT_PUBLIC_API_URL=/api/v1` y un `rewrites` en `apps/web/next.config.ts` reenvía `/api/v1/*` a `API_PROXY_URL` (por defecto `http://localhost:4000`). Como la petición sale del mismo origen que la página, **no hay CORS que ajustar**: ni en local, ni detrás de un túnel, donde el navegador ve el dominio público y el backend sigue escuchando en `localhost`. Un único túnel basta para servir la aplicación y la API.

```bash
cloudflared tunnel --config ~/.cloudflared/mes-yamboly.yml run mes-yamboly
```

El túnel con nombre ya está creado y su `ingress` apunta a `http://localhost:3000`:

```yaml
tunnel: 8b1444e4-d7b6-4d14-b47b-ea492fe20d52
credentials-file: ~/.cloudflared/8b1444e4-….json
ingress:
  - hostname: mes.yamboly.lat
    service: http://localhost:3000
  - service: http_status:404
```

Notas:
- Los túneles rápidos (`cloudflared tunnel --url …`, dominios `trycloudflare.com`) no funcionaron: registran una sola conexión y el nombre devuelve 404. El túnel con nombre registra las cuatro y responde de inmediato.
- `CORS_ORIGIN` de `apps/api/.env` ya incluye `https://mes.yamboly.lat`; con el proxy no interviene, pero deja la puerta abierta a apuntar el navegador directamente a la API.
- Con `pnpm dev` el proxy también funciona en local, así que no hay que cambiar nada al pasar de local a dominio.

## Conteo de línea para demostraciones
`pnpm simular` genera el pulso que en planta publican los sensores de línea, que hoy están desconectados. Sin ese pulso, «Tiempo real» enseña tarjetas a 0 unidades y no se puede mostrar cómo se comporta la aplicación mientras una línea produce.

```bash
pnpm simular                          # cuenta cada 5 s hasta Ctrl+C
pnpm simular -- --oee=85 --avance=50  # otro objetivo y otro punto de arranque
pnpm simular -- --sin-paradas         # aparta las paradas de la orden (ver abajo)
pnpm simular -- --una-vez             # una sola lectura
pnpm simular -- --revertir            # deja las órdenes como estaban
```

Cómo se comporta:
- **Sólo cuentan las líneas con una orden `en_curso`**. Una línea sin orden no suma nada, igual que en planta.
- Con una **parada abierta** el contador se congela y no se registra velocidad: la línea está detenida.
- En la primera lectura recoloca la orden sobre el momento actual —calcula la ventana que necesita para el avance pedido al OEE objetivo y desplaza `inicio` junto con sus paradas y mermas, los mismos minutos— para que la cronología del turno cuadre. Las órdenes que llegan del sistema real vienen de una jornada ya avanzada: su plan se completa en una fracción del turno y nadie las cerró, así que sin recolocarlas el reloj corre sobre una ventana enorme y el desempeño se hunde.
- A partir de ahí el contador **sigue** al ritmo objetivo en lugar de perseguirlo a saltos, con un vaivén suave, y nunca entra más de lo que la línea daría en esos segundos.
- Cada ~18 min deja una lectura de velocidad, que es lo que la tarjeta muestra en «VELOCIDAD».
- Cuando una orden alcanza su plan **la cierra y pone en curso la siguiente** de la misma línea y jornada, como haría el maquinista. Si la línea se queda sin órdenes pasa a «Sin orden», que es como acaba un turno. Las candidatas son las OF que el sistema real dejó `incompleta`; las que nunca llegaron a ejecutarse no se sincronizan, así que una línea sin ellas se apaga al terminar su OF.

`--sin-paradas` existe porque hay órdenes cuyo plan vale menos tiempo del que ya perdieron en paradas: la OF de la Extrusora 3, por ejemplo, tiene 228 min de paradas registradas contra un plan que son 192 min de trabajo. Ninguna simulación del conteo puede hacer que esa línea marque 90 % sin apartar esas paradas, así que la opción es explícita y no el comportamiento por defecto.

**Qué toca y cómo se deshace.** Escribe en las mismas columnas que alimentaría el sensor (`producido`, `conteoCodificadora`, `oee` y `registro_velocidad`) y, al recolocar, en `inicio` y en las horas de paradas y mermas. Antes de modificar nada guarda los valores originales en `apps/api/data/simulacion-sensores.json` —fuera de la base y fuera del repositorio—, así que `--revertir` lo deja todo como estaba. Conviene revertir, o volver a ejecutar `pnpm sync:real`, antes de usar los datos para cualquier cálculo que tenga que ser real.

## Fotos de evidencia
Las causas de parada y de merma pueden exigir una foto (`requiereEvidencia`). Hasta ahora el asistente la pedía y la validaba en el navegador, pero **el archivo no salía de ahí**: sólo viajaba `file.name`. Ahora se guarda de verdad.

- `POST /api/v1/evidencias` (multipart, ≤ 8 MB, jpg/png/webp/heic) guarda la foto en `apps/api/data/evidencias/` —carpeta en `.gitignore`, como la de exportaciones— y devuelve la ruta con la que se referencia. El nombre en disco lo pone el servidor (`EV-<AAAAMMDD>-<8 hex>.<ext>`), nunca el cliente.
- `GET /api/v1/evidencias/:archivo` la sirve con su tipo de imagen. Va autenticado, así que la UI la abre pidiéndola con el token y mostrando el blob, no con un `<a href>` (`abrirArchivo`).
- La ruta se guarda en `parada.evidenciaUrl`, `merma.evidenciaUrl` y `orden_fabricacion.evidenciaUrl` (las tres columnas se usaban a medias o no existían). En el detalle de la orden aparece como «Ver foto» en las pestañas Paradas y Mermas.
- La foto **se sube al elegirla**, no al enviar el formulario: si falla la red, el maquinista se entera antes de perder lo que lleva escrito.
- Si la causa marca `requiereEvidencia`, la API rechaza el alta sin foto (422) y comprueba que el archivo exista en el almacén. Hoy ninguna causa del maestro real lo exige, así que la regla queda latente hasta que se active una desde Configuración.
- Se guarda en disco y no en la base porque una foto de móvil ronda los megas: en una columna `bytea` inflaría cada copia de seguridad.

## Formatos de exportación
Sólo se genera **XLSX**. El servicio escribía siempre un XLSX y lo entregaba con la extensión pedida, de modo que elegir PDF o CSV producía un archivo que ningún programa abría. Ahora:

- La API rechaza con 422 cualquier formato que no sepa escribir (`FORMATOS_EXPORT_DISPONIBLES` en `@mes/types`).
- La descarga toma el nombre y el `Content-Type` de la **extensión real del archivo**, no del formato del trabajo.
- Reportes › Exportar ofrece sólo XLSX; Evidencia › Exportar cambia el selector de formato por el de **destino** (SPSS / informe), que es la opción que de verdad cambia la salida (booleanos 1/0 frente a Sí/No).
- `FORMATOS_EXPORT` se conserva completo porque el histórico guarda trabajos antiguos en CSV y PDF; esos siguen listándose pero no son descargables.

## Reportes: indicadores por ventana
`GET /reportes/indicadores` (pestaña Indicadores de `/reportes` y gráfico dominante del Home) **se calcula sobre `orden_fabricacion` y `parada` de la ventana pedida**, no sobre las tablas pre-agregadas. El resto de Reportes (Paradas, Mermas) sigue leyendo la foto agregada, que no tiene periodo.

El motivo: `indicador_linea`, `indicador_turno` e `indicador_kpi` son una foto única que se regenera entera en cada siembra o sincronización y no sabe de periodos. Servirla tal cual hacía que «OEE por línea — turno actual» del Home mostrara las 9 líneas del mes aunque hoy sólo estuvieran produciendo 4, y que el selector de periodo no cambiara nada salvo la tendencia diaria.

Consecuencias:
- Sólo aparecen las líneas y los turnos **con órdenes dentro de la ventana**.
- Los KPI, la tendencia diaria, el OEE por línea y la comparativa por turno salen todos del mismo cálculo (`computeOee`), así que ya no pueden discrepar entre sí.
- El delta «vs periodo anterior» compara con la ventana inmediatamente anterior de la misma longitud.
- Una orden que quedó abierta se acota al cierre de su turno (`finDeTurno` en `@mes/shared`): sin ese tope acumulaba como tiempo planificado todos los días transcurridos desde que se inició.
- `indicador_linea` e `indicador_turno` ya no los lee nadie; se siguen escribiendo por compatibilidad, pero son candidatos a retirarse.

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
12 módulos (auth, users, catalogs, orders, downtimes, scrap, speeds, realtime, reports, alerts, analytics, evidence — este último con 2 controllers, `evidence` + `survey` para la encuesta pública) en **13 archivos `*.controller.ts`** con **98 endpoints** bajo `/api/v1` (`grep -c -E "@(Get|Post|Patch|Delete|Put)\(" apps/api/src/modules/**/*.controller.ts`), respuestas `{ data, meta }` para colecciones y errores `{ statusCode, code, message, details }`. **131 pruebas e2e en 8 suites** (`pnpm --filter @mes/api test:e2e`). Contrato completo en `docs/api-contracts.md`; Swagger en `/docs`.

## Mocks
`apps/web/src/mocks/{data,handlers,store.ts}`: mismos datos que los seeds del backend (maestro real: 9 líneas, 41 sabores, 201 productos, 333 velocidades, causas de parada y de merma en árbol, turnos `D`/`N`, alertas, modelo v3.2, instrumentos TRI/TCI/TSP/CFS/EP — postest vacío por diseño, ver "Evidencia de tesis" abajo). Errores simulables con `?__error=500` en cualquier llamada.

## Evidencia de tesis

`/evidencia` (`apps/web/src/features/evidence`) sustenta los 5 KPI del experimento (TRI/TCI/TSP/CFS/EP, Anexos 02–06). Desde la fase 3 (4-sep-2026) el **postest** ya no se siembra con datos hipotéticos: cada instrumento arranca vacío (`estado: 'sin_datos'`, `valor: null`) y se llena con uso real del sistema. Sólo se conserva el **pretest** del TRI (10 registros medidos a mano, 2,9 min).

| KPI | Cómo se llena | Endpoint clave |
|---|---|---|
| **TRI** | Automático: cada captura (parada, merma, velocidad, orden) emite `evidence.tri.registro` y agrega una fila al postest. El pretest se carga aparte. | `GET /evidencia/tri` · `POST /evidencia/tri/pretest` |
| **TCI** | Validación contra 3 fuentes externas **importadas** (sensores, solicitudes, transferencias SAP; sin integración en vivo): campos completos, coherencia con sensores, n.º de solicitud, transferencia SAP, según el tipo de registro. Override manual por criterio con justificación. | `POST /evidencia/tci/validar` · `GET /evidencia/tci` · `PATCH /evidencia/tci/:id` |
| **TSP** | Invitaciones nominales con token de un solo uso → encuesta pública `/encuesta/[token]` (8 ítems Likert 1–5), fuera del shell y sin JWT. | `POST /evidencia/tsp/invitaciones` · `GET/POST /encuesta/:token` |
| **CFS** | Checklist de 9 funcionalidades que el investigador marca a mano en la web, viendo la pantalla que evidencia cada requisito. | `PATCH /evidencia/cfs/:id` |
| **EP** | Se crea al confirmar una alerta en `/alertas` (acertó o no); las alertas «confirmadas» de demostración del seed no cuentan como evidencia. | `POST /alertas/:id/confirmar` |

**Importadores y plantillas** (`ImportarFuenteModal.tsx`, `ValidarTciModal.tsx`, `RevisarEvaluacionDrawer.tsx`): se descarga una plantilla XLSX por fuente (`plantilla-sensores.xlsx`, `plantilla-solicitudes.xlsx`, `plantilla-transferencias-sap.xlsx`, generadas con `exceljs`; en mock con `xlsx`/SheetJS en el navegador), se llena y se sube (.xlsx/.csv ≤ 5 MB). Cada importación **acumula** filas —no reemplaza—, ignora duplicados exactos y registra quién/cuándo/archivo/filas ok-rechazadas. Fechas y números se leen en varios formatos (Excel, ISO, latina dd/mm/aaaa; coma o punto decimal); las filas con problema se listan con el motivo y el n.º de fila.

**Tolerancias** de la validación TCI (± minutos en tiempos, ± % en cantidades/velocidad, ± días en fecha SAP; por defecto 5 min / 5 % / 1 día) se editan en Configuración › Umbrales de alerta › sección "Validación de calidad (TCI)".

Contrato completo (endpoints, modelo `EvaluacionTCI`/`CriterioTCI`, reglas con ejemplos, columnas de cada plantilla): `docs/api-contracts.md` (sección "evidence").

## Decisiones de arquitectura
- **Design System en código antes que las vistas** (`@mes/ui`), tokens 1:1 con las variables de Figma; reglas MDS codificadas (la página es el contenedor, cards solo funcionales, sombras solo en flotantes, un Primary por pantalla, Danger con confirmación).
- **Contratos compartidos** (`@mes/types` con zod) usados por vistas, mocks msw y DTOs NestJS → cambiar de mock a API no toca las vistas.
- **PostgreSQL 16 en Docker con TypeORM**, y un **datasource multi-motor** (`opcionesDataSource`) que cae a SQLite cuando no hay `DATABASE_URL`: los e2e siguen corriendo en memoria y sin Docker, y la app arranca igual en una máquina sin contenedores. Las columnas usan sólo tipos portables (`text`, `integer`, `double precision`, `boolean`, `simple-json`) y los nombres de tabla son explícitos en español, sin palabras reservadas.
- **IA intercambiable**: `PredictionProvider` (reglas por defecto, HTTP hacia el microservicio scikit-learn cuando exista).
- **Seguridad en servidor**: JWT + roles por endpoint; sin claves en el cliente.
- **Baja lógica siempre**: ningún catálogo se borra físicamente si tiene histórico; `DELETE` responde `BajaLogicaResponse` (ver `docs/api-contracts.md`).
- Los módulos del sistema anterior sin impacto en la tesis (Pasteurización, Personal) se retiraron de la navegación; el flag `enviarPasteurizacion` de merma se conserva como dato informativo.

Más detalle: `docs/implementation-summary.md`, `docs/qa-report.md`, `docs/figma-map.md`, `docs/design-system.md`.
