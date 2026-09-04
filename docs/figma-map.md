# Mapa Figma → aplicación — 57 frames

fileKey `WOfwZEmPx1Hcw7ehaIsnpx`. Node ids de `docs/figma-frames.md`; contenido de `docs/figma-specs-modulos.md`; medidas de `docs/design-system.md`.

## Desviaciones respecto a Figma (sep-2026)
La rama `feat/maestros-reales` migró los catálogos de ejemplo a los maestros reales de planta; el resto de este mapa (frames, node ids, mapa de navegación) describe la lectura original de Figma y **no se reescribió**. Al implementar:
- **9 líneas reales** (`LLEN-M2`, `LLEN-M1`, `LLEN-A1`, `LLEN-A2`, `EXTR-2`, `EXTR-3`, `MOLD-A2`, `MOLD-A3`, `MOLD-A4`) en vez de `L1…L5`; Tiempo real usa 9 LineCard y el modo TV 9 filas.
- **2 turnos** `D`/`N` en vez de Mañana/Tarde/Noche.
- **Causas de merma** en árbol de 3 niveles con mantenedor completo (no 4 códigos planos).
- **Productos y velocidades**, y **Sedes y usuarios**, con CRUD real en Configuración.
- Rutas **`/pasteurizacion`** y **`/personal`** retiradas de la navegación (ver "Mapa de navegación" abajo, que conserva la lectura original de Figma).

Ajustes del 4-sep-2026 (tarde, sobre lo anterior): el producto decidió retirar el nivel máquina/equipo y el catálogo de sedes.
- **Sin paso Máquina** en el wizard de parada — el frame `Parada / P2 Detalle` **2156:8367** (fila 12 más abajo) traía un Dropdown "Máquina" que ya no existe: la parada se registra hasta línea.
- **Pestaña Máquinas → Líneas** — el frame `Configuración / Máquinas` **2165:11984** (fila 54) pasa a ser el mantenedor de Líneas (alta/edición/baja), no de equipos por línea.
- **Sin sedes** — no hay catálogo de sedes ni selector de sede en ninguna pantalla (topbar, tiempo real, Configuración); Yamboly opera una única sede (Lima).
- **Tarjetas de tiempo real ampliadas** — el frame `Tiempo real / Líneas / Default / 1440` **2156:3936** (fila 6) se implementó con `LineCard` ampliada (2 columnas en ≥1280 px, métricas 2×2, progreso etiquetado, mensaje contextual) y sin filtro de línea ni selector de sede.
- **Velocidades en modal** — "Ver velocidades" abre un `VelocidadesModal` en vez del panel embebido descrito en la matriz de Productos y velocidades.

**Origen** de cada fila: `F` = leído de Figma en esta sesión (`get_design_context` / `get_metadata`) · `S` = solo desde spec textual (`docs/figma-specs-modulos.md`) · `F*` = leído parcialmente (metadata de estructura, sin código).

Convenciones comunes a **todas** las pantallas del shell: `MES/Sidebar` (260) + `MES/Topbar` (1180×64) + `Content` (1180, padding 28/32/40/32, gap 24, útil **1116**) + `MES/Page header` (breadcrumb + H2 + subtítulo + acciones con **un solo Primary**).
Estados obligatorios por vista (BRIEF): `loading` (skeleton), `empty`, `no-results`, `error`, `success/toast`, `validación`, `confirmación`, `forbidden`.

---

## 02 · Auth & Home (página 2144:5) — RF10, RF6, RF7

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 1 | `Auth / Login / Default` **2163:17066** | `(auth)/login` | Panel de marca 720 (`H1`, bullets `check-circle`), Input lg ×2, Checkbox md, Button Primary lg full-width, link | Default | Submit → `/` según rol (jefe → dashboard jefe, maquinista → dashboard maquinista). Sin shell | **F** |
| 2 | `Auth / Login / Error` **2163:17234** | `(auth)/login` | Igual + Input `Destructive=True` con hint "Correo o contraseña incorrectos" | Error | Validación react-hook-form + zod; error de servidor bajo el campo | S |
| 3 | `Home / Dashboard Jefe` **2163:17435** | `(app)/` | Page header + **KPI row 1** (4×267×112) + **KPI row 2** (3) + Section title + **Alert row** (3 Alert card 361,33×118) + Chart row (720 barras + 380 ranking) + Section title + tabla "Estado de líneas" (140/120/140/220/160/140/196) | Default | "Ver tiempo real" → `/tiempo-real`; Alert card "Ver alerta" → `/alertas` (drawer); fila de línea → drawer de línea | **F\*** |
| 4 | `Home / Dashboard Maquinista` **2165:769** | `(app)/` | Line card grande + 3 KPI + lista "Mis últimos registros" + Alert card | Default | Botones de la Line card abren los modales de captura | S |
| 5 | `Home / Dashboard / Loading` **2165:12928** | `(app)/` | Skeletons `#F3F4F6` r8 con la geometría real | Loading | — | S |

