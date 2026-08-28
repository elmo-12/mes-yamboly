# Design System MES Yamboly — medidas exactas leídas de Figma

Fuente: `WOfwZEmPx1Hcw7ehaIsnpx`, página **01 Shell & Patterns (2144:4)** + frames de pantalla. Todo lo marcado **[FIGMA]** está leído con `get_design_context`/`get_metadata` en esta sesión (medidas literales del archivo). **[KIT]** proviene de `docs/figma-kit.md` / `docs/mds-spec.md` (verificado en sesiones anteriores). **[INFERIDO]** = deducido de posiciones/medidas, no leído como propiedad.

Regla general: nunca escribir hex ni px sueltos en componentes; todo por token de `@mes/ui/theme.css`. Los hex de este documento son la referencia de a qué token corresponde cada uso.

---

## 0. Tokens usados por los patrones MES (subconjunto real observado)

| Token | Hex | Dónde aparece realmente en las pantallas MES |
|---|---|---|
| `background/main` | `#FFFFFF` | página, sidebar, topbar, todas las cards, filas de tabla |
| `background/subtle` | `#F9FAFB` | search del topbar, chip de contexto en modales, círculo de empty state, panel izquierdo del login, chip cronómetro TRI |
| `divider/default` | `#F3F4F6` | borde derecho del sidebar, borde inferior del topbar, divisores de modal/drawer, divisores de fila de tabla, baseline de Tabs, track del timeline de Line card |
| `border/default` | `#E5E7EB` | borde de KPI/Insight/Line/Summary card, botones Secondary, inputs, tags, línea bajo la cabecera de tabla, círculo pendiente del stepper |
| `border/strong` | `#D1D5DB` | borde de Checkbox/Radio sin marcar |
| `text/primary` | `#111827` | títulos, valores, texto de celdas principales |
| `text/secondary` | `#6B7280` | subtítulos, labels de fila, ítems inactivos del sidebar |
| `text/disabled` | `#9CA3AF` | overlines de tabla y de métricas, placeholders, texto de contexto de KPI |
| `neutral/text` | `#374151` | texto de celda secundaria, cuerpo de Alert card, label de Input, texto de Tag |
| `primary/default` | `#2563EB` | Primary, indicador de Tabs, stepper activo, links de tabla, borde de Summary activa, "Limpiar filtros" |
| `primary/hover` = `info/text` | `#1D4ED8` | ítem activo del sidebar (texto+icono), texto de Tag/Badge Informational |
| `primary/subtle` | `#EFF6FF` | fondo del ítem activo del sidebar, Tag Selected, pill de Tabs activa, icon box de Insight, badge Informational |
| — (borde de selección) | `#93C5FD` | **borde de Tag Selected** (no está en la tabla de tokens del MDS; añadir como `primary/subtle-border`, VariableID 42:71 es `#DBEAFE`, el usado en pantallas es `#93C5FD`) |
| `success/*` | `#16A34A` / `#15803D` / `#F0FDF4` | barra de timeline, delta positivo, OEE alto, Badge Success |
| `warning/*` | `#F59E0B` / `#B45309` / `#FFFBEB` | barra de Alert card Warning, OEE medio-bajo, Badge Warning |
| `error/*` | `#DC2626` / `#B91C1C` / `#FEF2F2` | borde de Line card en parada, Danger, Badge Critical, badge del sidebar |

Tipografía (Inter, estilos confirmados en las lecturas): `Heading/H1 32/600/40/−0.64` · `H2 24/600/32/−0.24` · `H3 20/600/28/−0.20` · `H4 16/600/24/0` · `Body/Large 16/400/24` · `Body/Default 14/400/20` · `Body/Medium 14/500/20` · `Body/Small 12/400/16` · `Label/Button 14/500/20` · `Label/Badge 12/500/16` · `Label/Caption 11/500/16/+0.11` · `Label/Overline 11/600/16/+0.55` (siempre en MAYÚSCULAS).
Tamaños fuera de escala que **sí** aparecen y hay que soportar: **28/600 lh34** (valor de KPI), **22/600** (número de Summary card), **15/500** (Button lg y campos lg), **13/500 y 13/400** (celdas de tabla densa, Button sm), **12.5/500** (label de Summary card), **11/400** (nota de métrica).

