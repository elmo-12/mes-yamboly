# Master Design System (MDS v2.3.1) — Especificación implementable

**Archivo:** `WOfwZEmPx1Hcw7ehaIsnpx` · Usuario: Sistemas (sistemas@yamboly.lat) · Plan: Professional (Full seat)
**URL:** https://www.figma.com/design/WOfwZEmPx1Hcw7ehaIsnpx/Master-Design-system--MDA---Copia-

> **Nota metodológica.** `get_metadata` sin `nodeId` solo devuelve la página activa (`42:2 Thumbnail`) — el listado de páginas del MCP está roto para este archivo. Las 39 páginas reales se enumeraron abriendo el archivo en Chrome y leyendo el panel "Páginas" del DOM; los node ids se obtuvieron por navegación y sondeo.
>
> **Limitación.** Al final de la sesión se alcanzó el límite de llamadas del MCP de Figma (`You've reached the Figma MCP tool call limit for your Full seat on the Professional plan`). Todo lo marcado **[EXTRAÍDO]** está verificado contra el archivo. Lo marcado **[PENDIENTE]** no se pudo leer y **no se ha inventado**. Lo marcado **[PROPUESTO]** es una recomendación explícita, no un dato del archivo.

---

## 1. Estructura del archivo — página → node id → contenido

39 páginas reales, organizadas en 4 secciones con separadores.

| # | Página | node id | Contenido |
|---|---|---|---|
| 1 | `Thumbnail` | **42:2** | Frame `Cover` 1440×810. Portada "MDS · Phase 1 · Foundations — In Review" |
| 2 | `Overview` | [PENDIENTE] | — |
| — | `FOUNDATIONS` (separador) | **46:2** | Vacía (0×0) |
| 3 | `↳ Colors` | [PENDIENTE] | Frames: `47:2` Design system header 1200×240, `50:2` Usage examples 828×459, `51:2` In context 956×267 |
| 4 | `↳ Typography` | **42:5** | Escala tipográfica (13 estilos de texto) |
| 5 | `↳ Grids & spacing` | **42:6** | Escala de espaciado y radios |
| 6 | `↳ Layout & surface` | **448:2** | Frame `448:3` "Layout & surface principles" 1440×3558 — **regla global del sistema** |
| 7 | `↳ Shadows & effects` | **42:7** | 5 estilos de efecto |
| 8 | `↳ Iconography` | **42:8** | Set de iconos |
| 9 | `↳ Iconography v.2` | [PENDIENTE] | — |
| — | `COMPONENTS` (separador) | **46:3** | Vacía |
| 10 | `↳ Buttons` | **42:9** | `58:137` Button (216 variantes), `52:127` header, `52:132` Notes |
| 11 | `↳ Badges` | **52:2** | `53:32` Badge (12 variantes), `400:2` Usage criteria |
| 12 | `↳ Tags` | **52:3** | `60:92` Tag 1040×584, `479:20` Use cases · Input Tags vs Filter Tags, `479:61` Notes |
| 13 | `↳ Dropdowns` | **52:4** | `466:211` Dropdown v2 · WIP 1440×4919, `466:915` Component 3300×1410 |
| 14 | `↳ Filters` | [PENDIENTE] | — |
| 15 | `↳ Inputs` | **52:5** | `62:290` Input field 1416×1656, `87:52` Notes |
| 16 | `↳ Toggles` | **52:6** | `62:603` Toggle 1456×736, `87:64` Notes |
| 17 | `↳ Checkboxes` | **52:7** | `85:530` Checkbox 1376×1566, `87:90` Notes |
| 18 | `↳ Tooltips` | **52:8** | `86:88` Tooltip 973×646, `87:100` Notes |
| 19 | `↳ Navigation` | [PENDIENTE] | Componente `119:2` Navigation / Sidebar / Expanded (260px) |
| 20 | `↳ Pagination` | [PENDIENTE] | — |
| — | `PAGE TEMPLATES` (separador) | **46:4** | Vacía |
| 21 | `↳ List page` | **42:10** | `120:2` Template / List Page / 1440 |
| 22 | `↳ Table` | [PENDIENTE] | — |
| 23 | `↳ Record detail` | **118:2** | `121:2` Template / Record Detail / 1440×1040, `127:171` header, `127:176` Notes |
| 24 | `↳ Form page` | [PENDIENTE] | `124:2` Template / Form Page / 1440×1000 |
| 25 | `↳ Dashboard` | [PENDIENTE] | `125:2` Template / Operational Dashboard / 1440 |
| 26 | `↳ Settings` | [PENDIENTE] | `126:2` Template / Settings Detail / 1440×960 |
| 27 | `↳ Mobile` | [PENDIENTE] | Plantilla móvil no localizada (no sigue el patrón `/1440`) |
| 28 | `↳ Analytics` | [PENDIENTE] | `129:2` Template / Analytics Report / 1440×1000 |
| 29 | `↳ Map` | [PENDIENTE] | `130:2` Template / Map Page / 1440 |
| 30 | `↳ Feed` | [PENDIENTE] | `131:2` Template / Feed Page / 1440×1080 |
| — | `DOCUMENTATION` (separador) | **46:5** | Vacía |
| 31 | `↳ Docs & changelog` | **42:3** | — |
| 32 | `↳ Client notes & source` | **42:11** | — |
| 33–36 | `––––––––––` ×4 | **46:6 – 46:9** | Separadores |
| 37 | `Dropdown v2 (WIP)` | [PENDIENTE] | — |
| 38 | `Filters (WIP)` | [PENDIENTE] | — |
| 39 | `trush` | [PENDIENTE] | Papelera de trabajo |
| 40 | `APK · Inventario · Mobile` | [PENDIENTE] | Producto cliente |
| 41 | `WEB · Inventario · Desktop` | [PENDIENTE] | Producto cliente |

**Estilos publicados:** estilos de texto `Heading`, `Body`, `Label`; estilo de color `grad`; estilo de efecto `Shadow`.