## 03 · Tiempo real (2144:6) — RF1, RF6

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 6 | `Tiempo real / Líneas / Default / 1440` **2156:3936** | `(app)/tiempo-real` | Page header (Dropdown inline "Sede", Secondary "Modo TV" `monitor`, Primary "Iniciar orden"), Filter bar (grupos LÍNEA/ESTADO con Tag 28), grid **3×2 de Line card 356, gap 24** | Default | Card → drawer de detalle; "Parada"/"Merma" → modales de captura; "Modo TV" → `/tv`; polling 3 s | S (composición confirmada por la instancia usada en 2156:8269) |
| 7 | `… / Default / 1024` **2163:1568** | `(app)/tiempo-real` | Sin sidebar; topbar compacta con menú; 2 columnas de Line card 460; botones lg | Responsive | Breakpoint `lg` | S |
| 8 | `Tiempo real / Modo TV / 1920` **2163:8523** | `tv` (fuera del shell) | Fondo `#111827`, 5 filas a ancho completo, badge grande, reloj | Solo lectura | Sin navegación; refresco automático | S |
| 9 | `Tiempo real / Líneas / Empty` **2156:7386** | `(app)/tiempo-real` | `MES/Empty state` Kind=NoData + Primary "Iniciar orden" | Empty | — | S |
| 10 | `Tiempo real / Detalle de línea (drawer)` **2156:7548** | `(app)/tiempo-real` | `MES/Drawer` 480 + Tabs (Resumen·Paradas·Mermas·Velocidad·Colaboradores) + timeline vertical | Overlay | Abre desde la Line card; scrim; Esc cierra | S |

## 04 · Captura rápida (2144:7) — RF1–RF4, OE1 (≤3 toques, cronómetro TRI en todos)

Todos son overlays de `/tiempo-real` (ruta con `?captura=…` o estado de UI), sobre el frame **BASE 2156:93**, con overlay `rgba(17,24,39,.5)` y el Primary de la pantalla base en Disabled. El **chip TRI** (`bg #F9FAFB`, borde `#E5E7EB`, r999, `stopwatch` 14 + 11/500) va en el header del modal y alimenta el KPI TRI.