Radios reales: `4` (progress mini, checkbox sm), `6` (checkbox md, alert chip de Line card), `8` (ítem de sidebar, Tag, search del topbar, Alert card, icon box, chip de contexto), `12` (botones, inputs, KPI/Insight/Line/Summary card, dropdown inline), `16` (Modal), `999` (Badge, stepper, pills de Tabs, chip TRI, avatar).
Sombras: solo `Shadow/Modal` en Modal y `Shadow/Drawer` en Drawer. Ninguna card las lleva.

---

## 1. Shell

### 1.1 Sidebar — `MES / Sidebar` 2147:5 **[FIGMA]**
260 × alto de pantalla (1000 en el master; 1080/1194/1364 en las instancias, siempre full-height).

- Contenedor: `bg #FFFFFF`, `border-right 1px #F3F4F6`, `padding 20px 16px`, columna, `gap 4`.
- **Logo**: fila `gap 10`, `padding 4px 8px 16px 8px`. Marca 28×28 `bg #2563EB` `r8`; texto "Yamboly MES" 14/600 `#111827`.
- **Título de grupo**: `padding 16px 20px 8px 20px`; texto Label/Overline 11/600 ls 0.55 `#9CA3AF`, mayúsculas. Grupos: `OPERACIÓN`, `CONTROL`, `ADMINISTRACIÓN`.
- **Ítem**: alto **36**, `padding 9px 10px`, `gap 10`, `r8`, ancho completo.
  - Icono **18×18** (no 20).
  - Label 14/500; inactivo `#6B7280`; **activo: fill `#EFF6FF`, texto e icono `#1D4ED8`**.
  - Contador opcional a la derecha (Alertas): Badge `bg #FEF2F2`, texto `#B91C1C` 12/500, `padding 3px 10px`, `r999`.
- **Spacer** `flex:1` antes del pie.
- **Pie de usuario**: `padding 10`, `gap 10`, `r10`; avatar 28; nombre 12/600 `#111827`; rol 11/400 `#6B7280`.
- Ítems reales (10, no 11 como dice la descripción del componente): OPERACIÓN → Inicio · Tiempo real · Alertas (3) · Pasteurización; CONTROL → Órdenes de fabricación · Reportes · Analítica IA; ADMINISTRACIÓN → Personal · Configuración · Evidencia de tesis.
- ⚠️ Inconsistencia detectada: en la instancia de Órdenes el ítem inactivo "Inicio" quedó en `#374151` en vez de `#6B7280`. En código usar siempre `#6B7280` para inactivo.

### 1.2 Topbar — `MES / Topbar` 2149:13 **[FIGMA]**
1180 × **64**, en `x=260, y=0`. `bg #FFFFFF`, `border-bottom 1px #F3F4F6`, `padding-x 32`, fila `gap 16`, items center.

| Elemento | Medidas |
|---|---|
| Search | **320×36**, `bg #F9FAFB`, `r12`, `padding-x 12`, `gap 8`; icono `search` 16; placeholder 14/400 `#9CA3AF` — texto literal `Buscar OF, lote o línea…   ⌘K` |
| Spacer | `flex:1` |
| Selector de sede | Dropdown inline: `padding 6px 8px`, `r8`, `gap 6`; label "Sede" 14/400 `#6B7280` + valor "Lima" 14/500 `#111827` + chevron 16 |
| Campana | grupo **22×20** (bell 20 + punto de alerta rojo arriba a la derecha) |
| Ayuda | `help-circle` 20 |
| Avatar | 32×32 circular |

### 1.3 Contenido **[FIGMA]**
Frame `Content` en `x=260, y=64`, ancho **1180**, alto = alto de pantalla − 64. `bg #FFFFFF`, columna, `padding 28px 32px 40px 32px`, **`gap 24`** entre secciones. **Ancho útil 1116** (todos los bloques miden 1116).
Separación vertical entre bloques mayores observada en Home: KPI row 1 (y128) → KPI row 2 (y264) = 136 = 112 + **24**; Section title (y400) → Alert row (y481) = 81 → el Section title de 57 deja **24** de gap. Es decir: el `gap 24` del auto-layout gobierna todo; no hay 32/48 en las pantallas MES.

