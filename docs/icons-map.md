# Mapa de iconos — MDS (`Icon / line / <name>`) → `lucide-react`

Librería de iconos del MDS: página `164:820`, 3 197 componentes, nomenclatura `Icon / line / <name>`.
**Resultado: los 60 nombres usados o previstos en las pantallas MES tienen equivalente directo en `lucide-react`. No se descargó ningún SVG** (`packages/ui/src/icons/` queda vacío) — así se ahorró presupuesto de Figma y se evita mantener assets.

Convención de uso en código:
```ts
import { Activity, Bell, Search } from 'lucide-react';
```
Tamaños reales (no inventar otros): **18** en ítems del sidebar · **20** en topbar, botones md/lg, icon box de Insight · **16** en inputs, search del topbar, botones icon-only sm y cierre de modal/drawer · **14** en delta de KPI, chip de Line card, chip TRI y check del stepper · **40** en Empty state · **24** en el logo del login. `strokeWidth` 1.75–2 (lucide por defecto 2) para igualar el trazo del MDS.

## Iconos verificados en los frames leídos **[FIGMA]**

| Nombre Figma | lucide-react | Dónde se usa | Tamaño |
|---|---|---|---|
| `home-01` | `House` (alias `Home`) | Sidebar · Inicio | 18 |
| `activity` | `Activity` | Sidebar · Tiempo real; chip "Sugerida" de Line card | 18 / 14 |
| `bell-01` | `Bell` | Sidebar · Alertas; campana del topbar (con punto) | 18 / 20 |
| `ice-cream` | `IceCreamCone` | Logo del login (uso de Sidebar · Pasteurización retirado: la ruta ya no está en la navegación) | 24 |
| `file` | `FileText` | Sidebar · Órdenes de fabricación | 18 |
| `chart-alt2` | `ChartColumn` (alias `BarChart3`) | Sidebar · Reportes | 18 |
| `insight` | `ChartLine` (alias `LineChart`) | Sidebar · Analítica IA; icon box de Insight card | 18 / 20 |
| `user-group` | `Users` | Configuración · Sedes y usuarios (uso de Sidebar · Personal retirado: la ruta ya no está en la navegación) | 18 |
| `settings-02` | `Settings` | Sidebar · Configuración | 18 |
| `clipboard` | `ClipboardList` | Sidebar · Evidencia de tesis | 18 |
| `search` / `search-lg` | `Search` | Search del topbar, search de tabla, Empty NoResults | 16 / 40 |
| `help-circle` | `CircleHelp` | Topbar · ayuda | 20 |
| `chevron-right` | `ChevronRight` | Separador de breadcrumb | 14 |
| `chevron-down` | `ChevronDown` | Dropdown inline / select | 16 |
| `file-xls` | `FileSpreadsheet` | Botón "Exportar" | 20 |
| `plus` | `Plus` | Botón "Nueva orden" | 20 |
| `sliders` | `SlidersHorizontal` | Botón "Columnas" | 20 |
| `layer` | `Layers` | Botón "Densidad" | 20 |
| `dots-horizontal` | `Ellipsis` (alias `MoreHorizontal`) | Menú de fila y de Line card | 18 / 20 |
| `arrow-up` | `ArrowUp` | Delta positivo de KPI | 14 |
| `arrow-down` | `ArrowDown` | Delta negativo de KPI | 14 |
| `arrow-right` | `ArrowRight` | Botón "Siguiente" del stepper | 20 |
| `stop-circle` | `CircleStop` | Line card · botón "Parada" | 20 |
| `play-circle` | `CirclePlay` | Line card · botón "Iniciar orden" | 20 |
| `alert-triangle` | `TriangleAlert` | Chip de riesgo de Line card | 14 |
| `alert-circle` | `CircleAlert` | Empty state · Error | 40 |
| `x-mark` | `X` | Cierre de Modal y Drawer | 16 |
| `check` | `Check` | Paso completado del stepper; confirmar | 14 / 20 |
| `check-circle` | `CircleCheck` | Bullets del login | 20 |
| `inbox` | `Inbox` | Empty state · NoData | 40 |
| `stopwatch` | `Timer` | Chip cronómetro TRI | 14 |

## Iconos previstos por los specs de módulos (aún no leídos en Figma) **[KIT/SPEC]**