| # | Frame (node id) | Ruta / trigger | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 11 | `Parada / P1 Causa` **2156:8269** (modal 2156:8295, **640×565**) | Line card → "Parada" | Modal 640, chip TRI, `MES/Stepper` (Causa·Detalle·Confirmar), chip de contexto `#F9FAFB` r8 12/400, H4 "¿Qué tipo de parada?", **7 Tag lg (32) en wrap gap 8** con 1 Selected, Input 300 "Hora de inicio" + hint, footer Secondary "Cancelar" + Primary "Siguiente" (`arrow-right`) | Paso 1 | "Siguiente" → paso 2; "Cancelar" cierra y descarta el cronómetro | **F** |
| 12 | `Parada / P2 Detalle` **2156:8367** | ← paso 1 | Dropdown "Máquina", Dropdown "Causa específica", Input "Acción tomada" (obligatorio), Input "N.º de solicitud", Secondary `camera` "Evidencia", Toggle "Afecta OEE" | Paso 2 | "Atrás"/"Siguiente" | S |
| 13 | `Parada / P3 Confirmar` **2163:2538** | ← paso 2 | Filas label/valor, nota de sello de tiempo, Alert Info de vinculación IoT, Primary "Registrar parada" (`check`) | Paso 3 | Guarda → toast + cierra + refresca Line card; para el cronómetro TRI | S |
| 14 | `Parada / Finalizar` **2163:2672** | Menú ⋯ de la línea en parada | Modal corto, duración, Input "Comentario de cierre", Primary "Finalizar parada" | Default | — | S |
| 15 | `Merma / P1 Tipo y cantidad` **2163:9376** | Line card → "Merma" | Stepper, Tags MP/EP/PT, Input numérico grande + teclado 3×4 de Secondary lg, Dropdown "Sabor" | Paso 1 | — | S |
| 16 | `Merma / P2 Causa y responsable` **2163:9517** | ← | Tags MR-01…MR-04, Dropdown "Responsable", Input `scan-qr-code` "Código de balde", Checkbox "Enviar a pasteurización" | Paso 2 | Checkbox → crea tarea en `/pasteurizacion` | S |
| 17 | `Merma / P3 Confirmar` **2163:11105** | ← | Resumen + Primary "Registrar merma" | Paso 3 | — | S |
| 18 | `Velocidad / Registrar` **2163:12740** | Menú ⋯ de la línea | **Drawer 480**, Input numérico con sufijo "u/min", referencia y barra comparativa, Dropdown "Motivo", Primary "Guardar" | Overlay | — | S |
| 19 | `Orden / Iniciar P1 Datos` **2163:12873** | Primary "Iniciar orden" | Modal 640, Stepper (Datos·Equipo·Confirmar), Dropdowns Línea/Producto/Turno, Inputs OF/Lote/Vencimiento/Planificado | Paso 1 | Producto autocompleta velocidad estándar | S |
| 20 | `Orden / Iniciar P2 Equipo` **2163:16326** | ← | Dropdown Maquinista/Supervisor, Input "N.º operarios", lista con Checkbox | Paso 2 | — | S |
| 21 | `Orden / Finalizar` **2163:16222** | Menú ⋯ / detalle OF | Inputs de total producido y conteo, Secondary `camera`, textarea, 3 mini KPI de OEE estimado, Primary "Finalizar orden" | Default | Al cerrar → estado "Por validar" en `/ordenes` | S |
| 22 | `IoT / Parada sugerida` **2163:11217** | Push del sensor | Modal 480 de un toque: Badge Informational "Detectada por sensor", 4 Tags de causa frecuente, Primary lg "Confirmar parada", Secondary "No es parada" | Overlay | "Confirmar" registra en 1 toque; "No es parada" descarta y realimenta el modelo | S |
| 23 | `Captura / BASE (fondo)` **2156:93** | — | Frame de fondo reutilizado por los 12 anteriores | — | No es una ruta | S |

## 05 · Órdenes de fabricación (2144:8) — RF5, RF12, OE2

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 24 | `Órdenes / Listado / Default` **2156:4160** | `(app)/ordenes` | Page header (Secondary `file-xls` "Exportar" + Primary `plus` "Nueva orden"), **4 Summary card 267×80** (Todas activa 1.5px `#2563EB`), **Filter bar en línea** (PERIODO/LÍNEA/TURNO/ESTADO, label 96 + Tag 28, "Limpiar filtros"), Divider, Table block header (título 16 + desc 12 + Input search 260×40 + Secondary `sliders` "Columnas" + Secondary `layer` "Densidad"), **tabla 12 columnas** (44·108·84·106·178·76·144·60·64·88·104·60), footer "Mostrando 1–8 de 1 248" + Anterior/Siguiente sm | Default | Summary card aplica filtro; OF (link azul) → `/ordenes/[id]`; ⋯ → dropdown (Ver, Editar, Validar, Exportar); "Nueva orden" → modal de iniciar orden | **F** |
| 25 | `Órdenes / Listado / Empty` **2156:6905** | `(app)/ordenes` | `MES/Empty state` Kind=NoResults + "Limpiar filtros" | No-results | Conserva filter bar y summary cards | S |
| 26 | `Órdenes / Detalle OF / Resumen` **2156:8959** | `(app)/ordenes/[id]` | Page header con breadcrumb + Badge de estado + 3 acciones (Secondary Imprimir, Secondary Editar, Primary "Validar orden"), **Tabs Underline 7** (Resumen·Paradas(4)·Mermas(2)·Calidad·Consumo·Evidencias·Bitácora), 4 KPI + KPI producido, timeline horizontal segmentado, 2 columnas (Datos de la orden / Equipo) | Default | Tabs cambian el subpanel (query `?tab=`); "Validar orden" → modal #30 | S |
| 27 | `… / Paradas` **2163:9998** | `(app)/ordenes/[id]?tab=paradas` | Tabla integrada (Hora inicio·fin·Duración·Tipo·Causa·Máquina·Acción tomada·Responsable·Evidencia·OEE Toggle·⋯), footer de totales, Secondary "Registrar parada retroactiva" | Default | Fila → drawer #29; Toggle OEE cambia el cálculo y escribe en bitácora | S |
| 28 | `… / Bitácora` **2163:12196** | `(app)/ordenes/[id]?tab=bitacora` | Lista vertical de eventos (hora, avatar, texto, Badge de tipo) + filtro por tipo | Default | Solo lectura (RF12) | S |
| 29 | `Órdenes / Editar parada (drawer)` **2163:14623** | overlay de `/ordenes/[id]` | `MES/Drawer` con los campos del paso 2 de captura + Alert Warning "Los cambios quedan registrados en la bitácora" + footer | Overlay | Guardar → escribe en bitácora | S |
| 30 | `Órdenes / Validar orden (modal)` **2163:15629** | overlay de `/ordenes/[id]` | `MES/Modal` Default con checklist de 4 Checkbox + Primary "Validar y cerrar" | Confirmación | Primary deshabilitado hasta marcar los 4 | S |