### 1.4 Page header — `MES / Page header` 2149:39 **[FIGMA]**
**1116×76**, fila `gap 24`, items center.
- Columna `Titles`, `gap 6`:
  1. **Breadcrumb** (también existe suelto, 2149:31, 170×16): fila `gap 6`, items center; crumbs 12/400 lh16 `#6B7280`, **último crumb `#374151`**; separador `chevron-right` **14×14**.
  2. **Título** H2 24/600 lh32 ls −0.24 `#111827`.
  3. **Subtítulo** 12/400 lh16 `#6B7280`.
- `Spacer` `flex:1`.
- `Actions`: fila `gap 12`; patrón fijo = 1 Button Secondary md + 1 Button Primary md (única Primary de la pantalla).

### 1.5 Section title — `MES / Section title` 2149:59
**1116×57** **[FIGMA, tamaño]**. Composición observada en el bloque equivalente de Órdenes **[FIGMA]**: columna `gap 4`, título **16/600** `#111827` + descripción **12/400** `#6B7280`; el resto hasta 57 es holgura superior (~13). Se usa como cabecera de bloque y admite acciones a la derecha (search 260×40 + botones Secondary) en la misma fila de 1116.

---

## 2. Tarjetas funcionales (las únicas cards permitidas)

### 2.1 KPI card — `MES / KPI card` 2150:75 · Trend = Up | Down | Flat **[FIGMA]**
**267×112**. `bg #FFFFFF`, `border 1px #E5E7EB`, `r12`, `padding 16`, columna `gap 6`.
- Label: Label/Overline 11/600 ls 0.55 **`#6B7280`** (ojo: en tablas el overline es `#9CA3AF`, aquí es `#6B7280`).
- Valor: **28/600 lh 34** `#111827`.
- Fila `Delta`, `gap 6`, ancho completo:
  - Up: icono `arrow-up` **14** + `+4,2 %` 12/500 `#15803D` + contexto 11/400 `#9CA3AF`.
  - Down: icono `arrow-down` 14 + valor 12/500 `#B91C1C` + contexto.
  - Flat: barra **10×2 r1 `#9CA3AF`** + valor 12/500 `#6B7280` + contexto.
- Grid: **4 por fila, gap 16** (267+16=283). Segunda fila a +136 (112+24). Máx. 4 por fila / 7 en pantalla.

### 2.2 Alert card — `MES / Alert card` 2151:58 · Severity = Warning | Critical | Info **[FIGMA]**
**280×auto** (118 con 3 líneas; en Home se estira a 361,33 con `gap 16` en fila de 3). `r8`, **sin borde y sin sombra**.
- `Bar` izquierda **3px**, `r4`, alto completo: Warning `#F59E0B` · Critical `#DC2626` · Info `#2563EB`.
- `Content`: `padding 14px 14px 14px 12px` (pl 12 / pr 14 / py 14), columna `gap 8`.
- Título 14/600: Warning `#B45309` · Critical `#B91C1C` · Info `#1D4ED8`.
- Mensaje 12/400 lh18 `#374151`.
- Footer fila space-between: Badge del mismo tono (`Advertencia` / `Crítica` / `Informativa`) + link "Ver alerta" 12/500 `#2563EB`.
- Fondos: `#FFFBEB` / `#FEF2F2` / `#EFF6FF`.

### 2.3 Insight card — `MES / Insight card` 2151:59 **[FIGMA]**
**280×227**. `bg #FFFFFF`, `border 1px #E5E7EB`, `r12`, `padding 16`, columna `gap 10`.
- Icon box **32×32**, `r8`, `bg #EFF6FF`, icono `insight` **20** centrado.
- Título 14/600 lh20 `#111827`.
- Cuerpo 12/400 lh18 `#6B7280`.
- Footer: Badge Informational con la confianza del modelo (`Confianza 82 %`).

### 2.4 Summary card (filtro) — instancia MDS `537:*` **[FIGMA, en Órdenes y Alertas]**
**267×80**. `bg #FFFFFF`, `r12`, `padding 16`, columna `gap 6`.
- Inactiva: `border 1px #E5E7EB`, label 12.5/500 `#6B7280`.
- **Activa: `border 1.5px #2563EB`, label 12.5/500 `#2563EB`.**
- Número 22/600 `#111827`.
- Fila de 4, `gap 16` (283 de paso). Es interactiva: un clic aplica el filtro. Solo una activa.