**Librerías suscritas** (community; ninguna es fuente de verdad de MDS): Material 3 Design Kit, Simple Design System, iOS 18 and iPadOS 18, iOS and iPadOS 26, watchOS 26, visionOS 26, macOS 26.

**Portada (`42:611`) — texto literal:** "MDS · Master Design System · Figma Library · Based on MDS v2.3.1 · Page Standards & Interaction System · White First + Structured Layout + Brand Accent · Phase 1 · Foundations — In Review".

---

## 2. Tokens de color **[EXTRAÍDO]**

Extraídos con `get_variable_defs` sobre `448:3` (Layout & surface), `58:137` (Button) y `42:491` (Grids & spacing), más los rellenos reales de los componentes Button y Badge.

### 2.1 Tokens semánticos (nomenclatura real de Figma: `grupo/rol`)

| Token Figma | Hex | Rol |
|---|---|---|
| `background/main` | `#FFFFFF` | Superficie de página por defecto — **todo el contenido primario vive aquí** |
| `background/subtle` | `#F9FAFB` | Zonas secundarias, cabeceras de tabla, wells. **Un solo nivel, nunca anidada** |
| `divider/default` | `#F3F4F6` | Separación de secciones y filas. 1px, solo horizontal |
| `divider/soft` | `#F9FAFB` | Dentro de tablas densas donde `default` pesa demasiado |
| `border/default` | `#E5E7EB` | Componentes interactivos y tarjetas funcionales |
| `border/strong` | `#D1D5DB` | Bordes de mayor énfasis |
| `border/focus` | `#2563EB` | Anillo/borde de foco |
| `text/primary` | `#111827` | Texto principal y titulares |
| `text/secondary` | `#6B7280` | Texto secundario, labels, overlines |
| `text/inverse` | `#FFFFFF` | Sobre fondos sólidos de color |
| `primary/default` | `#2563EB` | Marca / acción primaria |
| `primary/hover` | `#1D4ED8` | Hover y pressed de primary |
| `primary/subtle` | `#EFF6FF` | Fondo suave de marca (badge informational, avatar, chip activo) |
| `success/default` | `#16A34A` | Verde sólido |
| `success/text` | `#15803D` | Texto sobre `success/subtle` |
| `success/subtle` | `#F0FDF4` | Fondo suave de éxito |
| `warning/default` | `#F59E0B` | Ámbar sólido (barra de alerta) |
| `warning/text` | `#B45309` | Texto sobre `warning/subtle` |
| `warning/subtle` | `#FFFBEB` | Fondo suave de advertencia |
| `error/default` | `#DC2626` | Rojo sólido / botón Danger |
| `error/text` | `#B91C1C` | Texto sobre `error/subtle`; hover de Danger |
| `error/subtle` | `#FEF2F2` | Fondo suave de error |

### 2.2 Valores adicionales leídos de rellenos reales de componentes **[EXTRAÍDO]**

| Uso | Hex | Origen |
|---|---|---|
| Badge Neutral · fondo | `#F3F4F6` | `53:2` |
| Badge Neutral · texto | `#374151` | `53:2` |
| Badge Accent · fondo | `#F5F3FF` | `53:7` — violeta, **no está definido como variable** |
| Badge Accent · texto | `#6D28D9` | `53:7` |
| Badge Informational · texto | `#1D4ED8` | `53:27` |
| Disabled · fondo | `#F3F4F6` | Button disabled |
| Disabled · texto | `#9CA3AF` | Button disabled |
| Secondary hover · fondo | `#F9FAFB` | `57:319` |
| Secondary pressed · fondo | `#F3F4F6` | `57:332` |
| Secondary disabled · borde | `#F3F4F6` | `57:358` |
| Danger hover | `#B91C1C` | `57:547` |
| Focus ring primary | `rgba(37,99,235,0.22)` | `57:117` |
| Focus ring danger | `rgba(220,38,38,0.22)` | `57:573` |

### 2.3 Modo oscuro

**No existe.** No se detectó ninguna colección de variables con un segundo modo. La única aparición de "Dark" es la propiedad `Theme=Dark` del componente Tooltip (`86:2`), que es una variante de componente, no un modo de tema. El sistema es explícitamente **"White First"**. La sección 7 incluye una propuesta de modo oscuro claramente marcada como **[PROPUESTO]**.

### 2.4 Paleta primitiva

**[PENDIENTE]** — La rampa primitiva (`gray/50…900`, `brand/50…900`, etc.) vive en la página `Colors` y no se pudo leer por el límite de cuota. Los 22 tokens semánticos de §2.1 sí están verificados y son suficientes para implementar: el sistema se consume por token semántico, no por primitiva.

---

## 3. Tipografía **[EXTRAÍDO — exacto]**

Familia única: **Inter**. Obtenido de `get_variable_defs` sobre `42:448`.

| Estilo Figma | Tamaño | Peso | Line-height | Letter-spacing | em equivalente |
|---|---|---|---|---|---|
| `Heading/Display` | 40px | 700 Bold | 48px | −0.80px | −0.02em |
| `Heading/H1` | 32px | 600 SemiBold | 40px | −0.64px | −0.02em |
| `Heading/H2` | 24px | 600 SemiBold | 32px | −0.24px | −0.01em |
| `Heading/H3` | 20px | 600 SemiBold | 28px | −0.20px | −0.01em |
| `Heading/H4` | 16px | 600 SemiBold | 24px | 0 | 0 |
| `Body/Large` | 16px | 400 Regular | 24px | 0 | 0 |
| `Body/Default` | 14px | 400 Regular | 20px | 0 | 0 |
| `Body/Medium` | 14px | 500 Medium | 20px | 0 | 0 |
| `Body/Small` | 12px | 400 Regular | 16px | 0 | 0 |
| `Label/Button` | 14px | 500 Medium | 20px | 0 | 0 |
| `Label/Badge` | 12px | 500 Medium | 16px | 0 | 0 |
| `Label/Caption` | 11px | 500 Medium | 16px | +0.11px | +0.01em |
| `Label/Overline` | 11px | 600 SemiBold | 16px | +0.55px | +0.05em |