## 06 · Reportes (2144:9) — RF7, RF13

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 31 | `Reportes / Indicadores` **2163:18418** | `(app)/reportes` | Page header (Secondary "Programar envío" + Primary `file-xls` "Exportar"), Filter bar (PERIODO/LÍNEA/TURNO/COMPARAR CON), Tabs 5, 4 KPI, gráfico 1116×300 "Tendencia OEE" con línea de meta punteada, 2 columnas (barras OEE por línea / tabla comparativa por turno con Badge de Δ) | Default | Tabs → `?tab=`; filtros en query | S |
| 32 | `Reportes / Paradas` **2163:18594** | `(app)/reportes?tab=paradas` | 4 KPI, **Pareto 720×300** (barras + línea acumulada) + **donut 380**, tabla "Detalle por causa" con sparkline | Default | Pareto y donut comparten la misma paleta y orden | S |
| 33 | `Reportes / Mermas` **2163:19459** | `(app)/reportes?tab=mermas` | 4 KPI, barras apiladas por línea y tipo (MP/EP/PT) + **heatmap causa × turno**, tabla por causa | Default | Celda del heatmap filtra la tabla | S |
| 34 | `Reportes / Exportar` **2163:19635** | `(app)/reportes?tab=exportar` | Lista de datasets con Checkbox, Radio de formato (XLSX/CSV/PDF), rango, Primary "Generar archivo", tabla de historial con Badge Listo/Generando | Default | "Generar" → job asíncrono; Badge Generando → Listo con toast | S |

## 07 · Alertas (2144:10) — RF9, KPI EP

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 35 | `Alertas / Bandeja / Default` **2156:5417** | `(app)/alertas` | Page header (Secondary "Configurar umbrales" + Primary "Confirmar pendientes (4)"), 4 Summary card, **Filter bar apilada** (TIPO/SEVERIDAD/LÍNEA/ESTADO, grupos de 50 cada 58), Divider, Section title + Input search 260 + Button, tabla 8 columnas (100·150·160·260·140·120·110·76) con barra de probabilidad 56×6, footer | Default | Fila → drawer #36; "Configurar umbrales" → drawer #40; "Confirmar pendientes" → modal #37 | **F\*** (estructura confirmada en 2163:8896) |
| 36 | `Alertas / Detalle (drawer)` **2163:8896** | overlay de `/alertas` | `MES/Drawer` 480: header H3, overline + descripción, 2 Badge, bloque `Meta` de 6 filas, bloque **"POR QUÉ"** con 3 factores (track 6 px, 432), bloque **"ATENDER"** (Input 432×62 + 2 botones), bloque **"RESULTADO REAL"** (Badge + 2 Radio + Input), footer 2 botones | Overlay | "Atender" pide acción tomada; "Resultado real" aparece al cerrarse la ventana y alimenta el **Anexo 06 (EP)** | **F\*** |
| 37 | `Alertas / Confirmar evento real (modal)` **2163:11719** | overlay de `/alertas` | `MES/Modal` con tabla de 4 filas y Radio Sí/No por fila + Primary "Guardar confirmaciones" | Confirmación | Escribe EP en lote | S |
| 38 | `Alertas / Bandeja / Empty` **2163:13378** | `(app)/alertas` | `MES/Empty state` NoData | Empty | — | S |
| 39 | `Alertas / Popover notificaciones` **2163:13751** | global (campana del topbar) | Dropdown 360 con `Shadow/Dropdown`, 3 alertas recientes + "Ver todas" | Overlay | "Ver todas" → `/alertas`; el punto rojo de la campana refleja no leídas | S |
| 40 | `Alertas / Configurar umbrales (drawer)` **2163:15102** | overlay de `/alertas` | Drawer con Inputs numéricos (velocidad %, OEE mínimo, probabilidad mínima) y 2 Toggle (n8n/WhatsApp, Modo TV) | Overlay | Guardar → toast; afecta al motor de reglas | S |