### 2.5 Line card — `MES / Line card` 2153:238 · State = Produciendo | Parada | SinOrden | Alerta | Sugerida **[FIGMA]**
**356×auto**: 227 (Produciendo / Parada / SinOrden), **281** (Alerta), **254** (Sugerida).
`bg #FFFFFF`, `r12`, `padding 16`, columna `gap 12`. Borde `1px #E5E7EB`, **excepto Parada: `1.5px #DC2626`**.

| Zona | Medidas |
|---|---|
| Header | fila space-between: nombre de línea 16/600 `#111827` + Badge de estado |
| Badge por estado | Produciendo → Success (`#F0FDF4`/`#15803D`) · En parada · N min → Critical · Sin orden → Neutral (`#F3F4F6`/`#374151`) · Riesgo de parada N % y Parada detectada por sensor → Warning (`#FFFBEB`/`#B45309`) |
| Orden | 12/400 lh18 `#6B7280`, ancho completo |
| Métricas | fila `gap 12`, 3 columnas `flex:1`, cada una columna `gap 3`: overline 11/600 ls .55 `#9CA3AF` + valor 14/600 `#111827` + nota 11/400 `#9CA3AF` (PRODUCIDO / VELOCIDAD / TURNO) |
| Timeline | alto **8**, `r4`, `bg #F3F4F6`; segmentos `flex:1` — verde `#16A34A` (produciendo), ámbar `#F59E0B` (microparada), rojo `#DC2626` (parada), gris `#E5E7EB` (sin dato) y `#9CA3AF` (tramo sugerido). 4 segmentos en estados base, 5 en Alerta/Sugerida |
| Alert chip (solo Alerta/Sugerida) | ancho completo, `padding 6px 10px 6px 8px`, `r6`, `gap 6`; icono 14 (`alert-triangle` / `activity`); texto 11/500 lh15. Alerta: `bg #FFFBEB`, texto `#B45309`. Sugerida: `bg #EFF6FF`, texto `#1D4ED8` |
| Acciones (base y Alerta) | fila `gap 8`, botones **lg h48 r12**: Primary `flex:1` (icono 20 + label **15**/500) + Secondary `flex:1` + Secondary icon-only `px 14`. SinOrden: Primary "Iniciar orden" + icon-only |
| Acciones (Sugerida) | 2 botones **h36 px12**, texto **13**: Primary "Confirmar parada" + Secondary "Descartar" |

> Excepción MDS documentada: cada Line card lleva su propio Primary ("Parada"/"Iniciar orden"/"Confirmar parada"). Es la única pantalla con varios Primary.

---

## 3. Navegación y datos

### 3.1 Tabs — `MES / Tabs` 2150:51 · Style = Underline | Pills **[FIGMA]**
640×**40** (ancho hug en uso real).
- **Underline**: fila `gap 24`; cada tab alto 39 con `padding-top 13`, columna `gap 8`; label 14/500 (`#111827` activo, `#6B7280` inactivo); indicador **2px `#2563EB`** del ancho del tab; **baseline 1px `#F3F4F6`** a lo ancho del contenedor.
- **Pills**: fila `gap 8`; pill `padding 7px 14px`, `r999`; activo `bg #EFF6FF` + texto `#1D4ED8`; inactivo sin fondo, texto `#6B7280`.
- Limitación de Figma: el componente tiene 4 pestañas fijas; los frames con más pestañas están detachados. En código, `Tabs` acepta N ítems.

