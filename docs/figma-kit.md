# MDS Figma Kit — referencia para construir pantallas MES
Archivo: `WOfwZEmPx1Hcw7ehaIsnpx` (Master Design system (MDA) - Copia). Todo se construye DENTRO de este archivo, en páginas nuevas `MES / …`. NO modificar páginas existentes del MDS.

## Reglas duras del MDS (frame 448:3 "Layout & surface principles")
- La página es el contenedor: contenido principal (tablas, listas, formularios) directo sobre blanco, sin card envolvente.
- Separar secciones en este orden: whitespace (32–64) → tipografía (título de sección) → divisor 1px `divider/default` (#F3F4F6, solo horizontal) → fondo `background/subtle` (#F9FAFB, un solo nivel, nunca anidado).
- Sombras SOLO en flotantes (dropdown, modal, drawer, floating nav). Nunca en cards de contenido.
- Cards solo funcionales: KPI (200 px, bg #FFF, borde 1px #E5E7EB, r12, pad 16/14), Alert (280 px, bg #FFFBEB, sin borde, barra izq 3px #F59E0B r4, pad 14/12), Insight (280, #FFF, borde #E5E7EB, r12), Summary-filter (160–269 px, #FFF, borde 1.5px #2563EB cuando activa / 1px #E5E7EB, r12, pad 16, gap 6: label 12px #2563EB/#6B7280 + número 24px semibold), Mobile list item.
- Un solo botón Primary por pantalla. Danger siempre con diálogo de confirmación. Badges nunca interactivos (usar Tag para chips clicables).
- Densidad: filas 56 (comfortable) / 44 (standard, default) / 32 (compact). Tabla: cabecera 40 px con Label/Overline gris #9CA3AF, celdas pad-x 12, primera col 44 px checkbox, filas 44, divisores 1px #F3F4F6, sin líneas verticales. Fila expandida: bg #F9FAFB.
- Dashboard: máx 4 KPI por fila, máx 7 en pantalla; zona de alertas/acción cuando aplique; un gráfico dominante + tabla/ranking que lo explica; nada decorativo.
- List page: título + subtítulo (Body/Small gris) · acción primaria arriba derecha · summary cards (opcional) · filter bar (grupos con overline 11px #9CA3AF + pills Tag) + "Clear filters" · divisor · Table block (título H4 + descripción Body/Small; acciones: Input search 260 + botones Secondary) · tabla · footer "Showing 1-8 of 521" + Prev/Next (Button Secondary sm).
- Form page: sticky footer 1180×64 "Unsaved changes" con Cancelar (Secondary) + Guardar (Primary).

## Esqueleto de aplicación (todas las plantillas)
Frame `Template / <Nombre> / 1440` 1440×(960–1080), fill #FFFFFF, layoutMode NONE:
- Instancia `Navigation / Sidebar / Expanded` (COMPONENT id `119:2`) 260×alto en x0,y0. Contiene: logo (frame 116×48 "Platform" texto), 6 ítems (frame 228×36, icono 18 + texto 14px; activo = bg #EFF6FF texto #1D4ED8), spacer, footer usuario (avatar 28 + nombre/rol).
  → Para MES reemplazar textos de ítems: Inicio, Tiempo real, Alertas, Órdenes, Reportes, Analítica IA, Configuración, Evidencia. Si hace falta más ítems o grupos (OPERACIÓN / CONTROL / ADMINISTRACIÓN), DETACH la instancia y editar (permitido solo para el sidebar; nombrar el resultado "MES / Sidebar").
- Instancia `Navigation / Topbar / Desktop` (COMPONENT `119:36`) 1180×64 en x260,y0: search 320×36 (bg #F9FAFB r8, icono search-lg 16 + "Search"), spacer, 2 iconos 20 (placeholder → swap por bell-01 `164:2106` y help-circle `164:2140`), avatar 32.
- Frame `Content` 1180×(alto−64) en x260,y64, VERTICAL, pad [28,32,40,32], gap 24, fill #FFF. Ancho útil 1116.
  - `Page header` HORIZONTAL 1116, gap 24: `Titles` VERTICAL gap 6 (H1-ish: en plantillas usan 24–28 px semibold #111827 → usar text style Heading/H2 `24`; subtítulo Body/Small #6B7280) + spacer + `Actions` HORIZONTAL gap 8/16 (Buttons).

## Componentes (COMPONENT_SET ids y propiedades) — instanciar con `set.defaultVariant.createInstance()` y luego `inst.setProperties({...})`
- Button `58:137` — props: `Hierarchy` Primary|Secondary|Danger · `Size` sm|md|lg · `State` Default|Hover|Pressed|Focus|Disabled|Loading · `Icon` None|Leading|Trailing|Only · `Label#58:0` (texto) · `Swap icon#58:217` (instance swap; pasar id de componente icono). Alturas 36/40/48, r12.
- Badge `53:32` — `Color` Success|Warning|Accent|Critical|Informational|Neutral · `Dot` True|False. Texto: hijo TEXT (editar characters). 21 px alto, pill.
- Tag `60:92` — `Size` sm|md|lg · `Action` Text only|X close|Count · `State` Default|Hover|Disabled|Selected|Focus|Pressed · `Label#60:0` · `Count#60:28`. Usar para chips de filtro (Selected = activo).
- Filter pill `459:4053` — `State` Default|Hover|Open|Active|Disabled · `Label#443:0` · `Prefix#443:6` · `Show prefix#443:12` · `Count#443:18` · `Show count#443:24`. 32 px alto.
- Input field `62:290` — `Size` md|lg · `Type` Default|Icon leading|Leading text · `State` Placeholder|Filled|Focused|Disabled · `Destructive` True|False · `Show label#62:0` · `Label#62:49` · `Text#62:98` · `Show hint#62:147` · `Hint#62:196` · `Swap icon#62:245`. Ancho por defecto 280 (redimensionar).
- Dropdown field `441:2093` — `Size` md|sm|lg · `State` Default|Hover|Focus|Open|Filled|Disabled|Read only|Error|Warning · `Label#441:0` · `Value#441:28` · `Helper#441:56` · `Show label#441:84` · `Show helper#441:112` · `Show count#441:140`. 300×88 (con label+helper).
- Dropdown menu item v2 `442:42` — `Type` Default|Checkbox|Danger · `State` Default|Hover|Focus|Selected|Disabled · `Label#442:0`. 240×36. Dropdown menu (COMPONENT `442:59`, 256×207, contenedor con Shadow/Dropdown).
- Dropdown inline `442:58` — `State` Default|Hover|Open · `Label#442:16` · `Value#442:24`. 144×32 (selector compacto, p.ej. "Turno: Mañana").
- Toggle `62:603` — `Pressed` True|False · `Size` sm|md · `State` · `Text` True|False · `Label#62:294` · `Show supporting#62:327` · `Supporting text#62:360`.
- Checkbox `85:530` — `Type` Checkbox|Radio · `Checked` Unchecked|Checked|Indeterminate · `Size` sm|md · `State` · `Text` True|False · `Label#85:0` · `Show supporting#85:81` · `Supporting text#85:162`.
- Tooltip `86:88` — `Theme` Dark|Light · `Arrow` None|Top|Bottom|Left|Right · `Supporting` · `Title#86:0` · `Supporting text#86:21`.
- Pagination `573:14291` — set poco útil (2 variantes); preferir footer de tabla con Button Secondary sm "Anterior"/"Siguiente" como en la plantilla Table.
- Summary card `548:1629` — `Property 1` All|disable. Hijos TEXT "Text" (label) y "00" (número). 212×80 default; en plantilla 269×80.
- Sidebar `119:2`, Topbar `119:36` (componentes sueltos), BottomFloating Mobile `119:47`.
- Iconos: página `164:820` (3 197 componentes) nombres `Icon / line / <name>`. Ids útiles (line): search#164:1752, plus#164:1788, plus-circle#164:1796, check#164:1777, check-circle#164:1786, x-mark#164:1766, x-mark-circle#164:1772, edit#164:1897, trash#164:1837, filter#164:1862, download#164:1864, upload#164:1848, save#164:1779, send#164:1913, settings-02#164:1945, bell-01#164:2106, bell-ringing#164:2108, alert-circle#164:2122, alert-triangle#164:2142, info-circle#164:2138, help-circle#164:2140, clock#164:1473, stopwatch#164:2799, calendar-01#164:1892, chart#164:2388, chart-alt2#164:2394, insight#164:2377, activity#164:2818, zap#164:1758, file#164:2416, file-xls#164:2368, file-csv#164:2383, file-pdf#164:2360, file-export#164:2434, list-check#164:2346, task-list#164:1929, clipboard#164:1781, user#164:2248, user-group#164:2242, home-01#164:1742, inbox#164:1982, radar#164:1951, eye#164:1870, dots-horizontal#164:1807, dots-vertical#164:1817, chevron-down#164:935, chevron-right#164:953, chevron-left#164:945, arrow-right#164:911, arrow-up#164:973, arrow-down#164:969, arrow-path#164:897, rotate-right#164:917, database#164:2511, cpu#164:1593, flask#164:2570, light-bulb#164:2422, ice-cream#164:2749, temperature#164:2060, forbidden#164:1961, archive#164:1969, tag#164:1971, printer#164:1589, monitor#164:1585, logout#164:1835, sliders#164:1621, layer#164:1257, categories#164:1043, package#164:1017, tree-structure#164:2492, git-branch#164:2513, pin#164:1878, flag#164:1888, star#164:1874, shield-check#164:1858, verify#164:1931, ranking#164:1917, stop-circle#164:1494, play-circle#164:1506, pause-circle#164:1576.
  Instanciar icono: `(await figma.getNodeByIdAsync("164:1752")).createInstance()` y `resize(20,20)`.

## Estilos y variables (ids)
Text styles (aplicar con `node.setTextStyleIdAsync(id)` o `node.textStyleId = id` tras cargar fuente Inter): Heading/Display `S:d9b0fdb81188f179e77f7e86c4e04399631dc26b,` (40/Bold) · Heading/H1 `S:9e05cbb3822bd76a9c6dc3a2f0fb63c44be1c265,` (32 Semi Bold) · H2 `S:d1e7c8c4bf38a1a046162e929bc30219868c16e8,` (24) · H3 `S:dc8c4d4a1cff2285f2d189050f522854094df149,` (20) · H4 `S:7873756f3719637e320099177e5a7a8c8df13457,` (16) · Body/Large `S:411f80490bb9fd11eaecd94e7ce88851713510e3,` · Body/Default `S:b9b0292ed2b181e32b8638cb94b4fc45229f42f2,` (14) · Body/Medium `S:c823869b385b47b24dd334f7a0d99353736ab738,` (14/500) · Body/Small `S:6b3906f356decfaae7626eb86a5f5f5fc01b56d8,` (12) · Label/Button `S:2813988c07fb2c14ade8a372996733ee59b91403,` · Label/Badge `S:4291aacbcfd16ab7274174263d18029a3f638d5c,` · Label/Caption `S:aad1a439084f5eb1768fa2ed30366ff3ab249145,` (11/500) · Label/Overline `S:8a701f0d09e3f8db03a380339a46acfabc1b81af,` (11/600, +0.05em, uppercase).
Fuentes: Inter Regular / Medium / Semi Bold / Bold (cargar con `figma.loadFontAsync({family:"Inter",style:"Semi Bold"})`).
Effect styles: Shadow/Subtle `S:15eb6681bcffc9b83835b9692ae58720eac727dc,` · Dropdown `S:0a51b67f59652c8edfacc8af074c040e81511a1e,` · Modal `S:c3ec68e3cdf1e59d6e36fec7e805d6e284f25e73,` · Drawer `S:99913acce16f254ac3a78aa9c7dce7e2512c5174,` · FloatingNav `S:e617452a5ea968008af00ce1d4eba740b5b27e0c,`.
Color tokens (colección `2 · Tokens / Color`; bind con `figma.variables.setBoundVariableForPaint(paint,'color',variable)`): background/main VariableID:42:56 (#FFF) · background/subtle 42:57 (#F9FAFB) · text/primary 42:58 (#111827) · text/secondary 42:59 (#6B7280) · text/disabled 42:60 (#9CA3AF) · text/inverse 42:61 · text/link 42:62 (#2563EB) · border/default 42:63 (#E5E7EB) · border/strong 42:64 (#D1D5DB) · border/focus 42:65 · divider/default 42:66 (#F3F4F6) · divider/soft 42:67 · primary/default 42:68 (#2563EB) · primary/hover 42:69 (#1D4ED8) · primary/subtle 42:70 (#EFF6FF) · primary/subtle-border 42:71 (#DBEAFE) · success/default 42:72 (#16A34A) · success/subtle 42:73 (#F0FDF4) · success/text 42:74 (#15803D) · warning/default 42:75 (#F59E0B) · warning/subtle 42:76 (#FFFBEB) · warning/text 42:77 (#B45309) · error/default 42:78 (#DC2626) · error/subtle 42:79 (#FEF2F2) · error/text 42:80 (#B91C1C) · info/default 42:81 · info/subtle 42:82 · info/text 42:83 (#1D4ED8) · accent/default 399:7 (#7C3AED) · accent/subtle 399:8 (#F5F3FF) · accent/text 399:9 (#6D28D9).
Spacing: spacing/4..80 (VariableID:42:85..42:95: 4,8,12,16,20,24,32,40,48,64,80). Radius: none 42:97, xs 4 (42:98), sm 8 (42:99), md 12 (42:100), lg 16 (42:101), xl 20 (42:102), pill 999 (42:103). Sizing: icon/xs 12, sm 16, md 20, lg 24, xl 32; touch/minimum 44; touch/comfortable 48.
Si vincular variables resulta costoso, usar los hex directos (son idénticos) y priorizar text styles.

## Plantillas de referencia (copiar estructura, no clonar contenido)
List `120:2` · Table `537:94` (la más completa: header, summary cards, filter bar, divider, table block, table, footer) · Record Detail `121:2` · Form `124:2` · Operational Dashboard `125:2` (header + fila 4 KPI 267×112 + zona alertas 1116×132 + gráfico 720×272 + panel 380×252) · Settings `126:2` · Analytics `129:2` (tabs 32 px) · Feed `131:2`.
Se pueden clonar frames de plantilla con `(await figma.getNodeByIdAsync("537:94")).clone()` y luego mover a la página MES y editar textos — es la forma más barata de conservar el estilo exacto. Tras clonar: renombrar, cambiar textos (cargar fuentes de cada TEXT via getStyledTextSegments), ajustar filas.

## Convenciones MES
- Idioma: español (Perú). Empresa: Yamboly (helados). Líneas: L1 Paletas, L2 Conos, L3 Vasos, L4 Sándwich, L5 Bombones. Turnos: Mañana (06:00–14:00), Tarde (14:00–22:00), Noche (22:00–06:00). Productos: Paleta Chocolate 80 ml, Cono Vainilla 120 ml, Vaso Lúcuma 150 ml, Sándwich Clásico, Bombón Fresa. Máquinas: Llenadora Tetra Hoyer L1, Túnel de frío L1, Envolvedora L2, Codificadora Domino L3, Pasteurizador PT-01. Causas parada (codificadas): PM-01 Falla mecánica, PE-02 Falla eléctrica, PL-03 Limpieza CIP, PC-04 Cambio de producto, PA-05 Falta de insumo, PO-06 Ajuste operativo, PS-07 Sin personal. Mermas: MP (materia prima), EP (en proceso), PT (producto terminado); causas MR-01 Sobrepeso, MR-02 Rotura, MR-03 Arranque, MR-04 Contaminación.
- Roles: Maquinista, Supervisor de línea, Encargado de merma, Jefe de producción (administrador), Investigador.
- Nombres de frames: `MES / <Módulo> / <Pantalla> / <Estado> / 1440` (o `/ 1024` tablet). Estados: Default, Empty, Loading, Error cuando aplique.
- Colocar frames en la página con gap 200 px horizontal; sección (SECTION node) por pantalla opcional.
- Marcar con nota (texto Label/Caption gris) los componentes "MES-local" que no existen en MDS: LineCard (tarjeta de línea en tiempo real), Stepper, KPI card, Alert card, Insight card, Tabs, EmptyState, Breadcrumb, Drawer, Modal, Heatmap, Chart placeholders (usar rectángulos/vectores simples con paleta brand/500, green/500, amber/500, red/500).
- Cada pantalla con: breadcrumb (Body/Small: "Inicio / Módulo / Pantalla") encima del título, título Heading/H2, subtítulo Body/Small, acciones a la derecha.

## Componentes MES-local YA CREADOS (página 01 Shell & Patterns, id 2144:4) — INSTANCIAR ESTOS
| Nombre | id | Tipo | Tamaño | Propiedades / variantes |
|---|---|---|---|---|
| MES / Sidebar | 2147:5 | COMPONENT | 260×1000 | sin props. Activo por defecto "Inicio". Para cambiar activo en la instancia: frame `Item / <Nombre>` → fills #EFF6FF, TEXT e icono #1D4ED8; el anterior → fills [] y #6B7280. Ítems: Inicio, Tiempo real, Alertas (badge "3"), Pasteurización, Órdenes de fabricación, Reportes, Analítica IA, Personal, Configuración, Evidencia de tesis |
| MES / Topbar | 2149:13 | COMPONENT | 1180×64 | — |
| MES / Page header | 2149:39 | COMPONENT | 1116×auto | Title#2149:3, Subtitle#2149:4, Crumb1#2149:5, Crumb2#2149:6, Crumb3#2149:7 (los botones de acción se editan en la instancia) |
| MES / Breadcrumb | 2149:31 | COMPONENT | hug | Crumb1#2149:0, Crumb2#2149:1, Crumb3#2149:2 |
| MES / Section title | 2149:59 | COMPONENT | 1116×auto | Title#2149:8, Description#2149:9 |
| MES / Tabs | 2150:51 | SET | 640×40 | Style = Underline \| Pills (textos de tabs se editan en la instancia) |
| MES / KPI card | 2150:75 | SET | 267×112 | Trend = Up \| Down \| Flat · Label#2150:6, Value#2150:7 (delta/contexto editar TEXT hijos) |
| MES / Alert card | 2151:58 | SET | 280×auto | Severity = Warning \| Critical \| Info · Title#2151:6, Message#2151:7 |
| MES / Insight card | 2151:59 | COMPONENT | 280×auto | Title#2151:8, Body#2151:9 |
| MES / Stepper | 2152:87 | SET | 520×auto | Step = 1 \| 2 \| 3 (labels editar TEXT hijos) |
| MES / Empty state | 2152:118 | SET | 400×auto | Kind = NoData \| NoResults \| Error · Title#2152:6, Body#2152:7 |
| MES / Line card | 2153:238 | SET | 356×auto | State = Produciendo \| Parada \| SinOrden \| Alerta \| Sugerida · Line#2153:10, Order#2153:11 |
| MES / Modal | 2154:119 | SET | 560×auto | Kind = Default \| Danger · Title#2154:2 (body es slot: añadir hijos al frame "Body") |
| MES / Drawer | 2154:120 | COMPONENT | 480×1000 | — (header/body/footer editables en la instancia) |
| MES / Table header | 2155:89 | COMPONENT | 1116×40 | textos de columna editar en la instancia |
| MES / Table row | 2155:107 | COMPONENT | 1116×44 | OF#2155:0, Producto#2155:1, Linea#2155:2, Turno#2155:3, Avance#2155:4, Registrado#2155:5; badge (celda 7) y ⋯ (celda 8) editar en instancia |
Columnas de tabla: 44 · 140 · 220 · 140 · 120 · 120 · 120 · 212 = 1116. Para tablas con otras columnas, construye filas propias con las mismas medidas de celda (alto 44, pad-x 12, divisor 1px #F3F4F6) o adapta el ancho de las celdas de la instancia (detach permitido para tablas).
Instanciar: sets → `(await figma.getNodeByIdAsync("2153:238")).defaultVariant.createInstance()`; sueltos → `.createInstance()`; luego `inst.setProperties({State:'Parada','Line#2153:10':'L3 · Vasos'})`.
Composición: Sidebar x0 y0 · Topbar x260 y0 · Content frame x260 y64 (VERTICAL, pad 28/32/40/32, gap 24, ancho 1180 → útil 1116).

## Incidencias conocidas (leer)
- Tag MDS (60:92) usa la fuente "Inter Display Medium", NO disponible: `setProperties({'Label#60:0':…})` falla. Solución: fijar variante por setProperties y editar el TEXT hijo cambiando antes `fontName = {family:"Inter",style:"Medium"}` (cargar Inter Medium) y luego `characters`.
- Dropdown inline (442:58) props reales: `Label#442:16`, `Value#442:20`, `Show label#442:24`, `State`.
- `figma.createAutoLayout()` nace con fill blanco: en fondos oscuros poner `fills=[]`.
- MES/Tabs tiene 4 pestañas fijas; si necesitas más, añade un TEXT extra en la instancia (o detach).