## 08 · Analítica IA (2144:11) — RF8

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 41 | `Analítica / Resumen` **2156:4301** | `(app)/analitica` | Page header (Secondary "Ver modelo" + Primary "Reentrenar"), 4 KPI, **3 Insight card 280**, gráfico de riesgo por línea con Badge, tabla "Predicciones activas" | Default | Insight → drawer de detalle; "Reentrenar" → modal de confirmación | S |
| 42 | `Analítica / Patrones` **2156:4412** | `?tab=patrones` | Heatmap 7 causas × 3 turnos, tabla "Recurrencias", filtros PERIODO/LÍNEA/VARIABLE | Default | Celda del heatmap filtra la tabla | S |
| 43 | `Analítica / Predicciones` **2156:4523** | `?tab=predicciones` | Gráfico de líneas predicho vs real (2 series), tabla histórica con columna Acierto | Default | — | S |
| 44 | `Analítica / Modelo (CRISP-DM)` **2156:4634** | `?tab=modelo` | **Stepper de 6 pasos** (componente 2163:16124), tarjetas por fase con métricas, tabla de versiones con Badge + "Activar", chips de variables de entrada | Default | "Activar" versión → modal de confirmación | S |
| 45 | `Analítica / Datos insuficientes` **2156:4745** | `(app)/analitica` | `MES/Empty state` + barra de progreso 1 250 / 2 000 | Empty | Bloquea "Reentrenar" | S |

