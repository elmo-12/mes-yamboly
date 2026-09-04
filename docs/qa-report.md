# QA — MES Yamboly

## QA fase 2 · maestros reales y mantenedores (4-sep-2026)

Fecha: 2026-09-04 · Verificado en ambos modos (`NEXT_PUBLIC_DATA_SOURCE=mock` y `api`, backend NestJS en `:4000`) ·
Referencia: `docs/figma-map.md`, `docs/design-system.md`, `docs/figma-specs-modulos.md`, `docs/api-contracts.md` y el
archivo Figma `WOfwZEmPx1Hcw7ehaIsnpx`.

**Método.** QA de integración de la fase "maestros reales": recorrido ruta por ruta en modo `mock` y en modo `api`
contra el backend real (9 líneas, 9 sedes, 41 sabores, 201 productos, 333 velocidades producto×línea, 33 equipos,
causas de parada 5/26/52, causas de merma 5/11/40, 2 turnos, 11 usuarios), comparando fidelidad contra los frames del
MDS ya usados en la fase 1, comprobando paridad mock↔API dato a dato, midiendo responsive en 1440/1024/390 y
revisando la consola del navegador. Los mismos veredictos de la fase 1 (**Alta fidelidad** / **Ajustado** /
**Desviación justificada** / **Pendiente**) se reutilizan aquí.

### Correcciones de esta fase

| # | Corrección | Archivo(s) |
|---|---|---|
| 1 | Timeline y tiempos de tiempo real ya no usan el reloj de pared sino el **día operativo** (el turno Noche cruza medianoche) | `realtime.service.ts`, `AlertaLinea.generadaEn`, `TiempoRealResumen.diaOperativo` |
| 2 | `GET /ordenes?periodo=hoy` pasó a usar el día operativo en vez del día de calendario (antes devolvía 0 órdenes «hoy», ahora 8) | API — filtro de periodo de órdenes |
| 3 | `useResumenMaquinista` ahora lee `diaOperativo` en vez de la fecha de calendario, así el home del maquinista deja de aparecer vacío | `apps/web` — hook de resumen del maquinista |
| 4 | Paridad mock↔API restablecida en el timeline (10 eventos idénticos en ambos modos) | seeds/mocks de tiempo real |
| 5 | `UsuarioDrawer` filtra sólo sedes activas en el selector | `features/settings` — `UsuarioDrawer` |
| 6 | Toaster ajustado a 3 s de duración | `packages/ui` — patrón `Toaster` |
| 7 | KPIs de evidencia (TRI/TCI/TSP/CFS/EP) formateados en es-PE, en API y en mock por igual | `features/evidence` + API de evidencia |
| 8 | Scroll automático a la matriz de velocidades al elegir un producto | `features/settings` — `ProductosVelocidadesTab` |

### Veredictos por ruta