| Nombre Figma | lucide-react | Uso previsto |
|---|---|---|
| `monitor` | `Monitor` | Botón "Modo TV" (Tiempo real) |
| `camera` | `Camera` | "Evidencia (foto)" en captura de parada/merma |
| `scan-qr-code` | `ScanQrCode` (alt. `QrCode`) | "Código de balde" en captura de merma |
| `download` | `Download` | Exportaciones, descargar anexo |
| `upload` | `Upload` | "Cargar hoja" del pretest (TRI) |
| `file-csv` | `FileSpreadsheet` | Exportar CSV (mismo glifo que XLSX; diferenciar por label) |
| `file-pdf` | `FileText` | Exportar PDF |
| `file-export` | `FileOutput` | "Generar archivo" |
| `printer` | `Printer` | "Imprimir" en detalle de OF |
| `edit` | `SquarePen` (alias `Pencil`) | "Editar" orden/parada |
| `trash` | `Trash2` | Eliminar (siempre con modal Danger) |
| `filter` | `ListFilter` | Filtros |
| `save` | `Save` | Guardar en Configuración |
| `send` | `Send` | Enviar encuesta |
| `calendar-01` | `Calendar` | Rango de fechas |
| `clock` | `Clock` | Horas de parada, ventana de alerta |
| `list-check` | `ListChecks` | Checklist CFS (Anexo 05) |
| `task-list` | `ClipboardCheck` | Bitácora / validación |
| `user` | `User` | Responsable |
| `radar` | `Radar` | Predicciones activas |
| `eye` | `Eye` | "Ver pantalla" / ver evidencia |
| `dots-vertical` | `EllipsisVertical` | Menús verticales |
| `arrow-path` / `rotate-right` | `RotateCw` (o `RefreshCw`) | Reentrenar modelo, reintentar |
| `database` | `Database` | Datasets de exportación |
| `cpu` | `Cpu` | Modelo/IA |
| `flask` | `FlaskConical` | Calidad / laboratorio |
| `light-bulb` | `Lightbulb` | Insight alternativo |
| `temperature` | `Thermometer` | Túnel de frío (uso en Pasteurización retirado: la ruta ya no está en la navegación) |
| `forbidden` | `Ban` | Desactivar causa, estado forbidden |
| `archive` | `Archive` | Órdenes archivadas |
| `tag` | `Tag` | Lote / etiqueta |
| `logout` | `LogOut` | Cerrar sesión |
| `categories` | `LayoutGrid` | Catálogos |
| `package` | `Package` | Producto / producción |
| `tree-structure` | `Network` (alt. `ListTree`) | Árbol de causas TT-GG-EE |
| `git-branch` | `GitBranch` | Versiones del modelo |
| `pin` | `Pin` | Fijar |
| `flag` | `Flag` | Meta / hito |
| `star` | `Star` | Favorito |
| `shield-check` | `ShieldCheck` | Permisos/roles |
| `verify` | `BadgeCheck` | Orden validada |
| `ranking` | `ListOrdered` (alt. `Trophy`) | Ranking de causas |
| `pause-circle` | `CirclePause` | Pausar |
| `zap` | `Zap` | Evento IoT |
| `info-circle` | `Info` | Alert Info |
| `plus-circle` | `CirclePlus` | Añadir en línea |
| `x-mark-circle` | `CircleX` | Descartar |
| `chevron-left` | `ChevronLeft` | Paginación |
| `stopwatch` | `Timer` | TRI en otros flujos |

## Notas
- `lucide-react` renombró varios iconos (v0.4xx+): usar los nombres nuevos (`House`, `CircleHelp`, `TriangleAlert`, `CircleAlert`, `Ellipsis`, `CircleStop`, `CirclePlay`, `CircleCheck`, `ChartColumn`, `ChartLine`); los alias antiguos siguen exportados pero no se usan en este proyecto.
- `stopwatch` no existe en lucide: `Timer` es el equivalente visual (cronómetro con pulsador). Es el único glifo con diferencia apreciable respecto al MDS y aun así aceptable.
- El avatar del topbar/sidebar/pie **no es un icono**: es un círculo (32 / 28) con iniciales sobre `#EFF6FF` y texto `#1D4ED8`, o la foto del usuario.
- Si en el futuro hiciera falta un glifo sin equivalente, descargarlo con `download_assets` a `packages/ui/src/icons/` y envolverlo en un componente con la misma API que lucide (`size`, `strokeWidth`, `className`).