**Excepciones observadas en componentes:** Button `sm` usa 13px y Button `lg` usa 15px (fuera de la escala nominal); la portada usa 96px Bold (solo decorativo).

No hay familia mono ni display secundaria definida en el archivo.

---

## 4. Espaciado, radios, sombras, layout, iconos

### 4.1 Radios **[EXTRAÍDO]**

| Token Figma | Valor |
|---|---|
| `radius/xs` | 4px |
| `radius/sm` | 8px |
| `radius/md` | **12px** ← radio por defecto de botones y tarjetas |
| `radius/lg` | 16px |
| `radius/pill` | 999px |

### 4.2 Sombras **[EXTRAÍDO — exacto, de `42:563`]**

| Estilo Figma | CSS |
|---|---|
| `Shadow/Subtle` | `0 1px 2px 0 rgba(17,24,39,0.05)` |
| `Shadow/Dropdown` | `0 4px 12px -2px rgba(17,24,39,0.10), 0 2px 4px -2px rgba(17,24,39,0.06)` |
| `Shadow/Modal` | `0 12px 32px -8px rgba(17,24,39,0.16), 0 4px 8px -4px rgba(17,24,39,0.08)` |
| `Shadow/Drawer` | `-8px 0 24px -6px rgba(17,24,39,0.12)` |
| `Shadow/FloatingNav` | `0 8px 24px -6px rgba(17,24,39,0.14), 0 2px 6px -2px rgba(17,24,39,0.06)` |

**Regla dura del sistema:** las sombras son exclusivas de elementos flotantes (dropdowns, modales, drawers, nav flotante). **Nunca sobre secciones ni tarjetas de contenido.**

### 4.3 Layout y grid **[EXTRAÍDO de `448:3` y de las plantillas]**

- Lienzo de diseño: **1440px**
- Padding lateral de página: **64px** → ancho de contenido **1312px**
- Separación entre secciones: **48px** (constante en las 8 secciones del documento de layout)
- Separación entre bloques: **32–64px** (whitespace como primera herramienta)
- Esqueleto de aplicación (idéntico en las 8 plantillas): **sidebar 260px** + **topbar 1180×64** + contenido `1180×(alto−64)`

**Breakpoints:** no hay una tabla de breakpoints explícita en el archivo. **[PROPUESTO]** coherente con el lienzo de 1440 y el contenedor de 1312: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1440`.

### 4.4 Modos de densidad **[EXTRAÍDO]**

Contenedor de cada modo: `background/main`, borde `border/default` 1px, `radius/md` 12px, padding 20px, gap 12px, ancho 410px, gap entre modos 24px.

| Modo | Altura de fila | Padding-x fila | Gap celdas | Divisor | Uso (literal) |
|---|---|---|---|---|---|
| **Comfortable** | **56px** | 4px | 12px | 1px `divider/default` | "Mobile, feed, profile, field tasks. Generous targets and space." |
| **Standard** (default) | **44px** | 4px | 12px | 1px `divider/default` | "Most administrative and operational screens. The default." |
| **Compact** | **32px** | 4px | 12px | 1px `divider/soft` | "Dense tables, reports, ERP, audits. Soft dividers carry the rhythm." |

### 4.5 Iconos

- Placeholder de icono en Button: **20px** para los tres tamaños (`sm`/`md`/`lg`), gap **8px** respecto al label.
- Spinner de Loading: **14px**.
- Punto de Badge: **6px**, gap 6px.
- Icono en Input: **16px**, a 12px del borde.
- Swatch de color en tablas de documentación: 18×18px con `radius/sm`.

Set de iconos: páginas `Iconography` (`42:8`) e `Iconography v.2`. La documentación de Button menciona literalmente *"the full MDS icon library (300+ icons)"* con favoritos de acceso rápido: plus, download, upload, arrows, trash, settings, search, edit, filter, save, send. Nomenclatura observada: `Icon / twotone / rotate-right`, `search-lg`. **[PENDIENTE]** la enumeración completa del set.

---

## 5. Componentes

### 5.1 Button **[EXTRAÍDO — completo]**

`58:137` · **216 variantes** = Hierarchy(3) × Size(3) × State(6) × Icon(4)

**Descripción oficial en Figma:**
> *"MDS Button v2. Props: Hierarchy (Primary/Secondary/Danger), Size (sm 36 / md 40 / lg 48), State (Default/Hover/Pressed/Focus/Disabled/Loading), Icon (None/Leading/Trailing/Only). Label is an editable text property. Swap icon exposes the full MDS icon library. Maps to `<Button variant size iconPosition icon={<Icon/>}>Label</Button>`. One Primary per screen. Danger requires confirmation."*

**Tamaños** (radio `12px` en los tres):

| Size | Altura | Padding-x | Icon-only padding-x | Fuente | Icono | Gap |
|---|---|---|---|---|---|---|
| `sm` | 36px | 12px | — | 13px / 500 | 20px | 8px |
| `md` | 40px | 16px | 10px | 14px / 500 | 20px | 8px |
| `lg` | 48px | 20px | — | 15px / 500 | 20px | 8px |

Anchos icon-only: 36×36 / 40×40 / 48×48.

**Matriz de estados** (medida en `md`):

| Estado | Primary | Secondary | Danger |
|---|---|---|---|
| Default | bg `#2563EB`, texto `#FFF` | bg `#FFF`, borde 1px `#E5E7EB`, texto `#111827` | bg `#DC2626`, texto `#FFF` |
| Hover | bg `#1D4ED8` | bg `#F9FAFB`, borde `#E5E7EB` | bg `#B91C1C` |
| Pressed | bg `#1D4ED8` | bg `#F3F4F6`, borde `#E5E7EB` | bg `#B91C1C` |
| Focus | bg `#2563EB` + ring `rgba(37,99,235,.22)` | bg `#FFF`, **borde `#2563EB`** + ring `rgba(37,99,235,.22)` | bg `#DC2626` + ring `rgba(220,38,38,.22)` |
| Disabled | bg `#F3F4F6`, texto `#9CA3AF` | bg `#FFF`, borde `#F3F4F6`, texto `#9CA3AF` | bg `#F3F4F6`, texto `#9CA3AF` |
| Loading | bg base + spinner 14px + gap 8px, label visible | ídem | ídem |