### 3.2 Tabla integrada (sin card) **[FIGMA, Órdenes 2156:4160 y Home 2163:17435]**
- **Cabecera**: alto **40**, `bg #FFFFFF`, celdas `padding-x 12`, texto Label/Overline **11/600 ls .55 `#9CA3AF`** en MAYÚSCULAS. Debajo, línea **1px `#E5E7EB`** (más marcada que los divisores de fila).
- **Fila**: alto **44** (densidad Standard), `bg #FFFFFF`, celdas `padding-x 12`, divisor inferior **1px `#F3F4F6`**. Sin líneas verticales, sin card envolvente.
- Primera columna de selección: **44 px**, Checkbox sm 16.
- Última columna de acciones: 60 px con `dots-horizontal` **18**.
- Tipografía de celda en tabla densa (Órdenes): **13/400 `#374151`**; texto principal 13/400 `#111827`; **link 13/500 `#2563EB`**; métrica 13/500 con color semántico.
- Tipografía de celda en tabla de dashboard (Home): **14** (Body/Default).
- **Mini barra producido/plan** en celda: columna `gap 4` → texto 11/500 `#374151` + track alto **4**, `r2`, `bg #E5E7EB` con relleno `r2`; color: `#16A34A` ≥95 % del plan, `#2563EB` 85–95 %, `#F59E0B` <85 %.
- Color del OEE en celda: `#15803D` ≥85 %, `#111827` 75–85 %, `#B45309` <75 %.
- **Footer**: `padding-top 16`, fila `gap 8`: texto 12/400 `#6B7280` ("Mostrando 1–8 de 1 248 órdenes") + Spacer + 2 Button Secondary **sm (36, px 12, texto 13)** "Anterior"/"Siguiente".
- Anchos verificados — **Órdenes** (suman 1116): `44 · 108 · 84 · 106 · 178 · 76 · 144 · 60 · 64 · 88 · 104 · 60`.
- Anchos verificados — **Estado de líneas (Home)**: `140 · 120 · 140 · 220 · 160 · 140 · 196`.
- Anchos verificados — **Alertas**: `100 · 150 · 160 · 260 · 140 · 120 · 110 · 76`.
- Barra de probabilidad en celda (Alertas): track **56×6** + porcentaje 12 a 8 px de distancia.

### 3.3 Filter bar **[FIGMA]**
Dos disposiciones reales, ambas válidas:
- **En línea (Órdenes)**: columna `gap 12`; cada grupo es una fila `gap 8` items center con el label Overline 11/600 `#9CA3AF` de **ancho fijo 96** + N Tags. "Limpiar filtros" (12/500 `#2563EB`) va al final de la **primera** fila, empujado por un spacer.
- **Apilada por grupo (Alertas)**: bloque de 1116×248; primero una fila `Actions` de 16 con "Limpiar filtros" alineado a la derecha; luego grupos de **50 de alto** (label 16 + `gap 6` + fila de pills 28), separados **58** (paso y: 24 → 82 → 140 → 198).

### 3.4 Tag (pill de filtro / selección) — MDS `60:92` **[FIGMA]**
- **Tamaño de filtro (28)**: alto 28, `padding-x 10`, `r8`, texto 12/500. Default `bg #FFFFFF` + `border 1px #E5E7EB` + `#374151`. **Selected `bg #EFF6FF` + `border 1px #93C5FD` + `#1D4ED8`**.
- **Tamaño lg (32)**, usado en la captura rápida: alto 32, `padding-x 12`, `r8`, texto **14**/500; mismos colores por estado. Envuelven con `gap 8` (`flex-wrap`), nunca scroll horizontal.
- Estados del set: Default · Hover · Pressed · Focus · Selected · Disabled **[KIT]**.
- ⚠️ La variante Default del master usa la fuente `Inter Display Medium` (no disponible): en código usar Inter Medium.
- Regla: el Tag es lo clicable; el Badge nunca lo es.

### 3.5 Badge — MDS `53:32` **[FIGMA]**
`padding 3px 10px`, `r999`, alto **21**, texto **12/500**. 6 colores (fondo/texto): Neutral `#F3F4F6`/`#374151` · Informational `#EFF6FF`/`#1D4ED8` · Success `#F0FDF4`/`#15803D` · Warning `#FFFBEB`/`#B45309` · Critical `#FEF2F2`/`#B91C1C` · Accent `#F5F3FF`/`#6D28D9`.
Semántica fijada para MES: `Produciendo/Validada/Atendida/Confirmada/Vigente/Operativa` = Success · `Activa/Por validar/Pendiente/Mantenimiento/Generando/Riesgo/Sugerida` = Warning · `Vencida/Incompleta/En parada` = Critical · `En curso/Nueva/Sincronizando` = Informational · `Cerrada/Archivada/Sin orden` = Neutral. Confianza ≥85 Success, 70–84 Informational, <70 Neutral. Riesgo ≥70 Critical, 50–69 Warning, <50 Neutral.

---

## 4. Formularios y controles