## 09 · Evidencia de tesis (2144:12) — RF14–RF17, KPI 1–5

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 46 | `Evidencia / Resumen` **2156:5682** | `(app)/evidencia` | Page header (Secondary "Exportar para SPSS" + Primary "Generar informe"), **5 KPI card (4+1, 267)** con meta y estado, Tabs 6 (TRI·TCI·TSP·CFS·EP·Exportar), gráfico pretest vs postest **sin card** | Default | Tabs → `?tab=`; cada KPI enlaza a su anexo | S |
| 47 | `Evidencia / TRI (Anexo 02)` **2163:4263** | `?tab=tri` | Tabla (N.º·Fecha·Evento·Hora inicio·Tiempo min), bloque "Pretest (manual)" con Secondary `upload` "Cargar hoja", KPI ΣTR/n | Default | Datos postest automáticos desde Captura (chip TRI) | S |
| 48 | `Evidencia / TCI (Anexo 03)` **2163:10456** | `?tab=tci` | Tabla con 4 columnas de verificación (✓/✗ por reglas) + observación, KPI RC/RT | Default | — | S |
| 49 | `Evidencia / TSP (Anexo 04)` **2163:14157** | `?tab=tsp` | 8 ítems con barras de promedio 1–5 y % de acuerdo, KPI PO/PT, Secondary "Copiar enlace de encuesta" | Default | El enlace apunta a `/encuesta/[token]` | S |
| 50 | `Evidencia / Encuesta pública / 1024` **2163:15979** | `encuesta/[token]` (fuera del shell) | Página sin sidebar, 8 ítems Likert con Radio 1–5, Primary "Enviar" | Público | Token de un solo uso; tras enviar → pantalla de gracias | S |
| 51 | `Evidencia / CFS (Anexo 05)` **2163:17616** | `?tab=cfs` | Checklist de 9 filas con Checkbox "Cumple", Input de observación y link "Ver pantalla" | Default | "Ver pantalla" navega a la ruta que evidencia el requisito | S |
| 52 | `Evidencia / EP (Anexo 06)` **2163:18770** | `?tab=ep` | Tabla (N.º·Fecha·Predicción·Evento real·¿Acierto?·Observación), KPI PCC/PTG | Default | Se alimenta de las confirmaciones del drawer de alertas (#36) y del modal #37 | S |

## 10 · Configuración (2144:13) — RF11, RNF14

| # | Frame (node id) | Ruta Next | Componentes | Estado | Comportamiento | Origen |
|---|---|---|---|---|---|---|
| 53 | `Configuración / Causas de parada` **2163:18282** | `(app)/configuracion` | Tabs 6 (Causas de parada·Causas de merma·Máquinas·Productos y velocidades·Umbrales·Sedes y usuarios), layout lista-detalle: **árbol 360** (TT-GG-EE) con Input search + Primary sm "Nueva causa"; panel de detalle en patrón Settings (filas label/valor con divisores, Toggle) + Secondary "Desactivar" + Primary "Guardar" | Default | Selección en el árbol cambia el panel; "Eliminar" → modal #56 | S |
| 54 | `Configuración / Máquinas` **2165:11984** | `?tab=maquinas` | Tabla integrada (Código·Máquina·Tipo·Línea·Estado·Paradas 30 d·⋯) + drawer "Nueva máquina" | Default | Botón Primary abre el drawer | S |
| 55 | `Configuración / Umbrales de alerta` **2165:13218** | `?tab=umbrales` | Formulario Settings por filas + **sticky footer 1180×64** "Cambios sin guardar" (Secondary Cancelar + Primary Guardar) | Dirty | El footer aparece al primer cambio | S |
| 56 | `Configuración / Eliminar causa (modal Danger)` **2165:13853** | overlay | `MES/Modal` Kind=Danger: overline "ACCIÓN IRREVERSIBLE", texto de impacto, Danger "Eliminar" + Secondary "Cancelar" | Confirmación | Toda acción destructiva pasa por aquí | S |

## 00 · Overview (2144:3)

| # | Frame (node id) | Ruta Next | Contenido | Origen |
|---|---|---|---|---|
| 57 | `MES / 00 Overview / 1440` **2169:13553** | — (documentación) | Alcance, mapa de navegación, trazabilidad RF → frames, reglas MDS y excepciones, listado de componentes MES-local | S |

---

## Componentes de la página 01 Shell & Patterns (2144:4) — no son pantallas
Todos leídos de Figma en esta sesión salvo Breadcrumb, Section title, Table header y Table row (medidas obtenidas por metadata + instancias):
`MES/Sidebar` 2147:5 **F** · `MES/Topbar` 2149:13 **F** · `MES/Breadcrumb` 2149:31 (170×16) **F\*** · `MES/Page header` 2149:39 **F** · `MES/Section title` 2149:59 (1116×57) **F\*** · `MES/Tabs` 2150:51 **F** · `MES/KPI card` 2150:75 **F** · `MES/Alert card` 2151:58 **F** · `MES/Insight card` 2151:59 **F** · `MES/Stepper` 2152:87 **F** · `MES/Empty state` 2152:118 **F** · `MES/Line card` 2153:238 **F** · `MES/Modal` 2154:119 **F** · `MES/Drawer` 2154:120 **F** · `MES/Table header` 2155:89 (1116×40) **F\*** · `MES/Table row` 2155:107 (1116×44) **F\***.

## Mapa de navegación (qué abre qué)
- **Sidebar** → `/`, `/tiempo-real`, `/alertas`, `/pasteurizacion`, `/ordenes`, `/reportes`, `/analitica`, `/personal`, `/configuracion`, `/evidencia`.
- **Topbar** → búsqueda global (⌘K, resultados de OF/lote/línea) · campana → popover #39 → `/alertas` · avatar → `/perfil` y cerrar sesión.
- **`/tiempo-real`** es el hub operativo: Line card → drawer #10 y modales de captura #11–#22; "Modo TV" → `/tv`.
- **`/ordenes`** → `/ordenes/[id]` (tabs) → drawer #29 y modal #30.
- **`/alertas`** → drawer #36 (que escribe EP) y drawer de umbrales #40.
- **`/evidencia`** consume datos de Captura (TRI), reglas de validación (TCI), encuesta pública (TSP), checklist (CFS) y confirmaciones de alertas (EP).