**Notas normativas literales (frame `52:132`):**
- *"Hover darkens one step on the ramp. Pressed darkens two steps. Focus adds a 4px ring at 22% for keyboard navigation. Disabled uses gray/100 background with gray/400 text, never opacity. Loading keeps the label visible next to the spinner so width does not jump."*
- *"Primary is the single strongest action on the screen. Secondary for everything else. Danger only for destructive actions and always followed by a confirmation dialog (MDS section 10)."*
- *"sm 36 for dense tables and toolbars. md 40 is the default everywhere. lg 48 for mobile primary actions and forms (touch/comfortable)."*
- *"Hierarchy=Primary, Size=md, State=Default maps to `<Button variant="primary" size="md" />`. States other than Default and Disabled are interaction states handled in code, not props."*
- *"Icon-only buttons are square: 36 / 40 / 48."*

> ⚠️ **Discrepancia detectada:** la documentación dice que Pressed oscurece dos pasos, pero en Figma Primary Pressed y Primary Hover comparten el mismo `#1D4ED8`. Recomendación: usar `#1E40AF` para pressed en código y corregirlo en Figma.

### 5.2 Badge **[EXTRAÍDO — completo]**

`53:32` · 12 variantes = Color(6) × Dot(2)

**Geometría común:** padding `3px 10px`, `radius/pill` 999px, fuente `Label/Badge` 12px/500, altura 21px, punto 6px con gap 6px.

| Color | Fondo | Texto | Significado (literal) |
|---|---|---|---|
| `Neutral` | `#F3F4F6` | `#374151` | Default, inactive or not-yet-relevant states — *Draft · Archived · Not started · Inactive* |
| `Informational` | `#EFF6FF` | `#1D4ED8` | System information and neutral in-progress states — *In review · Syncing · Scheduled · New* |
| `Success` | `#F0FDF4` | `#15803D` | Completed or positive states — *Paid · Active · Approved · Delivered* |
| `Warning` | `#FFFBEB` | `#B45309` | Needs attention soon, not yet a problem — *Pending · Expiring soon · Low stock* |
| `Critical` | `#FEF2F2` | `#B91C1C` | Problems and blockers requiring action now — *Overdue · Failed · Incident · Rejected* |
| `Accent` | `#F5F3FF` | `#6D28D9` | Featured or highlighted items. **Never a status** — *Featured · Beta · Pro plan · Recommended* |

**Reglas duras (literales, frame `400:2`):**
1. *"A badge always includes a short, readable text label (Paid, Pending, Overdue, Under Review). Color alone never communicates the status."*
2. *"The dot is a supporting cue only — it may reinforce the status but never replaces the text."*
3. *"Informational (blue) and Accent (violet) are intentionally different hues: Informational describes system state, Accent highlights or promotes. If a new status does not fit these six, it must go through component review before any new color is added."*
4. *"Badges are never interactive. Anything clickable or removable is a Tag."*

### 5.3 Componentes con ejes verificados y valores **[PENDIENTES]**

El límite de cuota del MCP impidió leer sus rellenos exactos por estado. Los ejes de variante sí están verificados a partir de los nombres de variante reales:

| Componente | Component set | Ejes de variante | Nº variantes |
|---|---|---|---|
| **Input** | `62:290` (1416×1656) | `Size` (sm/md/lg) × `Type` (Default/…) × `State` (Placeholder/…) × `Destructive` (True/False) | 48 |
| **Toggle** | `62:603` (1456×736) | [PENDIENTE] | 32 |
| **Checkbox / Radio** | `85:530` (1376×1566) | `Type` (Checkbox/Radio) × `Checked` × `Size` (sm/…) × `State` × `Text` (True/False) | 80 |
| **Tag** | `60:92` (1040×584) | `Size` (sm/…) × `Action` (Text only/…) × `State` | 27 |
| **Tooltip** | `86:88` (973×646) | `Theme` (Dark/Light) × `Arrow` (None/…) × `Supporting` (True/False) | 20 |
| **Dropdown item** | `466:915` | `Type` (Default/…) × `State` × `Icon` (True/False) | 16 |
| **Sidebar** | `119:2` | `Navigation / Sidebar / Expanded`, 260px | — |
| **Topbar** | instancia en plantillas | `Navigation / Topbar / Desktop`, 1180×64 | — |

**Medida verificada del Input** (instancia `120:101` en la plantilla List Page): **260×40**, icono `search-lg` 16×16 en `x=12, y=12`, texto en `x=36`, con nodos `Label` y `This is a hint text.` ocultables (`hidden=true`).

**Componentes NO localizados en el archivo:** Filters, Pagination, Table (las páginas existen; ids [PENDIENTE]). **Charts/gráficos: no existe ningún componente de gráfico**; la página Analytics (`129:2`) contiene la maquetación pero no un set de charts.

**Componentes que el brief pedía y que NO existen en MDS:** select, textarea, card genérica (el sistema lo prohíbe explícitamente: solo 5 tarjetas funcionales), modal/dialog, drawer, breadcrumb, avatar, empty state, stepper, date picker, KPI card como componente (existe como patrón en `451:6`), toast.

---

## 6. Patrones de página y layout **[EXTRAÍDO]**

### 6.1 La regla global: `448:3` "Layout & surface principles"