### 4.1 Button — MDS `58:137` **[FIGMA en instancias + KIT]**
| Size | Alto | Padding-x | Icon-only | Texto | Icono | Gap |
|---|---|---|---|---|---|---|
| sm | **36** | 12 | `px 10`, icono **16** | **13**/500 | 20 (16 en icon-only) | 8 |
| md | **40** | 16 | `px 10` | **14**/500 | 20 | 8 |
| lg | **48** | 20 | `px 14` | **15**/500 | 20 | 8 |

Radio **12** en los tres. Jerarquías: Primary `bg #2563EB` + texto `#FFFFFF`; Secondary `bg #FFFFFF` + `border 1px #E5E7EB` + texto `#111827`; Danger `bg #DC2626` + `#FFFFFF`.
Estados **[KIT]**: hover Primary `#1D4ED8`, Secondary `#F9FAFB`; pressed Secondary `#F3F4F6` (Primary usar `#1E40AF`, el archivo repite el hover — desviación documentada); focus ring `0 0 0 4px rgba(37,99,235,.22)` (danger `rgba(220,38,38,.22)`) y en Secondary además borde `#2563EB`; disabled `bg #F3F4F6` + texto `#9CA3AF` (nunca opacidad); loading spinner 14 + gap 8 manteniendo el label.
Regla: **un solo Primary por pantalla** (excepción Line card). Danger siempre con modal de confirmación.

### 4.2 Input field — MDS `62:290` **[FIGMA]**
Wrapper columna `gap 6`.
- **Label**: 13/500 `#374151` (visible siempre).
- **Campo md (40)**: `padding-x 12`, `r12`, `bg #FFFFFF`, `border 1px #E5E7EB`; valor 14/400 `#111827`, placeholder 14/400 `#9CA3AF`; con icono leading 16 y `gap 8`.
- **Campo lg (48)**: `padding-x 14`, texto **15**/400 (login, formularios táctiles).
- **Hint**: 12/400 `#6B7280` bajo el campo.
- **Destructive**: borde y hint en `#DC2626`/`#B91C1C`, focus ring rojo.
- Search de tabla: **260×40** con icono `search` 16 y placeholder.
- Bloques compuestos observados: Input 300×83 (label + campo 40 + hint) en el modal de captura; Input 432×62 (label + campo) en el drawer de alertas.

### 4.3 Checkbox / Radio — MDS `85:530` **[FIGMA]**
- **sm 16×16**, `r4`, `border 1px #D1D5DB` — uso en tablas densas.
- **md 20×20**, `r6`, `border 1px #D1D5DB` — uso por defecto; con texto: fila `gap 10`, columna `gap 2` con label 14/500 `#111827` + supporting 12/400 `#6B7280`.
- Radio = mismo componente con `Type=Radio` (círculo). Indeterminate solo en la cabecera "seleccionar todo".
- Selección con Checkbox exige acción "Guardar"; cambios instantáneos van con Toggle.

### 4.4 Dropdown inline — MDS `442:58` **[FIGMA]**
Sin borde: `padding 6px 8px`, `r8`, `gap 6`; label 14/400 `#6B7280` + valor 14/500 `#111827` + chevron **16**. Uso: selector de sede en el topbar, selectores de turno/periodo en barras de herramientas.

### 4.5 Dropdown field / Select — MDS `441:2093` **[KIT — no leído en esta sesión]**
300×88 con label + helper; `Size` md|sm|lg; `State` Default|Hover|Focus|Open|Filled|Disabled|Read only|Error|Warning. Menú: `442:59` 256×207 con `Shadow/Dropdown`; ítem `442:42` **240×36**, `Type` Default|Checkbox|Danger. Alturas de campo iguales a Input (36/40/48), `r12`.

### 4.6 Toggle — MDS `62:603` **[KIT — no leído]**
`Pressed` True|False · `Size` sm|md · `State` · `Text` True|False con label + supporting. Usar para cambios que se aplican al instante ("Afecta OEE", "Notificar por n8n").

### 4.7 Tooltip — MDS `86:88` **[KIT — no leído]**
`Theme` Dark|Light · `Arrow` None|Top|Bottom|Left|Right · `Supporting` True|False. Con `Shadow/Dropdown`.