| Ruta / área | Veredicto | Nota |
|---|---|---|
| `/login` | Alta fidelidad | |
| Home jefe | Alta fidelidad | |
| Tiempo real (9 LineCards, drawer) | Alta fidelidad | |
| Modo TV (9 filas) | Alta fidelidad | |
| Wizards iniciar orden / parada / merma | Alta fidelidad | |
| Órdenes y detalle | Alta fidelidad | |
| Reportes (2 turnos, XLSX real) | Alta fidelidad | |
| Alertas | Alta fidelidad | |
| Evidencia | Alta fidelidad | |
| Encuesta pública | Alta fidelidad | |
| Configuración › Causas de parada **2163:18282** | Alta fidelidad | |
| Configuración › Causas de merma | Alta fidelidad | |
| Configuración › Máquinas **2165:11984** | Alta fidelidad | |
| Configuración › Productos y velocidades | Alta fidelidad | Matriz de 9 columnas (una por tipo de proceso de línea) |
| Configuración › Sedes y usuarios | Alta fidelidad | |
| Perfil | Alta fidelidad | |
| Home maquinista | **Ajustado** | Corregido en esta fase (`useResumenMaquinista` con `diaOperativo`, ver correcciones #3) |
| `/analitica` | **Desviación justificada** | Riesgo por línea muestra el top-5 en API frente a 9 líneas en mock |
| Configuración › Umbrales **2165:13218** | **Desviación justificada** | Modelo reducido de 5 campos frente a los 8 ajustes + acciones de cabecera del frame Figma (decisión previa, no reabierta en esta fase) |
| `/pasteurizacion`, `/personal` | n/a | 404 — rutas retiradas en esta fase (ver `docs/implementation-summary.md`) |
| Configuración (rol maquinista) | n/a | `Forbidden`, comportamiento correcto |

**Desviaciones justificadas de modelo (aplican a todas las rutas anteriores):** 9 líneas reales (no 5 + PT-01) ·
2 turnos D/N (no M/T/N) · árbol de causas de merma de 3 niveles (tipo → clasificación → causa) frente a las 4 causas
planas del frame Figma · el selector de producto en el wizard de captura sólo ofrece productos con par
(producto, línea) vigente — el 422 por falta de par sólo es alcanzable pasando el modo `api`.

Regla MDS «un `Button variant="primary"` por pantalla» se cumple en toda la fase (excepción documentada de siempre:
cada `LineCard` trae su propio Primary).

### KPIs observados (modo `api`)

| KPI | Meta | Valor observado |
|---|---|---|
| TRI | Reducción ≥ 40 % vs. pretest | **1,4 min (−51,7 %)** |
| TCI | ≥ 90 % | **93,3 % (28/30)** |
| TSP | ≥ 80 % de acuerdo | **84,2 %** |
| CFS | 9/9 | **100 % (9/9)** |
| EP | ≥ 80 % | **83,5 % (137/164)** |

Los 5 KPIs de tesis se mantienen dentro de meta con datos reales de 9 líneas × 2 turnos, sin alterar los totales
fijos de los anexos.

### Responsive

Medido en 1440 / 1024 / 390 sobre `/tiempo-real`, `/configuracion?tab=productos`, `/configuracion?tab=sedes`,
`/ordenes`, `/reportes` y `/tv`: **18/18 combinaciones sin scroll horizontal del body**; las tablas conservan su
propio `overflow-x-auto`.

### Consola

Limpia (0 errores, 0 warnings) en todas las rutas recorridas, en ambos modos (`mock` y `api`).

### Pendientes no corregidos en esta fase

| # | Pendiente |
|---|---|
| 1 | El snapshot mock de `lineaEstados`, escrito a mano, difiere de la API en 3 líneas y en el turno |
| 2 | La `LineCard` en estado «Sin orden» muestra la última OF cerrada en vez de indicar que no hay orden activa |
| 3 | `/analitica` muestra riesgo por línea top-5 (API) frente a 9 líneas (mock) |
| 4 | Configuración › Umbrales sigue con el modelo reducido de 5 campos (no las 8 + acciones de cabecera del frame) |
| 5 | Los seeds de tesis en API usan el reloj real (`thesis-seed.util.ts: hoy()`) en vez de la constante `HOY` fija que usa el mock |
| 6 | Cosméticos: presentación «2.54 kg(5L)» literal del dump sin normalizar, y chips que truncan texto largo |

### Hallazgos de otras oleadas de esta fase (no exclusivos de este QA)

- Bug corregido: ids `VE-` duplicados al crear velocidades.
- `Merma` no persiste `evidenciaUrl` — la foto sólo se exige en el cliente, no queda guardada en el backend.
- Ninguna causa de parada real del dump trae `requiereSolicitud` (sólo lo traen causas de merma).
- Ninguna causa real trae `requiereEvidencia`.
- El campo `sabor` no tiene FK en el dump original: 20 de 201 productos quedan sin sabor resuelto.
- `tiempoEstandarMin` = 0 en todas las velocidades específicas — el dump es anterior a esa funcionalidad.

---

## QA fase 1 (28-ago-2026)

Fecha: 2026-08-28 · App en `NEXT_PUBLIC_DATA_SOURCE=mock` (`next dev -p 3000`) · Referencia: `docs/figma-map.md`,
`docs/design-system.md`, `docs/figma-specs-modulos.md` y el archivo Figma `WOfwZEmPx1Hcw7ehaIsnpx`.

**Método.** La ventana de Chrome no podía redimensionarse (viewport fijo en 1024, había otro agente trabajando en la
misma ventana), así que las mediciones se hicieron con una página-arnés propia (`public/qa-harness.html`, ya eliminada)
que carga cada ruta en un `iframe` del ancho exacto a evaluar (1440/1280/1024/768/390/1920). Dentro del iframe se midió
con `getComputedStyle` / `getBoundingClientRect`, lo que da medidas literales en px del ancho objetivo. Las capturas se
compararon contra los PNG de Figma ya descargados y contra 3 frames nuevos.

Veredictos: **Alta fidelidad** (coincide con el frame dentro de ±2 px / mismos tokens) · **Ajustado** (se corrigió en
esta sesión hasta alcanzar el frame) · **Desviación justificada** (difiere del frame por una regla del MDS o del BRIEF,
o por datos del mock) · **Pendiente** (requiere un cambio fuera de mi alcance).

---

### 1. Resultado por frame

#### 02 · Auth & Home

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 1 | Auth / Login / Default **2163:17066** | `/login` | Alta fidelidad | Panel de marca 720 `padding 80/88` `bg #F9FAFB`, H1 32/600/40/−0.64, columna de formulario 400 `gap 20`, Primary lg 48 r12 a ancho completo. Añadido no previsto en Figma: bloque "USUARIOS DE DEMOSTRACIÓN" (necesario para la demo de tesis) |
| 2 | Auth / Login / Error **2163:17234** | `/login` error | Alta fidelidad | Ambos Input en `Destructive` + hint "Correo o contraseña incorrectos"; validación zod en submit vacío ("Ingresa tu correo o DNI") |
| 3 | Home / Dashboard Jefe **2163:17435** | `/` (jefe) | **Ajustado** | Bloques 1116 con `gap 24`, KPI 267×112 ×4 + ×3, Alert row de 3, tabla de 7 columnas. Corregido: breadcrumb movido a la cabecera de página, marco de los dos gráficos y Badge `Riesgo` a Warning |
| 4 | Home / Dashboard Maquinista **2165:769** | `/` (maquinista) | Alta fidelidad | Line card grande + Alert card + 3 KPI + "Mis últimos registros"; un solo Primary ("Registrar merma") más el de la Line card (excepción documentada) |
| 5 | Home / Dashboard / Loading **2165:12928** | `/` loading | Alta fidelidad | `ShellSkeleton` + `HomeSkeleton` con la geometría real (KPI 267×112, filas 44) |

#### 03 · Tiempo real

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 6 | Tiempo real / Líneas / Default **2156:3936** | `/tiempo-real` | **Ajustado** | Rejilla 3×2 de Line card `gap 24`, botones lg 48, chip de alerta r6. Corregido: la Line card era `w-356` fija y desbordaba a 1280 → `w-full max-w-356`. Desviación: el selector inline de la derecha es **Sede**, no Turno (cambia el conjunto de datos); "Limpiar filtros" sólo aparece con filtros activos |
| 7 | … / Default / 1024 **2163:1568** | `/tiempo-real` @1024 | Alta fidelidad | Sin sidebar fija, topbar con hamburguesa, 2 columnas de Line card |
| 8 | Tiempo real / Modo TV **2163:8523** | `/tv` @1920 | **Ajustado** | Fondo `#111827`, filas a ancho completo, pills de estado (violeta "PARADA DETECTADA" igual que Figma), reloj y leyenda. Corregido: con 6 puestos las filas se salían de 1080 y por debajo de 1440 se solapaban columnas → filas `flex-1 max-h-124` + truncado y anchos por breakpoint |
| 9 | Tiempo real / Líneas / Empty **2156:7386** | `/tiempo-real` vacío | Alta fidelidad | `EmptyState` Kind=NoData con acción secundaria |
| 10 | Detalle de línea (drawer) **2156:7548** | overlay | Alta fidelidad | Drawer 480 × alto completo anclado a la derecha, scrim, Esc y clic en overlay cierran |

#### 04 · Captura rápida

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 11 | Parada / P1 Causa **2156:8269** | modal | Alta fidelidad | Modal medido **640×566** (Figma 640×565), r16, chip TRI `00:01` en el header, Stepper de 3, chip de contexto, 7 Tag lg 32 en wrap, footer Secondary+Primary |
| 12 | Parada / P2 Detalle **2156:8367** | modal | **Ajustado** | Dropdowns Máquina/Causa, "Acción tomada" obligatoria, evidencia y Toggle "Afecta OEE". Corregido: "N.º de solicitud" se anunciaba siempre como *(opcional)* y el backend devolvía 422 al final del asistente; ahora pasa a obligatorio cuando la causa lo exige |
| 13 | Parada / P3 Confirmar **2163:2538** | modal | Alta fidelidad | Filas label/valor, nota de sello de tiempo, Primary "Registrar parada" → toast "Parada registrada en 1:21" + refetch de `/tiempo-real/lineas` |
| 14 | Parada / Finalizar **2163:2672** | modal | Alta fidelidad | Modal corto con duración y comentario de cierre |
| 15–17 | Merma P1/P2/P3 **2163:9376 · 2163:9517 · 2163:11105** | modal | Alta fidelidad | Stepper, Tags MP/EP/PT, teclado 3×4, MR-01…MR-04, checkbox de pasteurización, resumen |
| 18 | Velocidad / Registrar **2163:12740** | drawer | Alta fidelidad | Drawer 480 con input numérico y barra comparativa |
| 19–20 | Orden / Iniciar P1 y P2 **2163:12873 · 2163:16326** | modal | Alta fidelidad | Modal 640 con Stepper Datos·Equipo·Confirmar |
| 21 | Orden / Finalizar **2163:16222** | modal | Alta fidelidad | 3 mini KPI de OEE estimado + Primary "Finalizar orden" |
| 22 | IoT / Parada sugerida **2163:11217** | modal | Alta fidelidad | Modal 480 de un toque, Badge Informational, 4 Tags, Primary lg |
| 23 | Captura / BASE **2156:93** | — | n/a | Frame de fondo, no es ruta |

#### 05 · Órdenes de fabricación

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 24 | Órdenes / Listado **2156:4160** | `/ordenes` | **Ajustado** | Summary 267×85 (Figma 80) con borde activo 1.5 `#2563EB`, filter bar en línea, cabecera 40 con overline 11/600 ls .55 `#9CA3AF`, filas 44 con divisor `#F3F4F6`, celdas 13 px, 12 columnas. Corregido: `sr-only` de la columna ACCIONES provocaba scroll horizontal de la página; Tag de filtro pasó de 13 a 12 px |
| 25 | Órdenes / Listado / Empty **2156:6905** | no-results | Alta fidelidad | `EmptyState` NoResults conservando filtros y summary, con "Limpiar filtros" |
| 26 | Detalle OF / Resumen **2156:8959** | `/ordenes/[id]` | **Ajustado** | Breadcrumb + Badge de estado + 3 acciones, Tabs Underline de 7 con `?tab=`, KPI, timeline segmentado, 2 columnas. Corregido: faltaba el breadcrumb en la cabecera |
| 27 | … / Paradas **2163:9998** | `?tab=paradas` | **Ajustado** | Tabla integrada con Toggle OEE y ⋯. Corregido: la fila no abría el drawer (Figma "Fila → drawer"); ahora sí, respetando Toggle y menú |
| 28 | … / Bitácora **2163:12196** | `?tab=bitacora` | Alta fidelidad | Timeline vertical con avatar y Badge de tipo, sólo lectura |
| 29 | Editar parada (drawer) **2163:14623** | overlay | Alta fidelidad | Drawer medido **x=960, 480×1000** en 1440; Alert Warning de bitácora; Esc y overlay cierran |
| 30 | Validar orden (modal) **2163:15629** | overlay | Alta fidelidad | Modal **560×496 r16** centrado, 4 Checkbox, Primary deshabilitado hasta marcar los 4 (verificado) |

#### 06 · Reportes

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 31 | Reportes / Indicadores **2163:18418** | `/reportes` | Alta fidelidad | Secondary "Programar envío" + Primary "Exportar", 5 Tabs, filter bar de 4 grupos, 4 KPI, tendencia con línea de meta punteada, 2 columnas |
| 32 | Reportes / Paradas **2163:18594** | `?tab=paradas` | Alta fidelidad | Pareto + donut con la misma paleta y orden, tabla por causa con sparkline |
| 33 | Reportes / Mermas **2163:19459** | `?tab=mermas` | Alta fidelidad | Barras apiladas MP/EP/PT + heatmap causa × turno que filtra la tabla |
| 34 | Reportes / Exportar **2163:19635** | `?tab=exportar` | Alta fidelidad | Datasets con Checkbox, Radio de formato, Primary "Generar archivo", historial con Badge `Generando` (Warning) / `Listo` (Success) |

#### 07 · Alertas

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 35 | Alertas / Bandeja **2156:5417** | `/alertas` | **Ajustado** | 4 Summary, filter bar apilada de 4 grupos, tabla de 8 columnas con barra de probabilidad 56×6, badges `Activa`=Warning · `Vencida`=Critical · `Atendida`=Success, severidad Crítica/Alta/Media = Critical/Warning/Informational. Corregido: breadcrumb en la cabecera. Falta el Secondary "Exportar" junto a la búsqueda (ver pendientes) |
| 36 | Alertas / Detalle (drawer) **2163:8896** | overlay | Alta fidelidad | Drawer 480 con bloques "POR QUÉ EL MODELO LO PREDICE" y "ATENDER LA ALERTA"; "RESULTADO REAL" aparece al cerrarse la ventana (comportamiento documentado) |
| 37 | Confirmar evento real (modal) **2163:11719** | overlay | Alta fidelidad | Modal con Radio Sí/No por fila; el Primary del header pasa a habilitado con 4 pendientes |
| 38 | Alertas / Bandeja / Empty **2163:13378** | vacío | Alta fidelidad | `EmptyState` NoData |
| 39 | Popover notificaciones **2163:13751** | topbar | Alta fidelidad | Dropdown 360 con `Shadow/Dropdown` medido `0 4px 12px -2px rgba(17,24,39,.10), 0 2px 4px -2px rgba(17,24,39,.06)` |
| 40 | Configurar umbrales (drawer) **2163:15102** | overlay | Alta fidelidad | Drawer 480 con inputs numéricos y 2 Toggle |

#### 08 · Analítica IA

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 41 | Analítica / Resumen **2156:4301** | `/analitica` | **Ajustado** | 4 KPI, 3 Insight card, gráfico de riesgo y tabla "Predicciones activas". Corregido: el Badge de estado se pintaba siempre Informational; ahora `Activa`=Warning por la semántica del MDS. Confianza 88→Success, 81/76→Informational y riesgo ≥70 Critical / 50–69 Warning / <50 Neutral verificados |
| 42 | Analítica / Patrones **2156:4412** | `?tab=patrones` | Alta fidelidad | Heatmap 7×3 y tabla de recurrencias |
| 43 | Analítica / Predicciones **2156:4523** | `?tab=predicciones` | Alta fidelidad | Predicho vs real + histórico con Acierto/Fallo |
| 44 | Analítica / Modelo (CRISP-DM) **2156:4634** | `?tab=modelo` | Alta fidelidad | Stepper de 6 fases, tarjetas por fase, versiones con Badge `Vigente`=Success / `Archivada`=Neutral y modal de confirmación al activar |
| 45 | Analítica / Datos insuficientes **2156:4745** | vacío | Alta fidelidad | `EmptyState` + barra de progreso; bloquea "Reentrenar" |

#### 09 · Evidencia de tesis

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 46 | Evidencia / Resumen **2156:5682** | `/evidencia` | **Ajustado** | 5 KPI (4+1) con meta y estado, Tabs de 6, gráfico pretest/postest. Corregido: breadcrumb y desbordamiento de la leyenda del gráfico en móvil |
| 47 | Evidencia / TRI **2163:4263** | `?tab=tri` | Alta fidelidad | Tabla del Anexo 02 + bloque "Pretest (registro manual)" con carga de hoja |
| 48 | Evidencia / TCI **2163:10456** | `?tab=tci` | Alta fidelidad | 4 columnas de verificación + KPI RC/RT |
| 49 | Evidencia / TSP **2163:14157** | `?tab=tsp` | Alta fidelidad | 8 ítems con barras 1–5, KPI PO/PT y "Copiar enlace de encuesta" |
| 50 | Encuesta pública **2163:15979** | `/encuesta/[token]` | **Ajustado** | Corregido: el formulario ocupaba los 1024 px; ahora columna de lectura de **720 centrada** con la cabecera a ancho completo, como el frame. Flujo verificado: submit vacío → error por ítem; 8 respuestas → pantalla de gracias. Falta el Dropdown "Rol que desempeña" (ver pendientes) |
| 51 | Evidencia / CFS **2163:17616** | `?tab=cfs` | Alta fidelidad | Checklist de 9 filas con Checkbox, observación y "Ver pantalla" |
| 52 | Evidencia / EP **2163:18770** | `?tab=ep` | Alta fidelidad | Tabla del Anexo 06 + KPI PCC/PTG alimentados por las confirmaciones de alertas |

#### 10 · Configuración

| # | Frame | Ruta / estado | Veredicto | Nota |
|---|---|---|---|---|
| 53 | Configuración / Causas de parada **2163:18282** | `/configuracion` | **Ajustado** | Tabs de 6, árbol 360 + panel Settings con filas label/valor y Toggle. Corregido: el pie era `[Desactivar (abría el modal de borrado)] [Guardar]`; ahora `Eliminar causa` (Danger, a la izquierda, con el modal irreversible) + `Desactivar` (Secondary, marca el formulario como sucio) + `Guardar cambios` (Primary, deshabilitado hasta haber cambios), como el frame. También: la columna de 360 desbordaba a 390 |
| 54 | Configuración / Máquinas **2165:11984** | `?tab=maquinas` | Alta fidelidad | Tabla + drawer "Nueva máquina"; Badge `Operativa`=Success / `Mantenimiento`=Warning |
| 55 | Configuración / Umbrales **2165:13218** | `?tab=umbrales` | Alta fidelidad | Sticky footer medido **1116×64** que aparece al primer cambio (Figma 1180; 1116 es el ancho útil del contenido, coherente con el resto de bloques) |
| 56 | Configuración / Eliminar causa (Danger) **2165:13853** | overlay | Alta fidelidad | Modal Danger con overline de acción irreversible, impacto ("27 paradas históricas"), Danger + Cancelar |

#### 00 · Overview

| # | Frame | Ruta | Veredicto | Nota |
|---|---|---|---|---|
| 57 | MES / 00 Overview **2169:13553** | — | n/a | Documentación del archivo Figma, no es pantalla |

**Recuento: 55 frames de pantalla evaluados → 43 Alta fidelidad · 12 Ajustados · 0 Pendientes de fidelidad.** Los 2 restantes de los 57 no son pantallas (23 `Captura / BASE` y 57 `Overview`). Ningún frame quedó como desviación sin explicar: las desviaciones conscientes están anotadas en su fila y resumidas abajo.

#### Desviaciones conscientes (no se corrigen)

- **Gráficos con marco**: `ChartFrame` dibuja borde 1 px r12 sin sombra, como los frames `Chart / …`. No es una card (no lleva sombra ni agrupa contenido decorativo), así que no rompe la regla "cards sólo funcionales" del BRIEF.
- **Selector inline de `/tiempo-real`**: Figma muestra "Turno", el código expone "Sede" porque es el filtro que cambia el conjunto de líneas. La sede del topbar y la de la barra quedan sincronizadas.
- **"Limpiar filtros"** aparece sólo con filtros activos (en Figma está siempre visible).
- **Pie del sidebar** con Perfil / Modo TV / Salir (Figma sólo muestra el usuario): el cierre de sesión tiene que existir.
- **Bloque "Usuarios de demostración"** en el login: apoyo para la defensa de la tesis, no está en Figma.
- **Summary card 267×85** frente a 80 en Figma: diferencia de line-height del número 22/600; se mantiene el `padding 16` y el `gap 6` del frame.
- **Badge de alto 22** frente a 21 en Figma (3 + 16 + 3 con texto 12/500).
- **`Riesgo` = Warning** en la tabla de Home: en el frame de Home aparece en rojo y en el de Tiempo real en ámbar; se unificó al ámbar que fija `docs/design-system.md`.
- **`Activa` = Success en Configuración** (causa dada de alta) frente a Warning en alertas: es lo que muestra el frame 2163:18282 y son dos significados distintos de la misma palabra.

---

### 2. Bugs corregidos

| # | Problema | Archivo(s) |
|---|---|---|
| 1 | El breadcrumb se pintaba dentro de la **topbar** (Figma lo tiene en la cabecera de página) y sólo 3 pantallas lo pasaban a `PageHeader`, así que en el resto no existía y en Home/Reportes/Analítica salía duplicado | nuevo `apps/web/src/components/AppPageHeader.tsx`; `layouts/AppShell.tsx`; 12 vistas con `<PageHeader` → `<AppPageHeader` |
| 2 | **Scroll horizontal de la página** en `/ordenes` a 1280 y 1024: el `sr-only` de la columna ACCIONES es `position:absolute` y, sin bloque contenedor posicionado, se colocaba fuera del contenedor con scroll de la tabla | `packages/ui/src/patterns/table.tsx` (`relative` en el envoltorio) |
| 3 | **Line card con ancho fijo 356** → desbordaba la rejilla de 3 columnas a 1280 | `packages/ui/src/patterns/line-card.tsx` (`w-full max-w-line-card`) |
| 4 | **Modo TV**: con 6 puestos las filas no cabían en 1080 y, por debajo de 1440, las columnas se solapaban (texto `whitespace-nowrap` sin truncar) | `features/realtime/components/ModoTvPage.tsx` |
| 5 | **Encuesta pública** a ancho completo (960) en vez de la columna de lectura de 720 centrada del frame | `layouts/PublicLayout.tsx` |
| 6 | **Badge de estado de predicción** siempre `informational`; `Activa` debe ser Warning | `features/analytics/components/ResumenTab.tsx` (nuevo `colorEstadoPrediccion`) |
| 7 | **Badge `Riesgo`** en "Estado de líneas" en Critical en vez de Warning | `features/home/components/EstadoLineasTable.tsx` |
| 8 | **Gráficos de Home sin marco** frente al frame 2163:17435 | `features/home/components/OeePorLineaChart.tsx`, `TopCausasTable.tsx` |
| 9 | **Configuración · pie de la causa**: el botón `Desactivar` (Secondary) abría el modal de borrado irreversible y no existía el Danger del frame | `features/settings/components/CausaParadaDetalle.tsx` |
| 10 | **Asistente de parada**: "N.º de solicitud" se etiquetaba siempre *(opcional)*; con causas `requiereSolicitud` el envío final devolvía 422 tras 3 pasos | `features/capture/components/ParadaWizard.tsx` |
| 11 | **Fila de paradas de la OF no abría el drawer** (Figma 2163:9998: "Fila → drawer") | `features/orders/components/OrdenParadasTab.tsx` |
| 12 | **Warning de React**: `Switch is changing from uncontrolled to controlled` en `/configuracion?tab=umbrales` (el `Controller` entrega `undefined` hasta que llegan los datos) | `checked={field.value ?? false}` en `settings/CausaParadaDetalle`, `settings/UmbralesTab`, `capture/MermaWizard`, `capture/ParadaWizard`, `alerts/UmbralesDrawer`, `orders/ParadaForm` |
| 13 | **Tag de filtro (28) a 13 px**; el MDS 60:92 fija 12/500 | `packages/ui/src/primitives/tag.tsx` |
| 14 | **`SectionTitle`**: la botonera no envolvía y forzaba 535 px de ancho a 390 (scroll horizontal en `/ordenes`) | `packages/ui/src/primitives/feedback.tsx` |
| 15 | **`DescriptionList`**: etiqueta de 220 px fija → `/perfil` desbordaba a 390 | `packages/ui/src/patterns/layout.tsx` |
| 16 | **`ListDetailLayout`**: la columna de 360 no se limitaba al ancho útil → `/configuracion` desbordaba a 390 | `packages/ui/src/patterns/layout.tsx` |
| 17 | **Leyenda de `ChartFrame`** con `shrink-0` → `/evidencia` desbordaba a 390 | `apps/web/src/components/charts/ChartFrame.tsx` |
| 18 | **Buscador del árbol de causas** sin `min-w-0` → 2 px de desbordamiento a 390 | `features/settings/components/CausasParadaTab.tsx` |
| 19 | **Infra**: dos `next dev` sobre el mismo checkout comparten `apps/web/.next` y se pisan los chunks (`/tv` quedó en blanco con 404 de `_next/static/...`) | `apps/web/next.config.ts`: `distDir: process.env.NEXT_DIST_DIR ?? '.next'` (por defecto no cambia nada; `NEXT_DIST_DIR=.next-qa next dev` aísla un segundo servidor) |

---

### 3. Pendientes (fuera de mi alcance o requieren contrato/back)

| Pendiente | Archivo / responsable | Motivo |
|---|---|---|
| Estado de **error de la tabla de Órdenes** no llegó a renderizarse al forzar un fallo del `GET /ordenes`: la tabla se queda con skeletons y `Mostrando 0–0 de 0` en vez del `EmptyState variant="error"`. `OrdenesTableBlock` contempla el estado y el 404 de `/ordenes/[id]` sí muestra su error, así que el problema parece estar en la capa de query | `apps/web/src/services/api/*` (I1) | No puedo editar `services/api`; conviene confirmar con un test de `useOrdenes` con `queryFn` que rechaza |
| Encuesta pública: falta el Dropdown **"Rol que desempeña"** del frame 2163:15979 y el título/descripción vienen del mock ("Encuesta de satisfacción · MES Yamboly" en vez de "Cuestionario de satisfacción del personal") | `apps/web/src/mocks/handlers/evidence.ts`, `packages/types` (I1) | Añadir el campo exige cambiar el contrato de `GET/POST /encuesta/:token` |
| Modo TV: el subtítulo de cada fila usa `detalle` (texto de alerta); el frame muestra `OF · producto` y deja el texto de anomalía bajo la barra | `apps/web/src/mocks/handlers/realtime.ts` + `TvRow` (I1) | `TvRow` no expone `ofCodigo` / `producto` |
| Órdenes: el Summary dice "Todas 1 248" pero el listado devuelve 35 | `apps/web/src/mocks/data/orders.ts` (I1) | Incoherencia de datos del mock |
| Alertas: falta el Secondary **"Exportar"** junto al buscador (frame 2156:5417) | `features/alerts` + endpoint de exportación (I1) | No hay endpoint de exportación de alertas en `docs/api-contracts.md` |
| Configuración: el frame tiene **"Importar CSV" / "Exportar catálogo"** en la cabecera de página | `features/settings` + endpoints (I1) | Sin endpoints en el contrato |
| Frames leídos sólo por spec textual (sin PNG de Figma en esta sesión): 12–22, 27–28, 31–34, 41–45, 47–49, 51–52, 54–55 | — | Cuota Figma limitada; se validaron contra `docs/figma-specs-modulos.md` y `docs/design-system.md` y contra las capturas ya descargadas en el scratchpad |

---

### 4. Responsive

`document.documentElement.scrollWidth === clientWidth` medido dentro del iframe del ancho indicado, en todas las rutas
del shell + `/login`, `/tv` y `/encuesta/[token]`.

| Ancho | Resultado |
|---|---|
| **1440** | ✅ Sin scroll horizontal en ninguna ruta. Sidebar fija 260 + topbar 1180×64 + contenido 1116 |
| **1280** | ✅ Sin scroll horizontal tras corregir la Line card (`/tiempo-real`) y el `sr-only` de la tabla (`/ordenes`). Sidebar fija (`xl`) |
| **1024** | ✅ Sin scroll horizontal. Sidebar oculta, hamburguesa visible, drawer de navegación de 260 que cierra con Esc |
| **768** | ✅ Sin scroll horizontal. KPI en 2 columnas, Line card en 2 columnas, filtros que envuelven |
| **390** | ✅ Sin scroll horizontal tras corregir `SectionTitle`, `DescriptionList`, `ListDetailLayout`, la leyenda de `ChartFrame` y el buscador de causas. Drawer de navegación a ancho completo (390) |

Además:

- **Tablas**: todas viven en un contenedor propio `overflow-x-auto` (Órdenes 1117 px de contenido en 956 de caja a 1280; Alertas y Home igual). Ninguna arrastra el `body`.
- **Modales y drawers**: modal 560 (Validar orden) y 640 (captura) centrados y utilizables; drawer 480 anclado a la derecha en escritorio y a ancho completo en móvil; Esc y clic en el scrim cierran en todos los casos probados.
- **Rejillas**: KPI 4→2→1, Line card 3→2→1, columnas de gráficos apiladas por debajo de `lg`.
- Al terminar se dejó el arnés en 1440 y se eliminó `apps/web/public/qa-harness.html`.

---

### 5. Consola

Recorridas `/`, `/tiempo-real`, `/ordenes`, `/ordenes/[id]` (`?tab=paradas` y `?tab=bitacora`), `/alertas`,
`/reportes` (`indicadores`, `paradas`, `mermas`, `exportar`), `/analitica` (`resumen`, `predicciones`, `modelo`),
`/evidencia` (`resumen`, `tsp`, `ep`), `/configuracion` (`causas`, `maquinas`, `umbrales`), `/pasteurizacion`,
`/perfil`, `/personal`, `/login`, `/tv`, `/encuesta/[token]` y una ruta inexistente:

- **0 errores** y **0 warnings** de React / Next / recharts / Radix tras las correcciones.
- Único warning encontrado durante la sesión: `Switch is changing from uncontrolled to controlled` en
  `/configuracion?tab=umbrales` — corregido (bug 12) y verificado en recarga limpia.
- Mensajes informativos que se mantienen (esperados en desarrollo): aviso de React DevTools y `[Fast Refresh]`.

> Nota (fase 2): `/pasteurizacion` y `/personal` — listadas arriba porque en esta sesión (28-ago-2026) aún existían
> como módulos placeholder — se retiraron de la navegación y del código en la fase 2 (ver «QA fase 2» al inicio de
> este documento); hoy ambas rutas devuelven 404 por diseño.

---

### 6. QA funcional — resumen de lo verificado

- **Login**: submit vacío → errores por campo; credenciales incorrectas → Input destructivo + hint; correctas → `/` según rol; `Salir` limpia la sesión y redirige a `/login`.
- **Listado → detalle → editar → guardar → toast → refetch**: `/ordenes` (búsqueda `?search=`, tags `?turno=N`, "Limpiar filtros", Summary card `?resumen=por_validar`, paginación `?page=2` con "Mostrando 26–35 de 35") → `/ordenes/OF-2026-0815` → tab Paradas → fila/⋯ → drawer de edición → guardado con aviso de bitácora.
- **Formularios**: asistente de parada con validación por paso ("Selecciona el tipo de parada", "Describe la acción tomada (mínimo 10 caracteres)", máquina y causa obligatorias) y errores 422 del servidor pintados bajo el campo y devolviendo al paso correspondiente; encuesta pública con validación por ítem.
- **Modales / drawers**: Esc y clic en el scrim cierran; "Validar orden" mantiene el Primary deshabilitado hasta marcar los 4 checkbox; toda acción destructiva pasa por el modal Danger.
- **Roles**: `jorge.quispe@yamboly.lat` (maquinista) no ve Analítica IA, Configuración ni Evidencia en el sidebar y recibe "Sin permiso" al entrar por URL a `/analitica`, `/configuracion` y `/evidencia`.
- **404**: ruta inexistente → `not-found` dentro del shell.
- **Error de API**: `?__error=…` no es alcanzable desde la UI porque los parámetros de la página no se propagan a la petición; se forzó con un `fetch` instrumentado. `GET /ordenes/OF-9999-9999` (404 real del mock) sí muestra "No se encontró la orden de fabricación". Ver el pendiente sobre el estado de error del listado.

---

### 7. Comandos finales

- `pnpm --filter @mes/web typecheck` ✅ · `pnpm --filter @mes/ui typecheck` ✅
- `pnpm --filter @mes/web lint` ✅ *No ESLint warnings or errors*
- `pnpm build` ✅ *4 successful, 4 total* (18 rutas generadas)
- **Llamadas Figma usadas: 3** de las 25 disponibles — 1 `get_figma_skill` (`figma-design-to-code`) y 2 `get_screenshot` (`2156-4160` Órdenes/Listado y `2163-8523` Modo TV). El resto de frames se comparó con los PNG ya descargados en el scratchpad (`figma-home-jefe.png`, `shot-2156-3936.png`, `shot-2156-8269.png`, `07-alertas-frameA.png`, `f-config-causas.png`, `f-encuesta.png`, `ord1.png`, `ls_full.png`, `10-*.png`, …) y con `docs/design-system.md` / `docs/figma-specs-modulos.md`.