Subtítulo literal: *"Global MDS rule · Open composition, hierarchy through spacing, integrated content, functional cards only"*.

**Principio rector (literal):**
> *"Cards are optional. Structure is mandatory. The page itself is the container. Content sits directly on the white surface, organised by spacing, typography, fine dividers and soft background zones. A card is a deliberate tool for interaction and decision-making, never the default wrapper for a section."*

**Las cuatro formas de separar secciones, en orden de preferencia:**

| # | Herramienta | Regla literal |
|---|---|---|
| 01 | **Whitespace** | "The first tool. Sections breathe apart with 32 to 64 px of space, no line needed." |
| 02 | **Typography** | "A section title creates hierarchy on its own. Heading first, content follows." |
| 03 | **Fine divider** | "A 1 px line in divider/default when whitespace alone is not enough. Never heavier." |
| 04 | **Soft background** | "A background/subtle zone for secondary content. One level only, never nested." |

**Superficies, divisores y elevación (tabla literal):**

| Layer | Token | Value | Use |
|---|---|---|---|
| Page surface | `background/main` | `#FFFFFF` | "The default. All primary content lives here." |
| Subtle zone | `background/subtle` | `#F9FAFB` | "Secondary zones, table headers, wells. One level, never nested." |
| Divider · default | `divider/default` | `#F3F4F6` | "Section and row separation. 1 px, horizontal only." |
| Divider · soft | `divider/soft` | `#F9FAFB` | "Inside dense tables where default is too present." |
| Border | `border/default` | `#E5E7EB` | "Interactive components and functional cards only." |
| Shadows | `Shadow/*` | — | "Dropdowns, modals, drawers, floating nav, special cards. Never on sections." |

> El sistema **no** usa la nomenclatura "sunken / raised". Solo hay page surface, subtle zone y la tarjeta funcional blanca con borde.

**Contenido integrado, no encajonado (literal):**
> *"Tables and primary content sit directly on the page. Soft horizontal lines, no vertical lines, no wrapper card. The same table inside nested cards gains nothing and loses calm."*
> **Do** — *"Title, then the table on the surface. Rows separated by soft lines only."*
> **Don't** — *"Card inside card inside card: three borders, three shadows, no added meaning."*

**Tabla "¿Necesito una tarjeta?" (literal, `451:46`):**

| Content | Treatment | Why |
|---|---|---|
| Main table or list | Integrated · no card | Primary content owns the page; lines and spacing do the work |
| Form sections | Sections + dividers | Grouping by typography and space, per the Form standard |
| Configuration rows | Rows + dividers | Settings must not look like a dashboard |
| Important KPI | Small card | Fast reading before the main content |
| Critical alert / exception | Alert card | Must interrupt scanning and point to an action |
| Automatic insight | Insight card | A recommendation is a decision accelerator |
| Status counts that filter | Summary card | Interactive: one tap applies the filter |
| Record rows on mobile | List item card | Touch target and scannability on small screens |
| A section that just exists | **Never a card** | Decoration is not a function |

**Las 5 tarjetas funcionales aprobadas (`451:6`):**

| Tipo | Ancho | Fondo | Borde | Radio | Padding |
|---|---|---|---|---|---|
| KPI | 200px | `#FFFFFF` | 1px `#E5E7EB` | 12px | 16px / 14px |
| Alert | 280px | `#FFFBEB` | sin borde + barra izq. 3px `#F59E0B` r4px | 12px | 14px / 12px |
| Insight | 280px | `#FFFFFF` | 1px `#E5E7EB` | 12px | 16px / 14px |
| Summary (filtro) | 160px | `#FFFFFF` | **1.5px `#2563EB`** | 12px | 16px / 14px |
| Mobile list item | 280px | `#FFFFFF` | 1px `#E5E7EB` | 12px | 16px / 14px, avatar 36px pill `#EFF6FF` |

Gap entre tarjetas: 24px. Etiqueta de cada tarjeta: `Label/Overline` en `text/secondary`, gap 8px.

**Las 8 reglas globales (literales):**
1. The page is the container: primary content sits on white, never inside a default wrapper card.
2. Separate sections in this order: whitespace, typography, fine divider, soft background.
3. Dividers are 1 px and horizontal; vertical lines only inside dense data tables.
4. `background/subtle` is one level deep; never stack gray on gray.
5. Shadows only on floating elements: dropdowns, modals, drawers, floating nav.
6. Cards must be functional: KPI, alert, insight, summary-filter, mobile list item.
7. Density is deliberate: comfortable, standard or compact per screen type.
8. Every template and new screen inherits these rules before any exception is discussed.

**Checklist de aprobación (literal):**
1. No card without a function
2. Tables integrated, soft lines only
3. Section boundaries subtle: space, type, fine line
4. Gray zones restrained and never nested
5. Shadows only on floating layers
6. Density mode chosen on purpose
7. Feels open, calm, professional and scalable

**Dirección de cliente (literal):**
> *"Take conceptually from the references: open page composition, hierarchy through spacing, subtle dividers, integrated tables, restrained use of light gray surfaces, and functional cards for filters or indicators. Adapt to MDS colors, typography, spacing, radius, density, iconography and interaction. Do not copy branding, exact colors, navigation, structure, proportions or the complete appearance of the reference products."*

**Tabla integrada de referencia (medidas del ejemplo "Do", `449:12`):** card 560px, padding 24px, `radius/md` 12px, gap 14px; fila de cabecera 24px con `padding-bottom 6px` y tipografía `Label/Overline`; filas de datos **34px**, padding-x 4px, gap 12px; divisores 1px `divider/default`.

### 6.2 Las 8 plantillas de página

Todas comparten el mismo esqueleto: **sidebar 260px (alto completo) + topbar 1180×64 + frame de contenido 1180×(alto−64)**.