### 4.8 Filter pill — MDS `459:4053` **[KIT — no leído]**
Alto **32**; `State` Default|Hover|Open|Active|Disabled; props Label, Prefix, Count. En las pantallas MES construidas **no se usó**: los filtros se resolvieron con Tag 28. Mantener el Tag como patrón de filtro y reservar Filter pill para filtros con contador/desplegable.

---

## 5. Superposiciones flotantes

### 5.1 Modal — `MES / Modal` 2154:119 · Kind = Default | Danger **[FIGMA]**
Ancho **560** (default) / **640** (flujos de captura con stepper). `bg #FFFFFF`, **`r16`**, `Shadow/Modal` = `0 12px 32px -8px rgba(17,24,39,.16), 0 4px 8px -4px rgba(17,24,39,.08)`.
- **Header**: `padding 20px 24px` (alto 76), fila `gap 12`: título **H3 20/600 lh28 ls −0.2** + Spacer + Button Secondary icon-only **36** (`x-mark` 16, `px 10`, `r12`).
  - En los flujos de captura se añade a la derecha el **chip cronómetro TRI**: `bg #F9FAFB`, `border 1px #E5E7EB`, `r999`, `padding 4px 10px`, `gap 6`, icono `stopwatch` 14 + texto Label/Caption 11/500 ls .11 `#6B7280` (`00:23`). Alimenta el KPI TRI.
- Divider **1px `#F3F4F6`**.
- **Body slot**: `padding 20px 24px 24px 24px`, columna `gap 8` (o **16** en formularios). Overline de sección 11/600 `#9CA3AF` + párrafo 14/400 **lh 22** `#374151`.
- Divider. **Footer**: `padding 16px 24px`, fila `gap 12` `justify-end`: Secondary md + (Primary md | Danger md).
- Danger: mismo layout, overline "ACCIÓN IRREVERSIBLE" y botón `bg #DC2626`.
- Overlay de pantalla completa `rgba(17,24,39,.5)`; el Primary de la pantalla de fondo queda Disabled.
- Alturas de referencia: 262 (Default), 565 (Captura paso 1 con stepper + 7 tags + input).

### 5.2 Drawer — `MES / Drawer` 2154:120 **[FIGMA]**
**480 × alto de pantalla**, anclado a la derecha (`x=960` en 1440). `bg #FFFFFF`, `Shadow/Drawer` = `-8px 0 24px -6px rgba(17,24,39,.12)`. Scrim a pantalla completa por debajo.
- **Header** `padding 20px 24px` (76): título H3 20/600 + Spacer + close icon-only 36.
- Divider 1px `#F3F4F6`.
- **Body** `padding 20px 24px 24px`, columna `gap 8`: overline 11/600 `#9CA3AF`, párrafo 14/400 lh22 `#374151` y bloque `Meta` con `padding-top 12`, `gap 12`, filas space-between de **label 12/400 lh16 `#6B7280` · valor 13/500 `#111827`**.
- `Spacer` `flex:1`. Divider. **Footer** `padding 16px 24px`, `gap 12`, `justify-end`: Secondary + Primary.
- Secciones adicionales observadas en el drawer de alertas (2163:9291): separador 1px + bloque con overline; **barras de contribución** de factores (track alto **6**, ancho 432); zona "ATENDER" con Input 432×62 + 2 botones md; zona "RESULTADO REAL" con Badge, 2 Radio (20) y un Input; footer 480×72 con 2 botones.

---

## 6. Patrones de flujo y estado

### 6.1 Stepper — `MES / Stepper` 2152:87 · Step = 1 | 2 | 3 **[FIGMA]**
**520×52**. Fila: paso (120 de ancho) · conector (`flex:1`) · paso · conector · paso.
- Círculo **28**, `r999`: pendiente `border 2px #E5E7EB` + número 12/600 `#9CA3AF`; actual `bg #2563EB` + número 12/600 blanco; completado `bg #2563EB` + icono `check` **14** blanco.
- Label bajo el círculo, `gap 8`: 12/500 lh16 centrado (`#111827` actual/completado, `#9CA3AF` pendiente).
- Conector: `padding-top 13`, `padding-x 8`, línea **2px** (`#E5E7EB` pendiente, `#2563EB` recorrido).
- Para el CRISP-DM de Analítica se necesitan **6 pasos** (2163:16124): mismo patrón, N pasos.

