# Frames construidos en Figma (fileKey WOfwZEmPx1Hcw7ehaIsnpx)
## 01 Shell & Patterns (2144:4)
Sidebar 2147:5 · Topbar 2149:13 · Page header 2149:39 · Breadcrumb 2149:31 · Section title 2149:59 · Tabs 2150:51 · KPI card 2150:75 · Alert card 2151:58 · Insight card 2151:59 · Stepper 2152:87 · Empty state 2152:118 · Line card 2153:238 · Modal 2154:119 · Drawer 2154:120 · Table header 2155:89 · Table row 2155:107
## 03 Tiempo real (2144:6) — RF1, RF6
A Líneas Default 1440 → 2156:3936 · B 1024 → 2163:1568 · C Modo TV 1920 → 2163:8523 · D Empty → 2156:7386 · E Drawer detalle línea → 2156:7548
## 07 Alertas (2144:10) — RF9, OT2/EP
A Bandeja Default → 2156:5417 · B Drawer detalle → 2163:8896 · C Modal confirmar evento real → 2163:11719 · D Empty → 2163:13378 · E Popover notificaciones → 2163:13751 · F Drawer umbrales → 2163:15102
Notas: Tag usa Inter Display (workaround); props booleanas exigen true/false; no se puede appendChild dentro de instancias (Drawer/Modal detach); dos Primary en drawer B.
## 04 Captura rápida (2144:7) — RF1–RF4, OE1 (chip cronómetro TRI en todos)
A Parada P1 Causa → 2156:8269 · B Parada P2 Detalle (máquina, acción tomada) → 2156:8367 · C Parada P3 Confirmar (+Alert Info IoT) → 2163:2538 · D Finalizar parada → 2163:2672 · E Merma P1 → 2163:9376 · F Merma P2 → 2163:9517 · G Merma P3 → 2163:11105 · H Velocidad drawer → 2163:12740 · I Iniciar orden P1 → 2163:12873 · I2 Iniciar orden P2 Equipo → 2163:16326 · J Finalizar orden → 2163:16222 · K IoT parada sugerida → 2163:11217 · BASE fondo → 2156:93
## 05 Órdenes de fabricación (2144:8) — RF5, RF12, OE2
A Listado → 2156:4160 · B Empty sin resultados → 2156:6905 · C Detalle OF Resumen → 2156:8959 · D Detalle OF Paradas (máquina + acción tomada) → 2163:9998 · E Bitácora (RF12) → 2163:12196 · F Drawer editar parada → 2163:14623 · G Modal validar orden → 2163:15629
## 08 Analítica IA (2144:11) — RF8, OT2
A Resumen → 2156:4301 · B Patrones (heatmap) → 2156:4412 · C Predicciones → 2156:4523 · D Modelo CRISP-DM → 2156:4634 · E Datos insuficientes → 2156:4745 · Componente nuevo Stepper CRISP-DM 6 pasos → 2163:16124
## 09 Evidencia de tesis (2144:12) — RF14–17, KPI1–5
A Resumen → 2156:5682 · B TRI Anexo 02 → 2163:4263 · C TCI Anexo 03 → 2163:10456 · D TSP Anexo 04 → 2163:14157 · D2 Encuesta pública 1024 → 2163:15979 · E CFS Anexo 05 → 2163:17616 · F EP Anexo 06 → 2163:18770
## 02 Auth & Home (2144:5) — RF10, RF6, RF7
A Login → 2163:17066 · B Login error → 2163:17234 · C Dashboard Jefe → 2163:17435 · D Dashboard Maquinista → 2165:769 · E Loading → 2165:12928
## 10 Configuración (2144:13) — RF11, RNF14
A Causas de parada (árbol TT-GG-EE, lista-detalle) → 2163:18282 · B Máquinas + drawer nueva máquina → 2165:11984 · C Umbrales de alerta + sticky footer → 2165:13218 · D Modal Danger eliminar causa → 2165:13853
## 06 Reportes (2144:9) — RF7, RF13
A Indicadores → 2163:18418 · B Paradas (Pareto + donut) → 2163:18594 · C Mermas (apiladas + heatmap) → 2163:19459 · D Exportar → 2163:19635
## 00 Overview (2144:3)
MES / 00 Overview / 1440 → 2169:13553 (alcance, mapa de navegación, tabla de trazabilidad RF→frames, reglas MDS y excepciones, componentes MES-local)
## Revisiones de coherencia (2 rondas) — correcciones aplicadas
- Semántica de badges unificada: Activa=Warning, Vencida=Critical, Atendida/Confirmada/Validada/Vigente/Operativa=Success, Por validar/Pendiente/Mantenimiento/Generando=Warning, Cerrada/Archivada=Neutral; confianza ≥85 Success / 70–84 Informational / <70 Neutral; riesgo ≥70 Critical / 50–69 Warning / <50 Neutral.
- Un solo Primary por pantalla base; Primary de la base en Disabled cuando hay overlay. Excepción documentada: Primary "Parada" en cada Line card.
- Captura: sidebar activo "Tiempo real", Page header instanciado, L3 en estado Sugerida, alto 1080. Line card maestro: badge Sugerida = Warning.
- Alertas: filter bar apilado por grupo en los 6 frames (alto 1194), summary card activa única, icono search-lg.
- Evidencia: KPI 4+1 (267 px), gráficos sin card, tabs bajo el header, "Exportar" como botón Secondary.
- Analítica: escalas de confianza/riesgo únicas, "Vigente", footers de tabla 52 px, #3B82F6→#2563EB.
- Home/Reportes/Configuración: correcciones de tanda 2 (deltas con semántica favorable, paleta única de gráficos #2563EB/#16A34A/#F59E0B/#DC2626, labels KPI en Overline mayúsculas, Pareto↔donut coherentes, breadcrumbs, badges Activa/Baja, contraste del logo).
- Detach necesarios por limitación de Figma (no se puede appendChild dentro de instancias): Drawer/Modal body, Tabs con >4 pestañas, tablas con columnas propias (anexos).