| Plantilla | node id | Tamaño | Particularidad |
|---|---|---|---|
| List Page | `120:2` | 1440×960 | Filtros + tabla integrada + paginación. Input de búsqueda 260×40 |
| Record Detail | `121:2` | 1440×1040 | — |
| Form Page | `124:2` | 1440×1000 | **+ `Sticky footer / Unsaved changes` 1180×64** anclado abajo |
| Operational Dashboard | `125:2` | 1440×— | KPIs + insights |
| Settings Detail | `126:2` | 1440×960 | Filas + divisores, nunca aspecto de dashboard |
| Analytics Report | `129:2` | 1440×1000 | Tabs `232:379` (32px): Completion / Delays / By owner / By vehicle. Barra de acciones `129:69` con 4 Buttons |
| Map Page | `130:2` | 1440×— | — |
| Feed Page | `131:2` | 1440×1080 | Tabs `131:68` (27px): All / Urgent / Surveys / Unread / Saved |

Instancias de componentes reutilizadas en las plantillas: `Navigation / Sidebar / Expanded`, `Navigation / Topbar / Desktop`, `Input field`, `Checkbox`, `Toggle`, `Button`, `Tag`, `Badge`.

> ⚠️ **Deuda detectada:** las tabs de Analytics (32px) y Feed (27px) son dos implementaciones locales distintas del mismo patrón, no un componente. Deben unificarse y componetizarse.

**Plantilla Mobile:** [PENDIENTE] — no sigue el patrón `Template / … / 1440`; probablemente `/375` o `/390` y vive en un rango de ids no sondeado.

---

## 7. Bloque final listo para copiar