### 6.2 Empty state — `MES / Empty state` 2152:118 · Kind = NoData | NoResults | Error **[FIGMA]**
**400×318** (Error 338). `padding 48px 32px`, columna centrada `gap 16`.
- Círculo **80**, `r999`: `bg #F9FAFB` (Error `bg #FEF2F2`), icono **40** (`inbox` / `search` / `alert-circle`).
- Textos centrados `gap 6`: título 16/600 lh24 `#111827` + cuerpo 14/400 lh20 `#6B7280`.
- Button **Secondary md**: "Registrar parada" / "Limpiar filtros" / "Reintentar".

### 6.3 Skeleton (loading) **[KIT]**
Rectángulos `#F3F4F6` `r8` con la geometría del bloque real (KPI 267×112, filas 44, etc.).

---

## 7. Gráficos (no existe componente de chart en MDS) **[FIGMA — Home 2163:17435]**
Se construyen a mano, **sin card**, sobre la página, con padding interno 16.

- **Fila de gráficos**: 1116×**272** = gráfico dominante **720×272** + panel **380×272**, `gap 16`.
- **Barras horizontales (OEE por línea)**: cabecera 688×24 a `16,16` con título H4 + spacer + nota "Meta 85 %" 12 `#6B7280`; área de plot 688×196 a `16,52`; una fila cada **39 px**: etiqueta 12 en x=0 (ancho 104), track **520×16** (`r` pill) `bg #E5E7EB`, relleno proporcional, valor 12 en x=636; **línea de meta punteada 1px** a `x = 104 + 520·meta` (546 para 85 %), alto 190.
- **Panel de ranking (Top causas)**: título H4 a `16,16`; lista 348 de ancho, una entrada cada **40 px**: fila de cabecera 16 (nombre 12 + spacer + minutos 12) + track **348×4** `r2` a +22 con relleno proporcional al máximo.
- Paleta única de gráficos: `#2563EB` (serie principal), `#16A34A` (favorable), `#F59E0B` (atención), `#DC2626` (crítico); gris `#9CA3AF` para series de referencia.

---

## 8. Login (fuera del shell) **[FIGMA — 2163:17066]**
1440×960 en dos mitades de **720**.
- **Panel de marca** (izquierda): `bg #F9FAFB`, `padding 80px 88px`, columna centrada `gap 24`. Logo: caja **44×44** `r12` `bg #2563EB` con icono `ice-cream` 24 + "Yamboly" 16/600. Título **H1 32/600 lh40 ls −0.64** "MES Yamboly". Frase Body/Large 16/400 lh24 `#6B7280` (ancho 460). Spacer 16. 3 bullets: fila `gap 12`, icono `check-circle` **20** + texto 14/400 `#374151`, separados `gap 16`.
- **Panel de formulario** (derecha): `bg #FFFFFF`, contenido centrado de **400** de ancho, columna `gap 20`: H2 "Iniciar sesión" · subtítulo 12/400 `#6B7280` · Input lg "Correo o DNI" · Input lg "Contraseña" · fila (Checkbox md "Recordarme" + spacer + link 14/500 `#2563EB`) · **Button Primary lg de ancho completo** · pie 12/400 `#9CA3AF` centrado.
- Estado error: Input `Destructive=True` con hint "Correo o contraseña incorrectos".

---

## 9. Checklist para el agente de Design System
1. `packages/ui/src/primitives`: Button, Badge, Tag, Input, Select/Dropdown, Checkbox, Radio, Toggle, Tooltip, Avatar, Spinner, Skeleton, ProgressBar (track 4/6/8 + relleno semántico).
2. `packages/ui/src/patterns`: Sidebar, Topbar, PageHeader, Breadcrumb, SectionTitle, Tabs, KpiCard, AlertCard, InsightCard, SummaryCard, LineCard, Stepper, EmptyState, Modal, Drawer, DataTable (header 40 / row 44 / footer), FilterBar, ChartFrame (contenedor sin card).
3. Nada de sombras fuera de Modal/Drawer/Dropdown/Tooltip/Popover. Nada de card sin función.
4. Densidad por defecto Standard (fila 44); Compact (32) solo en anexos de Evidencia si hace falta.
5. Añadir el token que falta en el MDS: `primary/subtle-border = #93C5FD` (borde de Tag Selected).
