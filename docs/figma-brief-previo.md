# Brief común para subagentes de diseño Figma (MES Yamboly)

## Contexto
Rediseño en Figma del MES de Yamboly (planta de helados, Lima) para cumplir una tesis: 9 funcionalidades (RF1 captura, RF2 producción, RF3 paradas, RF4 mermas, RF5 repositorio, RF6 dashboard tiempo real, RF7 indicadores, RF8 analítica IA, RF9 alertas) y 5 KPIs de evidencia (TRI tiempo de registro, TCI calidad de registros, TSP satisfacción, CFS cumplimiento funcional, EP exactitud de predicciones). Lee `/Users/elmo/.claude/plans/necesito-que-realices-una-greedy-rose.md` (§3–§5 y §7) para arquitectura y pantallas.

## Obligatorio antes de tocar Figma
1. Carga herramientas: `ToolSearch` con `select:mcp__claude_ai_Figma__use_figma,mcp__claude_ai_Figma__get_screenshot,mcp__claude_ai_Figma__get_metadata,mcp__claude_ai_Figma__get_figma_skill`.
2. Lee la skill `skill://figma/figma-use/SKILL.md` con `get_figma_skill` (obligatoria; pasa `skillNames: "resource:figma-use"` en cada `use_figma`). Reglas clave: `return` para salida; una sola `setCurrentPageAsync` por llamada; cargar fuentes Inter antes de editar texto (`figma.loadFontAsync({family:"Inter",style:"Semi Bold"})` — estilos válidos: Regular, Medium, Semi Bold, Bold); `appendChild` antes de `layoutSizingHorizontal='FILL'`; colores 0–1; no `figma.notify`; ≤ ~10 operaciones lógicas por llamada pero puedes definir funciones helper y crear una pantalla completa en 3–6 llamadas.
3. Lee `/private/tmp/claude-501/-Users-elmo-trabajo-yambo/4b60a4e1-cfac-4e6e-a80d-2c3110176b93/scratchpad/04-figma-kit.md` (ids de componentes, estilos, variables, plantillas, reglas MDS, datos de ejemplo Yamboly).

## Presupuesto de llamadas al MCP (hay cuota limitada — CRÍTICO)
- Máximo ~25 llamadas `use_figma` en total para tu tarea. Agrupa: escribe helpers (`mk(text,style,color)`, `row(...)`, `btn(hier,label,icon)`) al inicio de cada script y construye secciones enteras por llamada.
- Verifica con `await frame.screenshot()` inline dentro del mismo script (al final), no con llamadas separadas de `get_screenshot`, salvo la verificación final de cada pantalla.
- Si recibes error de cuota ("tool call limit"), DETENTE, no reintentes, y devuelve un informe con lo construido (ids) y lo pendiente.
- Si un script falla, lee el error, corrige y reintenta una vez; no reintentes en bucle.

## Cómo construir
- Trabaja SOLO en tu página asignada (id dado). Nunca edites páginas del MDS ni otras páginas MES.
- Usa instancias de componentes MDS (Button, Badge, Tag, Input, Dropdown, Checkbox, Toggle, Filter pill, Summary card, Sidebar, Topbar) con `createInstance()` + `setProperties`. Para componentes MES-local, instancia los componentes de la página `01 Shell & Patterns` (ids que se te entregan) — si no existen aún, constrúyelos localmente siguiendo el kit.
- La forma más barata de obtener el esqueleto: clonar la plantilla Table `537:94` o Dashboard `125:2` (`(await figma.getNodeByIdAsync(id)).clone()`), mover a tu página (`page.appendChild`), renombrar y editar textos. Para editar un TEXT existente: `for (const s of node.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(s.fontName); node.characters = "..."`.
- Cada pantalla: frame `MES / <Módulo> / <Pantalla> / <Estado> / 1440` 1440×(960–1200), fill blanco, con sidebar (ítem activo correcto), topbar, breadcrumb, título H2, subtítulo Body/Small, acciones (un solo Primary).
- Colocación: frames en fila horizontal con 200 px de separación (x = 0, 1640, 3280…), y = 0; segunda fila y = 1400 si hace falta.
- Textos en español, datos realistas (ver kit). Sin lorem ipsum.
- Al terminar: devuelve un informe con: lista de frames creados (nombre → node id → tamaño), componentes MES-local nuevos (si los creaste) y qué RF/KPI de la tesis cubre cada pantalla, más observaciones. Incluye un screenshot final por pantalla (con `screenshot()` inline).