### 7.1 `tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    screens: { sm:"640px", md:"768px", lg:"1024px", xl:"1280px", "2xl":"1440px" },
    container: { center:true, padding:{ DEFAULT:"24px", lg:"40px", "2xl":"64px" }, screens:{ "2xl":"1312px" } },
    extend: {
      colors: {
        // === Tokens MDS (nomenclatura 1:1 con Figma) ===
        background: { DEFAULT:"#FFFFFF", main:"#FFFFFF", subtle:"#F9FAFB" },
        divider:    { DEFAULT:"#F3F4F6", soft:"#F9FAFB" },
        border:     { DEFAULT:"#E5E7EB", strong:"#D1D5DB", focus:"#2563EB" },
        text:       { primary:"#111827", secondary:"#6B7280", inverse:"#FFFFFF", disabled:"#9CA3AF" },
        primary:    { DEFAULT:"#2563EB", hover:"#1D4ED8", pressed:"#1E40AF", subtle:"#EFF6FF", foreground:"#FFFFFF" },
        success:    { DEFAULT:"#16A34A", text:"#15803D", subtle:"#F0FDF4", foreground:"#FFFFFF" },
        warning:    { DEFAULT:"#F59E0B", text:"#B45309", subtle:"#FFFBEB", foreground:"#FFFFFF" },
        error:      { DEFAULT:"#DC2626", text:"#B91C1C", subtle:"#FEF2F2", foreground:"#FFFFFF" },
        info:       { DEFAULT:"#2563EB", text:"#1D4ED8", subtle:"#EFF6FF", foreground:"#FFFFFF" },
        accent:     { DEFAULT:"#6D28D9", text:"#6D28D9", subtle:"#F5F3FF", foreground:"#FFFFFF" },
        neutral:    { DEFAULT:"#374151", text:"#374151", subtle:"#F3F4F6" },
        disabled:   { bg:"#F3F4F6", fg:"#9CA3AF" },
      },
      fontFamily: {
        sans: ["Inter","ui-sans-serif","system-ui","-apple-system","Segoe UI","Roboto","Helvetica Neue","Arial","sans-serif"],
      },
      fontSize: {
        // Escala MDS exacta
        display:  ["40px",{ lineHeight:"48px", letterSpacing:"-0.8px",  fontWeight:"700" }],
        h1:       ["32px",{ lineHeight:"40px", letterSpacing:"-0.64px", fontWeight:"600" }],
        h2:       ["24px",{ lineHeight:"32px", letterSpacing:"-0.24px", fontWeight:"600" }],
        h3:       ["20px",{ lineHeight:"28px", letterSpacing:"-0.2px",  fontWeight:"600" }],
        h4:       ["16px",{ lineHeight:"24px", letterSpacing:"0",       fontWeight:"600" }],
        "body-lg":["16px",{ lineHeight:"24px" }],
        body:     ["14px",{ lineHeight:"20px" }],
        "body-sm":["12px",{ lineHeight:"16px" }],
        label:    ["14px",{ lineHeight:"20px", fontWeight:"500" }],
        badge:    ["12px",{ lineHeight:"16px", fontWeight:"500" }],
        caption:  ["11px",{ lineHeight:"16px", letterSpacing:"0.11px", fontWeight:"500" }],
        overline: ["11px",{ lineHeight:"16px", letterSpacing:"0.55px", fontWeight:"600" }],
        // tamaños excepcionales de Button
        "btn-sm": ["13px",{ lineHeight:"20px", fontWeight:"500" }],
        "btn-lg": ["15px",{ lineHeight:"20px", fontWeight:"500" }],
      },
      borderRadius: {
        none:"0px", xs:"4px", sm:"8px", DEFAULT:"12px", md:"12px", lg:"16px", pill:"999px", full:"999px",
      },
      borderWidth: { DEFAULT:"1px", "1.5":"1.5px", 3:"3px" },
      boxShadow: {
        subtle:       "0 1px 2px 0 rgba(17,24,39,0.05)",
        dropdown:     "0 4px 12px -2px rgba(17,24,39,0.10), 0 2px 4px -2px rgba(17,24,39,0.06)",
        modal:        "0 12px 32px -8px rgba(17,24,39,0.16), 0 4px 8px -4px rgba(17,24,39,0.08)",
        drawer:       "-8px 0 24px -6px rgba(17,24,39,0.12)",
        floatingnav:  "0 8px 24px -6px rgba(17,24,39,0.14), 0 2px 6px -2px rgba(17,24,39,0.06)",
        focus:        "0 0 0 4px rgba(37,99,235,0.22)",
        "focus-error":"0 0 0 4px rgba(220,38,38,0.22)",
        none:"none",
      },
      spacing: {
        px:"1px", 0:"0px", 0.5:"2px", 1:"4px", 1.5:"6px", 2:"8px", 2.5:"10px", 3:"12px",
        3.5:"14px", 4:"16px", 5:"20px", 6:"24px", 7:"28px", 8:"32px", 9:"36px", 10:"40px",
        11:"44px", 12:"48px", 14:"56px", 16:"64px", 18:"72px", 20:"80px", 24:"96px", 32:"128px",
        // semánticos MDS
        section:"48px", "section-min":"32px", "section-max":"64px", "page-x":"64px",
        sidebar:"260px", topbar:"64px",
        "row-comfortable":"56px", "row-standard":"44px", "row-compact":"32px",
        "ctrl-sm":"36px", "ctrl-md":"40px", "ctrl-lg":"48px",
      },
      maxWidth: { content:"1312px", app:"1180px", prose:"65ch" },
      zIndex: { dropdown:"50", sticky:"40", overlay:"60", modal:"70", toast:"80", tooltip:"90" },
      transitionTimingFunction: {
        standard:"cubic-bezier(0.4,0,0.2,1)", emphasized:"cubic-bezier(0.16,1,0.3,1)",
      },
      transitionDuration: { fast:"120ms", DEFAULT:"150ms", medium:"200ms", slow:"250ms" },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

### 7.2 Variables CSS `:root` (`globals.css`)

```css
@tailwind base; @tailwind components; @tailwind utilities;

@layer base {
  :root {
    /* ===== COLOR · tokens MDS (nombres 1:1 con Figma) ===== */
    --background-main:    #FFFFFF;
    --background-subtle:  #F9FAFB;
    --divider-default:    #F3F4F6;
    --divider-soft:       #F9FAFB;
    --border-default:     #E5E7EB;
    --border-strong:      #D1D5DB;
    --border-focus:       #2563EB;
    --text-primary:       #111827;
    --text-secondary:     #6B7280;
    --text-inverse:       #FFFFFF;
    --text-disabled:      #9CA3AF;

    --primary-default:    #2563EB;
    --primary-hover:      #1D4ED8;
    --primary-pressed:    #1E40AF;   /* corrección: Figma repite hover en pressed */
    --primary-subtle:     #EFF6FF;

    --success-default:    #16A34A;
    --success-text:       #15803D;
    --success-subtle:     #F0FDF4;
    --warning-default:    #F59E0B;
    --warning-text:       #B45309;
    --warning-subtle:     #FFFBEB;
    --error-default:      #DC2626;
    --error-text:         #B91C1C;
    --error-subtle:       #FEF2F2;
    --info-default:       #2563EB;
    --info-text:          #1D4ED8;
    --info-subtle:        #EFF6FF;
    --accent-text:        #6D28D9;
    --accent-subtle:      #F5F3FF;
    --neutral-text:       #374151;
    --neutral-subtle:     #F3F4F6;
    --disabled-bg:        #F3F4F6;
    --disabled-fg:        #9CA3AF;

    /* ===== TIPOGRAFÍA ===== */
    --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;

    /* ===== RADIOS ===== */
    --radius-xs: 4px; --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;

    /* ===== SOMBRAS (solo capas flotantes) ===== */
    --shadow-subtle:      0 1px 2px 0 rgba(17,24,39,.05);
    --shadow-dropdown:    0 4px 12px -2px rgba(17,24,39,.10), 0 2px 4px -2px rgba(17,24,39,.06);
    --shadow-modal:       0 12px 32px -8px rgba(17,24,39,.16), 0 4px 8px -4px rgba(17,24,39,.08);
    --shadow-drawer:      -8px 0 24px -6px rgba(17,24,39,.12);
    --shadow-floatingnav: 0 8px 24px -6px rgba(17,24,39,.14), 0 2px 6px -2px rgba(17,24,39,.06);
    --shadow-focus:       0 0 0 4px rgba(37,99,235,.22);
    --shadow-focus-error: 0 0 0 4px rgba(220,38,38,.22);

    /* ===== LAYOUT ===== */
    --page-width: 1440px; --page-padding-x: 64px; --content-max: 1312px; --app-max: 1180px;
    --section-gap: 48px; --sidebar-w: 260px; --topbar-h: 64px;
    --ctrl-h-sm: 36px; --ctrl-h-md: 40px; --ctrl-h-lg: 48px;

    /* ===== DENSIDAD (modo deliberado) ===== */
    --row-h: 44px;                    /* standard, por defecto */
    --row-divider: var(--divider-default);
    --icon-sm: 16px; --icon-md: 20px; --icon-lg: 24px;

    /* ===== MOTION ===== */
    --ease-standard: cubic-bezier(.4,0,.2,1);
    --ease-emphasized: cubic-bezier(.16,1,.3,1);
    --dur-fast:120ms; --dur-base:150ms; --dur-medium:200ms; --dur-slow:250ms;
  }

  [data-density="comfortable"] { --row-h: 56px; --row-divider: var(--divider-default); }
  [data-density="standard"]    { --row-h: 44px; --row-divider: var(--divider-default); }
  [data-density="compact"]     { --row-h: 32px; --row-divider: var(--divider-soft); }

  /* ===== MODO OSCURO — [PROPUESTO], NO existe en Figma ===== */
  .dark {
    --background-main:  #0B1220;  --background-subtle: #111827;
    --divider-default:  #1F2937;  --divider-soft:      #151E2E;
    --border-default:   #1F2937;  --border-strong:     #374151;  --border-focus: #60A5FA;
    --text-primary:     #F9FAFB;  --text-secondary:    #9CA3AF;  --text-inverse: #0B1220;
    --primary-default:  #60A5FA;  --primary-hover:     #93C5FD;  --primary-subtle: #17233D;
    --success-default:  #34D399;  --success-text:      #6EE7B7;  --success-subtle: #06281E;
    --warning-default:  #FBBF24;  --warning-text:      #FCD34D;  --warning-subtle: #2A1E05;
    --error-default:    #F87171;  --error-text:        #FCA5A5;  --error-subtle:   #2A1113;
    --accent-text:      #C4B5FD;  --accent-subtle:     #1E1638;
    --disabled-bg:      #1F2937;  --disabled-fg:       #6B7280;
    --shadow-focus:     0 0 0 4px rgba(96,165,250,.30);
  }

  body {
    background-color: var(--background-main);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-feature-settings: "cv11","ss01";
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible { outline:none; box-shadow: var(--shadow-focus); border-radius: var(--radius-md); }
  .tabular { font-variant-numeric: tabular-nums; }
}
```

### 7.3 `Button` en shadcn-style (CVA) — traducción directa de las 216 variantes

```ts
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
  "transition-colors duration-150 ease-[cubic-bezier(.4,0,.2,1)] " +
  "focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed " +
          "disabled:bg-disabled-bg disabled:text-disabled-fg",
        secondary:
          "bg-background-main text-text-primary border border-border hover:bg-background-subtle " +
          "active:bg-divider focus-visible:border-border-focus " +
          "disabled:border-divider disabled:text-disabled-fg",
        danger:
          "bg-error text-error-foreground hover:bg-error-text active:bg-error-text " +
          "focus-visible:shadow-focus-error disabled:bg-disabled-bg disabled:text-disabled-fg",
      },
      size: {
        sm: "h-9  px-3  text-btn-sm",   // 36px / 12px / 13px
        md: "h-10 px-4  text-body",     // 40px / 16px / 14px
        lg: "h-12 px-5  text-btn-lg",   // 48px / 20px / 15px
      },
      iconOnly: { true: "", false: "" },
    },
    compoundVariants: [
      { iconOnly: true, size: "sm", class: "w-9  px-0" },
      { iconOnly: true, size: "md", class: "w-10 px-2.5" },
      { iconOnly: true, size: "lg", class: "w-12 px-0" },
    ],
    defaultVariants: { variant: "primary", size: "md", iconOnly: false },
  }
);
// Icono 20px en los tres tamaños; spinner 14px; el label permanece visible en loading.
```

### 7.4 `Badge` en shadcn-style (CVA)

```ts
export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-badge whitespace-nowrap",
  {
    variants: {
      color: {
        neutral:       "bg-neutral-subtle text-neutral-text",
        informational: "bg-info-subtle text-info-text",
        success:       "bg-success-subtle text-success-text",
        warning:       "bg-warning-subtle text-warning-text",
        critical:      "bg-error-subtle text-error-text",
        accent:        "bg-accent-subtle text-accent-text",
      },
    },
    defaultVariants: { color: "neutral" },
  }
);
// El punto es un <span className="size-1.5 rounded-full bg-current" /> opcional.
// REGLA: el badge nunca es interactivo. Si es clicable o eliminable, es un Tag.
```

---

## 8. Pendientes y deuda de diseño

### 8.1 Qué falta extraer

**Bloqueo:** cuota del MCP de Figma agotada (`Full seat on the Professional plan`). Es un límite de plan, no un problema de permisos ni de acceso al archivo. Se restablece por periodo; con más asientos o plan superior se completa en una sesión.

1. **Paleta primitiva completa** — página `Colors`: frames `47:2`, `50:2` (Usage examples), `51:2` (In context) y la tabla de contraste/accesibilidad.
2. **Rellenos exactos por estado** de Input (`62:290`), Toggle (`62:603`), Checkbox/Radio (`85:530`), Tag (`60:92`), Tooltip (`86:88`), Dropdown item (`466:915`).
3. **Páginas sin node id:** Overview, Colors, Iconography v.2, Filters, Navigation, Pagination, Table, Form page, Dashboard, Settings, Mobile, Analytics, Map, Feed.
4. **Plantilla Mobile** — no sigue el patrón `Template / … / 1440`.
5. **Set de iconos completo** (páginas `42:8` e `Iconography v.2`).

Método recomendado para continuar: abrir cada página en Figma (eso la carga y la hace resoluble por el MCP), y luego `get_metadata` + `get_design_context` sobre sus component sets. Ir en lotes cortos y secuenciales: el throttle se agrava con llamadas en paralelo.

### 8.2 Deuda de diseño detectada (reportar al equipo)

- **Primary Pressed = Primary Hover** (`#1D4ED8`) pese a que la documentación exige dos pasos de oscurecimiento. Propuesta: `#1E40AF`.
- **Tabs implementadas dos veces** como frames locales con alturas distintas (32px en Analytics `232:379`, 27px en Feed `131:68`) en lugar de un componente único.
- **La portada declara "Phase 1 · Foundations — In Review"** pero el archivo ya contiene Fase 2 (componentes) y Fase 3 (plantillas) completas. Metadato desactualizado.
- **`Badge Accent` usa `#F5F3FF` / `#6D28D9`** que no están definidos como variables — son valores sueltos fuera del sistema de tokens.
- **Faltan componentes que las plantillas ya necesitan:** Table, Pagination y Filters tienen página propia pero no se localizó component set publicado.

---

## 9. Trazabilidad

- **Modo solo lectura.** Herramientas usadas: `whoami`, `get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`, `get_libraries`, `search_design_system`. **No** se invocó `use_figma`, `create_new_file` ni ninguna herramienta de escritura. No se modificó nada en Figma.
- **Navegador:** se abrió una pestaña nueva propia (no la del usuario) para enumerar el panel de páginas, y se cerró al terminar. Solo navegación y selección de páginas; ninguna edición.
