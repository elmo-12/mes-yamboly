# Product Backlog — MES Yamboly

Fecha de corte: 4-sep-2026 (cierre de la fase 2 "maestros reales"; corte anterior 3-sep-2026 con 8 historias `En curso`) · Rama `feat/maestros-reales` (base `main` en `2bb7f89`) · Producto: MES con analítica IA para Helatony's S.A.C. (Yamboly).
Fuente de estado: `git log --oneline`, `git status` y el código en `apps/api`, `apps/web`, `packages/types` al momento del corte, más el QA de integración de fase 2 (`docs/qa-report.md`).

---

## 1. Visión y objetivos

Yamboly opera 9 líneas de envasado (4 llenadoras, 2 extrusoras, 3 moldeadoras) repartidas en 9 sedes, en 2 turnos diarios. Antes del proyecto, el registro de paradas, mermas y velocidad se hacía en papel o en hojas de cálculo dispersas: los maquinistas anotaban las incidencias al final del turno, con datos incompletos y sin relación con la orden de fabricación en curso, y la planta no tenía forma de anticipar una parada o una merma antes de que ocurriera. El resultado era un OEE calculado tarde, con baja confianza, y decisiones de mantenimiento y de línea tomadas sin evidencia.

El MES Yamboly es el sistema construido para la tesis *"Implementación de un MES con analítica inteligente basada en IA para el control y monitoreo de la producción en la empresa Yamboly, Lima, 2026"* (UNT). Su objetivo es doble: (1) dar a la planta una herramienta real de captura en tiempo real, indicadores OEE, alertas predictivas y evidencia auditable, y (2) servir de instrumento experimental para demostrar, con datos medibles, que el registro de datos deja de tomar minutos y pasa a tomar segundos, que la información capturada es confiable, y que las alertas predictivas aciertan con la frecuencia suficiente para ser útiles. Todo el diseño viene de un Master Design System validado en Figma (57 pantallas) y todo el modelo de datos —líneas, máquinas, productos, velocidades y causas— viene de la extracción real del sistema anterior (Strapi/Postgres), no de datos inventados.

El sistema se evalúa con 5 KPIs de tesis, cada uno con una meta y un valor demostrado sobre los datos de evidencia (Anexos 02–06):

| KPI | Definición | Meta | Valor actual |
| --- | --- | --- | --- |
| **TRI** | Tiempo de Registro de Incidencias (ΣTR / n) | Reducción ≥ 40 % vs. pretest | **1,4 min (−51,7 % vs. 2,9 min pretest)** |
| **TCI** | Tasa de Calidad de Información (RC / RT × 100) | ≥ 90 % | **93,3 % (28/30 registros correctos)** |
| **TSP** | Tasa de Satisfacción del Personal (encuesta de 8 ítems, PO / PT × 100) | ≥ 80 % de acuerdo | **84,2 % (128/152, 19 respuestas)** |
| **CFS** | Cumplimiento Funcional del Sistema (FV / FT, funcionalidades verificadas / totales) | 9 / 9 | **9 / 9 (100 %)** |
| **EP** | Efectividad de las Predicciones (PCC / PTG × 100) | ≥ 80 % | **83,5 % (137/164 predicciones acertadas)** |

Este backlog documenta el trabajo necesario para sostener esos 5 KPIs con datos reales de Yamboly y hacer que las 9 funcionalidades contractuales (captura de datos, registro de producción, paradas, mermas, repositorio centralizado, dashboard en tiempo real, indicadores, analítica IA y alertas/predicciones) funcionen de punta a punta, tanto en el mock de demostración como contra el backend real.

---

## 2. Personas y roles

| Rol | Necesidad principal |
| --- | --- |
| **Jefe de producción** | Ver el estado consolidado de las 9 líneas y los indicadores OEE del día, y administrar los mantenedores (causas, máquinas, productos, sedes, usuarios) sin depender de TI. |
| **Supervisor de turno** | Atender alertas y validar órdenes de fabricación en tiempo real, con evidencia suficiente para no reabrir discusiones al cierre del turno. |
| **Maquinista** | Registrar una parada, una merma o una lectura de velocidad en segundos, sin abandonar la máquina ni perder el hilo de la producción. |
| **Calidad** | Confirmar que la merma y la parada están correctamente clasificadas y que las 9 funcionalidades del sistema siguen cumpliéndose (CFS). |
| **Encargado de mermas** | Clasificar la merma por tipo → clasificación → causa y decidir si se envía a pasteurización (recuperables) con trazabilidad completa. |
| **Investigador (tesista)** | Extraer evidencia objetiva y exportable de los 5 KPIs (TRI/TCI/TSP/CFS/EP) para sustentar los resultados frente al jurado. |

---

## 3. Convenciones

- **Prioridad (MoSCoW):** `Must` (bloquea la tesis o la operación diaria) · `Should` (valor claro, no bloqueante) · `Could` (mejora deseable) · `Won't` (fuera de este alcance).
- **Estimación:** puntos de historia, escala Fibonacci (1, 2, 3, 5, 8, 13, 21).
- **Estados:** `Hecho` (código en `main`/rama de fase, verificado) · `En curso` (código presente pero incompleto o con cambios sin commitear) · `Pendiente` (no iniciado).
- **Sprints:** `S1–S4` = fase Figma → código (ago-2026, base `2bb7f89`, 57/57 frames) · `S5` = fase actual "maestros reales" (mantenedores completos + datos reales, en curso) · `S6+` = pendientes sin fecha asignada.
- **Definición de Terminado (DoD):** `pnpm --filter @mes/types build && pnpm typecheck && pnpm lint && pnpm build` en verde · suite e2e correspondiente en verde · paridad mock↔API (mismos datos, mismo contrato) · fidelidad a Figma o desviación justificada por documento · todos los estados de UI cubiertos (loading / empty / no-results / error / success+toast / validación / confirmación / forbidden) · un único `Button variant="primary"` por pantalla · baja lógica con modal de confirmación en toda acción Danger.

---

## 4. Épicas e historias de usuario

### E1 — Shell, navegación y Design System

**E1-01 — Shell con navegación por rol**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S1`
Como **jefe de producción**, quiero un shell con sidebar, topbar y navegación filtrada por mi rol, para llegar a cada módulo sin ver opciones que no me corresponden.
- Sidebar fija (≥1280 px) / drawer con hamburguesa (<1280 px), topbar 64 px con notificaciones y perfil.
- `RoleGate`/`Forbidden` bloquea rutas no permitidas por rol (verificado: maquinista → `/configuracion` = Forbidden).
- Breadcrumb dinámico y guard de sesión (401 → logout → `/login`).

**E1-02 — Design System `@mes/ui` (tokens MDS + componentes)**
`Prioridad: Must · Puntos: 13 · Estado: Hecho · Sprint: S1`
Como **equipo de desarrollo**, quiero un Design System único con los tokens 1:1 del Figma MDS, para que ninguna vista invente colores, radios o sombras propios.
- 22 tokens semánticos + 3 añadidos documentados, tipografía Inter (13 estilos + `metric`), sin modo oscuro (White First).
- 45 componentes (18 primitivos + 27 patrones) reutilizados por las 14 features de `apps/web`, sin duplicados.
- Reglas MDS codificadas: página como contenedor, sombras solo en flotantes, Badge no interactivo, Danger con confirmación.

**E1-03 — Responsive 1440–390 y Modo TV**
`Prioridad: Should · Puntos: 5 · Estado: Hecho · Sprint: S2`
Como **supervisor de turno**, quiero que el sistema se vea correctamente en monitor de oficina, tablet y el TV de planta, para consultarlo desde cualquier punto de la línea.
- Sin scroll horizontal del body en 1440/1280/1024/768/390; tablas con scroll propio.
- Modo TV con tipografía y grillas ajustadas a 1920/1440, legible a distancia.
- Verificado en `docs/qa-report.md` (Q1, ago-2026) frame a frame.

---

### E2 — Tiempo real y captura

**E2-01 — Iniciar y finalizar orden con la velocidad del par producto×línea**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **maquinista**, quiero que al iniciar una orden el sistema resuelva automáticamente la velocidad estándar del par (producto, línea) y la congele en la orden, para que el OEE se calcule con el dato correcto de esa combinación.
- Al iniciar, si no existe un par activo (producto, línea) el sistema responde 422 bajo el campo `productoId`.
- `velocidadUnidMin` del par se congela en `OrdenFabricacion.velocidadEstandar` (no cambia si luego se edita el catálogo).
- Al finalizar: `producido`, `conteoCodificadora`, evidencia y comentario opcional; la orden pasa a `por_validar`.
- **Cierre (4-sep-2026):** `IniciarOrdenWizard.tsx` conectado y commiteado (`fadc3fc`, `f8ed869`); el 422 bajo `productoId` sin par vigente se verificó en UI durante el QA de fase 2.

**E2-02 — Registrar parada con cronómetro TRI y máquina-equipo obligatoria**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S2`
Como **maquinista**, quiero registrar una parada en segundos, con cronómetro visible y seleccionando la máquina-equipo exacta (envolvedora, codificadora, pinzas…), para que el tiempo de registro (TRI) sea mínimo y la causa quede trazada a nivel de equipo.
- Selector jerárquico de causa (árbol TT-GG-EE) + máquina-equipo de la línea, ambos obligatorios.
- `tiempoRegistroSeg` se envía en cada creación y alimenta el Anexo 02 (TRI) automáticamente.
- `accionTomada` obligatoria; `numeroSolicitud` condicional si la causa lo exige.
- Parada reabre con `fin: null` y recalcula `duracionMin` al cerrarse (spec 05.F).

**E2-03 — Registrar merma con selector jerárquico tipo → clasificación → causa**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **encargado de mermas**, quiero clasificar la merma en tres niveles (tipo de producción → clasificación → causa) igual que las paradas, para que la causa quede tan específica como la exige el análisis de mermas.
- Selector en cascada tipo → clasificación → causa sobre el árbol real (5 tipos / 11 clasificaciones / 40 causas).
- `observacion` y `numeroSolicitud` condicionales según la causa elegida (`requiereComentario`/`requiereSolicitud`).
- `sabor` se toma del catálogo `/sabores` (41 sabores reales), no de texto libre.
- Checkbox "Enviar a pasteurización" se conserva como dato (`enviarPasteurizacion`), sin prometer una pantalla que ya no existe.
- **Cierre (4-sep-2026):** `MermaWizard.tsx` commiteado y conectado a `features/catalogs/causas.ts` (`f8ed869`); reglas condicionales verificadas contra la API real en el QA de fase 2. Pendiente aparte (no bloquea el cierre): `Merma` no persiste `evidenciaUrl` — ver nueva historia E2-07.

**E2-04 — Registrar velocidad real vs. estándar del par**
`Prioridad: Should · Puntos: 5 · Estado: Hecho · Sprint: S5`
Como **maquinista**, quiero registrar la velocidad real de la línea y ver el desvío contra el estándar del par (producto, línea) en u/min, para detectar a tiempo una caída de desempeño.
- `POST /velocidades` calcula `desvioPct` contra `velocidadUnidMin` del par activo (ya no contra `Producto.velocidadEstandar`, retirado del contrato).
- Etiqueta de unidad corregida a u/min en el drawer (antes ambigua).
- Validación: velocidad ≤ 0 → 422.
- **Cierre (4-sep-2026):** `VelocidadDrawer.tsx` commiteado (`fadc3fc`); etiqueta u/min y `desvioPct` contra el par verificados en el QA de fase 2.

**E2-05 — Confirmar o descartar detección IoT sugerida**
`Prioridad: Should · Puntos: 5 · Estado: Hecho · Sprint: S2`
Como **supervisor de turno**, quiero revisar una parada sugerida por un sensor IoT y confirmarla o descartarla en un clic, para no perder detecciones automáticas ni duplicar el registro manual.
- `GET /detecciones-iot?estado=sugerida` lista pendientes; confirmar crea la `ParadaListItem` (201); descartar solo cambia estado.
- 409 si la detección ya fue procesada.
- Confirmar pide causa, máquina, acción tomada y tiempo de registro (mismo formulario que una parada manual).

**E2-06 — 9 LineCards en tiempo real y Modo TV con 9 filas**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **supervisor de turno**, quiero ver las 9 líneas reales (no las 5 anteriores + PT-01) en `/tiempo-real` y en el Modo TV, para que el panel refleje la planta física tal como es.
- `LineasGrid`, `LineasFilterBar` y `ModoTvPage` migrados a 9 líneas (4 llenadoras, 2 extrusoras, 3 moldeadoras) con `tipoProceso`.
- Estados de LineCard (produciendo / parada / sin_orden / alerta / sugerida) verificados para las 9.
- Barrido de turnos M/T/N → D/N aplicado en tiempo real y TV (turno único de 12 h, no 3 de 8 h).

**E2-07 — Persistir evidencia fotográfica de merma**
`Prioridad: Should · Puntos: 3 · Estado: Pendiente · Sprint: S6`
Como **encargado de mermas**, quiero que la foto de evidencia que adjunto al registrar una merma quede guardada en el servidor, para poder revisarla después sin depender de que nadie borre el archivo local.
- Hoy `Merma.evidenciaUrl` no se persiste: la foto sólo se exige como validación en el cliente (`AdjuntarFoto`), el backend no la recibe ni la guarda.
- Requiere un endpoint de subida (multipart o presigned URL) y que `POST /mermas` acepte `evidenciaUrl` resuelta.
- Detectado en el QA de fase 2 (4-sep-2026).

---

### E3 — Órdenes de fabricación

**E3-01 — Listado de órdenes con filtros y periodo**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S2`
Como **supervisor de turno**, quiero filtrar las órdenes por línea, turno, estado y periodo, para encontrar en segundos la orden que necesito revisar.
- Filtros combinables (`lineaId[]`, `turno[]`, `estado[]`, `search`), orden por fecha/código/OEE/producido.
- `resumen` (todas/porValidar/conParadas/conMermas) separado de `meta.total` del listado paginado.
- Paginación `page`/`pageSize` (máx. 200).

**E3-02 — Detalle de orden en 7 pestañas**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S2`
Como **supervisor de turno**, quiero abrir una orden y ver resumen, paradas, mermas, velocidades, colaboradores, bitácora y validación en pestañas, para tener todo el contexto de la orden en una sola pantalla.
- Acepta id (`ORD-0815`) o código (`OF-2026-0815`) en la URL.
- Cada subrecurso (`/paradas`, `/mermas`, `/velocidades`, `/bitacora`) con su propio resumen.
- Estados de orden `en_curso` / `cerrada` / `por_validar` / `validada` / `incompleta` reflejados visualmente.

**E3-03 — Validar orden (4 verificaciones)**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S2`
Como **supervisor de turno**, quiero validar una orden confirmando 4 checks (producción registrada, paradas con causa, mermas clasificadas, evidencia de etiqueta), para que solo pase a `validada` la información realmente completa (alimenta TCI).
- Los 4 booleanos deben ser `true` o la API responde 422.
- 409 si la orden está en curso o ya fue validada.
- El registro alimenta el Anexo 03 (TCI: registros correctos / totales).

**E3-04 — Bitácora de auditoría por orden**
`Prioridad: Should · Puntos: 3 · Estado: Hecho · Sprint: S2`
Como **calidad**, quiero ver quién cambió qué y cuándo dentro de una orden, para auditar ediciones de causa u hora de fin sin depender de la memoria del turno.
- `GET /ordenes/:id/bitacora?tipo[]` con 7 tipos de evento, orden descendente por fecha.
- Cambios de causa y de hora de fin de una parada se escriben automáticamente en la bitácora.

---

### E4 — Reportes

**E4-01 — Indicadores OEE y comparativa por turno D/N**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero ver el OEE, su tendencia y la comparativa entre el turno Día y el turno Noche, para decidir dónde enfocar la mejora sin mezclar datos de 3 turnos que ya no existen.
- `comparativaTurno` migrada de M/T/N a D/N (2 turnos reales, 06:00–18:00 / 18:00–06:00).
- `oeePorLinea` con las 9 líneas reales.
- Filtros por periodo (`hoy|semana|mes|trimestre|personalizado`) y comparación (`periodo_anterior|anio_anterior`).

**E4-02 — Pareto de paradas**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S3`
Como **supervisor de turno**, quiero ver el Pareto de causas de parada del periodo, para atacar primero la causa que más minutos consume.
- Pareto + donut + detalle por causa sobre el árbol real (5 tipos / 26 generales / 52 específicas).
- `kpis` del periodo (minutos totales, cantidad de eventos, % que afecta OEE).

**E4-03 — Mermas apiladas y heatmap**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S3`
Como **encargado de mermas**, quiero ver la merma apilada por línea y el heatmap por causa, para identificar patrones antes de que se acumulen en kilos.
- `apiladasPorLinea` con las 9 líneas; `heatmap` y `tabla` por causa/clasificación.
- Total de kilos y eventos coherente con `packages/shared/src/kpis-tesis.ts` (412 kg no se alteran al redistribuir entre líneas).

**E4-04 — Exportación XLSX de anexos**
`Prioridad: Should · Puntos: 5 · Estado: Hecho · Sprint: S3`
Como **investigador**, quiero exportar los datasets de reportes en XLSX, para llevar la evidencia a SPSS/Excel sin transcribir a mano.
- `POST /reportes/exportar` con `datasets[]` (ordenes/paradas/mermas/velocidades/indicadores/alertas/evidencia), 202 asíncrono.
- Descarga autenticada vía `fetch` + blob (no `<a download>`, porque requiere `Authorization`).
- 422 si `datasets` viene vacío.

**E4-05 — Exportación CSV/PDF**
`Prioridad: Could · Puntos: 5 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero exportar también en CSV y PDF, para compartir reportes con quien no abre Excel.
- `formato` del contrato ya admite `csv|pdf`, pero el backend solo genera XLSX hoy.
- Requiere plantilla PDF (encabezado, KPIs, gráficos) y serialización CSV por dataset.

---

### E5 — Alertas y motor de reglas

**E5-01 — Bandeja de alertas con filtros**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S3`
Como **supervisor de turno**, quiero ver todas las alertas activas filtradas por tipo, severidad y línea, para priorizar cuál atender primero.
- Tipos `parada_prevista|merma_prevista|velocidad_baja|oee_bajo`; severidades `critica|alta|media`.
- Popover de campana con las 3 más recientes; resumen (`activas`, `atendidasHoy`, `pendientesConfirmar`, `vencidas`, `epAcumulada`).

**E5-02 — Atender o descartar alerta**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S3`
Como **supervisor de turno**, quiero atender una alerta describiendo la acción tomada, o descartarla con motivo, para dejar registro de qué se hizo con cada predicción.
- `AtenderAlerta.accionTomada` mínimo 10 caracteres; 409 si ya está confirmada.
- `DescartarAlerta.motivo` obligatorio.

**E5-03 — Confirmar evento y acumular EP**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S3`
Como **calidad**, quiero confirmar si la alerta ocurrió realmente o fue un falso positivo, para que el sistema acumule la Efectividad de las Predicciones (EP) con datos reales.
- `ConfirmarEvento{ocurrio, observacion?}` devuelve `ep` (EP acumulada en %) además de la alerta y el resumen.
- 409 si la alerta ya fue confirmada.
- Alimenta el Anexo 06 (137/164 predicciones acertadas, sin alterar el total al redistribuir entre líneas).

**E5-04 — Confirmación en lote**
`Prioridad: Should · Puntos: 3 · Estado: Hecho · Sprint: S3`
Como **supervisor de turno**, quiero confirmar varias alertas del turno de una sola vez, para no repetir el mismo formulario decenas de veces al cierre.
- `POST /alertas/confirmar-lote` con lista de `{alertaId, ocurrio, observacion?}`; 422 si la lista viene vacía.
- Devuelve `ep` recalculada tras el lote.

---

### E6 — Analítica IA

**E6-01 — Resumen del modelo e insights**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S3`
Como **jefe de producción**, quiero un resumen con el riesgo por línea y los insights del modelo, para anticipar qué línea necesita atención antes de que aparezca la alerta.
- `AnaliticaResumen{modelo, kpis{ep,precision,recall,alertas30d}, insights, riesgoPorLinea, prediccionesActivas}`.
- `riesgoPorLinea` cubre las 9 líneas reales.

**E6-02 — Patrones: heatmap causa × turno**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S5`
Como **investigador**, quiero ver el heatmap de minutos perdidos por causa y turno, para mostrar en la tesis los patrones que el modelo detecta.
- Heatmap 5 tipos de causa × 2 turnos (D/N) — antes 12 celdas (M/T/N ampliado), ahora 10, migrado en esta fase.
- `recurrencias` con el patrón identificado (día/hora/causa).

**E6-03 — Predicciones 30 días vs. real**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S3`
Como **jefe de producción**, quiero comparar lo predicho contra lo ocurrido en los últimos 30 días, para confiar (o no) en las alertas antes de actuar sobre ellas.
- `Predicciones{serie(predicho vs real 30 d), historico}`.
- Serie alimentada por `RuleBasedPredictionProvider` (motor de reglas activo hoy).

**E6-04 — Ficha CRISP-DM y versiones de modelo**
`Prioridad: Should · Puntos: 5 · Estado: Hecho · Sprint: S3`
Como **investigador**, quiero ver las 6 fases CRISP-DM, las métricas del modelo y sus versiones, para documentar la metodología de la tesis con la ficha técnica real del sistema.
- `Modelo{fasesCrispDm[6], metricas, versiones, variablesEntrada}`.
- `POST /analitica/modelo/:version/activar` (404 si la versión no existe) y `POST /analitica/reentrenar` (403 fuera de `jefe`/`investigador`).
- `PredictionProvider` intercambiable: `RuleBasedPredictionProvider` activo hoy, `PythonHttpPredictionProvider` como stub con fallback (`PREDICTION_SERVICE_URL`).

**E6-05 — Microservicio Python real (scikit-learn)**
`Prioridad: Must · Puntos: 13 · Estado: Pendiente · Sprint: S6`
Como **investigador**, quiero que las predicciones vengan de un modelo scikit-learn entrenado con los datos reales de la planta (no solo reglas), para que el capítulo de analítica IA de la tesis tenga un modelo entrenado detrás.
- Servicio HTTP en Python que implemente el contrato ya definido por `PythonHttpPredictionProvider`.
- Entrenamiento con los datos reales extraídos (paradas, mermas, velocidades) siguiendo CRISP-DM (fases ya documentadas en `/analitica/modelo`).
- Sin este servicio, el sistema sigue operando con el fallback de reglas (RF8/RF9 cubiertos igual, pero sin modelo entrenado real).

---

### E7 — Evidencia de tesis

**E7-01 — TRI: tiempo de registro de incidencias**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S4`
Como **investigador**, quiero ver el TRI postest comparado contra el pretest cargado manualmente, para sustentar la reducción del 51,7 % con datos trazables al Anexo 02.
- `EvidenciaTRI{postest, pretest, promedioPostest, promedioPretest, reduccionPct, meta, estado}`.
- `POST /evidencia/tri/pretest` carga la hoja pretest (`{fecha, eventoRegistrado, horaInicioRegistro, tiempoMin}`); 422 si la lista viene vacía.
- `tiempoRegistroSeg` de cada parada/merma/velocidad alimenta el postest automáticamente (evento `evidence.tri.registro`).

**E7-02 — TCI: tasa de calidad de información**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S4`
Como **investigador**, quiero ver cuántos registros de validación de orden fueron correctos sobre el total, para sustentar el 93,3 % (28/30) del Anexo 03.
- `EvidenciaTCI{registros, registrosCorrectos, registrosTotales, porcentaje, meta, estado}` calculado sobre `E3-03`.

**E7-03 — TSP: satisfacción del personal + encuesta pública**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S4`
Como **investigador**, quiero una encuesta pública de 8 ítems Likert que cualquier operario pueda responder con un enlace, para sustentar el 84,2 % de acuerdo (128/152, 19 respuestas) sin depender de que estén logueados.
- `GET/POST /encuesta/:token` público, token de un solo uso, recalcula TSP al recibir cada respuesta.
- `EncuestaTSP{items[8], respuestas, invitados, promedio, pctAcuerdo, meta, estado, enlace}`.

**E7-04 — CFS: cumplimiento funcional (9/9)**
`Prioridad: Must · Puntos: 3 · Estado: Hecho · Sprint: S4`
Como **calidad**, quiero un checklist de las 9 funcionalidades contractuales marcadas cumple/no cumple, para sustentar el CFS = 9/9 con evidencia verificable ítem por ítem.
- `EvidenciaCFS{items[9], cumplidas, totales, porcentaje, meta, estado}`.
- `PATCH /evidencia/cfs/:id {cumple, observacion}` deja registro de quién validó cada ítem.

**E7-05 — EP: efectividad de las predicciones**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S4`
Como **investigador**, quiero ver el acumulado de predicciones acertadas sobre el total, para sustentar el 83,5 % (137/164) del Anexo 06.
- `EvidenciaEP{registros, prediccionesCorrectas, prediccionesTotales, porcentaje, meta, estado}` alimentado por `E5-03`.

**E7-06 — Exportación de anexos XLSX (02–06)**
`Prioridad: Should · Puntos: 5 · Estado: Hecho · Sprint: S4`
Como **investigador**, quiero exportar los 5 KPIs como anexos XLSX (una hoja por anexo), para entregarlos directamente en la tesis sin retrabajo.
- `POST /evidencia/exportar {kpis[], formato, destino(spss|informe)}` (202).
- Una hoja por KPI, generada con `exceljs` sobre los datos reales de la evidencia.

---

### E8 — Configuración y mantenedores

**E8-01 — Causas de parada: árbol TT-GG-EE con código legado**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero mantener el árbol de causas de parada (tipo → general → específica) con su código heredado del sistema anterior, para no perder trazabilidad histórica al migrar.
- CRUD completo (`GET/POST/PATCH/DELETE /causas-parada`), baja lógica con `paradasConservadas` en la respuesta.
- 83 causas reales cargadas (5 tipos, 26 generales, 52 específicas), con `codigoLegado` (p. ej. `RUT04`, `IMP10`).
- `CausasTree.tsx` genérico (nodo `{id,codigo,nombre,estado,nivel,hijos}`) reutilizado también por E8-02.

**E8-02 — Causas de merma: árbol de 3 niveles tipo → clasificación → causa**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **encargado de mermas**, quiero un árbol de causas de merma con la misma mecánica que el de paradas, para clasificar con el mismo nivel de detalle que antes ofrecía el sistema legado.
- `CausasMermaTab.tsx` (lista-detalle con árbol + alta + baja), `CausaMermaDetalle.tsx` sobre `CausaDetalleShell.tsx` compartido con paradas.
- `GET /causas-merma?formato=arbol|plano&nivel&tipo&lineaId`, CRUD completo, baja lógica con `mermasConservadas`.
- 56 causas reales cargadas (5 tipos de producción, 11 clasificaciones, 40 causas hoja), materializadas por par (tipo, clasificación) donde el dump tenía relaciones muchos-a-muchos.

**E8-03 — Máquinas-equipo: alta y baja lógica**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero dar de alta una máquina-equipo (envolvedora, codificadora, pinzas, faja…) y darla de baja sin perder su histórico de paradas, para mantener el catálogo de equipos por línea al día.
- `MaquinasTab.tsx` con `MaquinaDrawer` de alta (`codigo` regex `MQ-XXXXXX-NN`, `tipo`, `lineaId`).
- Cambio de estado (`operativa|mantenimiento|baja`) desde menú contextual, con `actualizar.mutateAsync`.
- 409 código duplicado, 422 validación.

**E8-04 — Máquinas-equipo: edición**
`Prioridad: Must · Puntos: 3 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero editar el nombre, tipo o línea de una máquina existente (no solo su estado), para corregir datos sin dar de baja y volver a crear.
- El endpoint `PATCH /maquinas/:id` ya acepta `Partial<MaquinaInput>` completo.
- **Cierre (4-sep-2026):** `MaquinaDrawer` gana modo edición (precarga desde una máquina existente) en `2d9ee38`; verificado en el QA de fase 2 (`?tab=maquinas`, frame 2165:11984, alta fidelidad).

**E8-05 — Productos: alta, edición y baja**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero dar de alta, editar y dar de baja productos (código de 7 dígitos, descripción, sabor, presentación), para mantener el catálogo de 201 productos reales sin depender de una migración manual.
- API completa: `GET/POST/PATCH/DELETE /productos` (`search`, baja lógica, 422/409).
- **Cierre (4-sep-2026):** `ProductosVelocidadesTab.tsx` reescrita contra el nuevo `Producto` (sin `lineaId`/`velocidadEstandar`) con `ProductoDrawer` de alta/edición y `EliminarProductoModal` para la baja (`2d9ee38`); verificado en el QA de fase 2, alta fidelidad.

**E8-06 — Matriz de velocidades producto × línea editable**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero una matriz editable de producto × línea donde cada celda es la velocidad estándar de ese par, para reflejar que un mismo producto rinde distinto según en qué línea se fabrique (333 pares reales sembrados, 12–483,3 u/min).
- API completa: `GET/POST/PATCH/DELETE /velocidades-estandar`, unicidad `(productoId, lineaId)`, 409 en par duplicado.
- **Cierre (4-sep-2026):** `MatrizVelocidades` (tabla producto × 9 líneas, columna por tipo de proceso) y `VelocidadEstandarModal`/`EliminarVelocidadModal` commiteados (`2d9ee38`, `9f43e2a`); scroll automático a la matriz al elegir producto; verificado en el QA de fase 2, alta fidelidad. Bug corregido en la misma fase: ids `VE-` duplicados al crear velocidades.

**E8-07 — Umbrales de alerta configurables**
`Prioridad: Should · Puntos: 3 · Estado: Hecho · Sprint: S3`
Como **jefe de producción**, quiero ajustar los umbrales que disparan una alerta (velocidad bajo estándar, OEE mínimo, probabilidad mínima), para calibrar la sensibilidad del motor de reglas a la realidad de la planta.
- `GET/PUT /alertas/umbrales`; `PUT` restringido a rol `jefe` (403 para el resto).
- `Umbrales{velocidadBajoEstandarPct, oeeMinimo, probabilidadMinima, notificarN8n, mostrarTv}`.

**E8-08 — Sedes: alta y edición**
`Prioridad: Should · Puntos: 3 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero dar de alta o editar una sede (de las 9 reales: Arequipa, Ayacucho, Chiclayo, Huancayo, Iquitos, Lima, Moyobamba, Pucallpa, Tarapoto), para mantener el catálogo sin pedirlo a TI.
- API lista: `POST/PATCH /sedes` (restringido a `jefe`), `GET` movida desde `users` a `catalogs`.
- **Cierre (4-sep-2026):** `SedesUsuariosTab.tsx` deja de ser de solo lectura; `SedeDrawer` de alta/edición y `DesactivarSedeModal` commiteados (`2d9ee38`); comentario obsoleto sobre Personal/RR. HH. retirado; verificado en el QA de fase 2, alta fidelidad.

**E8-09 — Usuarios: alta, edición, estado y restablecer contraseña**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero crear usuarios, editarlos, activarlos/desactivarlos y restablecerles la contraseña desde Configuración, para no depender de un script cuando cambia el personal de planta.
- API completa: `POST /usuarios` (bcrypt, iniciales derivadas, 409 email/dni), `PATCH /usuarios/:id` (sin password), `POST /usuarios/:id/estado` (409 si es uno mismo), `POST /usuarios/:id/restablecer-password`.
- **Cierre (4-sep-2026):** `UsuarioDrawer`, `RestablecerPasswordModal` y `DesactivarUsuarioModal` commiteados y conectados desde `SedesUsuariosTab.tsx` (`2d9ee38`); `UsuarioDrawer` filtra sólo sedes activas (corrección de QA, `9f43e2a`); verificado en el QA de fase 2, alta fidelidad.

**E8-10 — Umbrales de alerta: modelo completo según Figma**
`Prioridad: Could · Puntos: 3 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero ajustar los 8 umbrales y acciones de cabecera que muestra el frame Figma **2165:13218** (no solo los 5 campos actuales), para calibrar el motor de reglas con el mismo nivel de detalle que diseñó el MDS.
- El modelo actual (`E8-07`, Hecho) cubre `velocidadBajoEstandarPct`, `oeeMinimo`, `probabilidadMinima`, `notificarN8n`, `mostrarTv` — una reducción consciente frente a los 8 ajustes + acciones de cabecera del frame (decisión previa, documentada en el QA de fase 1 y sostenida en la fase 2).
- Requiere ampliar `Umbrales` en `@mes/types` y el contrato `GET/PUT /alertas/umbrales`.

---

### E9 — Datos maestros reales y migración

**E9-01 — Extracción del dump Strapi a JSON**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **equipo de desarrollo**, quiero un script de un solo uso que lea el dump Postgres del sistema anterior (`pg_restore -a`) y produzca los JSON de maestros reales, para no depender de `pg_restore` en tiempo de ejecución ni de datos inventados.
- `apps/api/src/database/seeds/data/real/*.json` commiteados: 9 líneas, 9 sedes, 41 sabores, 201 productos, 333 velocidades sembradas (340 extraídas del dump; 6 sin producto vigente y 1 duplicado descartados), 83 causas de parada, 56 causas de merma.
- Deduplicado por `document_id` (fila publicada de Strapi), conversión u/h → u/min con 1 decimal, sabor asignado por coincidencia de texto.

**E9-02 — Contratos `@mes/types` para el modelo real**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S5`
Como **equipo de desarrollo**, quiero los contratos compartidos (líneas reales, `VelocidadEstandar` por par, árbol de causas de merma, esquemas de usuario) actualizados y con build verde, para que front y back compilen contra el mismo tipo.
- `TURNOS = ['D','N']`, `TIPOS_PROCESO_LINEA`, `VelocidadEstandar`/`VelocidadEstandarListItem`, `CausaMermaNodo`, `crearUsuarioSchema`/`actualizarUsuarioSchema`/`restablecerPasswordSchema`.
- `Producto` pierde `lineaId` y `velocidadEstandar` (ahora viven en el par); `pnpm --filter @mes/types build` en verde.

**E9-03 — Entidades y servicios API con maestros reales**
`Prioridad: Must · Puntos: 13 · Estado: Hecho · Sprint: S5`
Como **equipo de desarrollo**, quiero las entidades TypeORM y los servicios de `catalogs`/`users`/`orders`/`scrap`/`speeds` migrados al modelo real, para que el backend opere sobre 9 líneas, el par (producto, línea) y el árbol de merma de 3 niveles.
- Entidades nuevas (`sabor`, `velocidad-estandar`) y modificadas (`linea`, `producto`, `causa-parada`, `causa-merma`, `merma`, `sede`, `orden-fabricacion`).
- Al iniciar una orden se resuelve el par activo y se congela `velocidadUnidMin`; sin par → 422.
- 95 endpoints bajo `/api/v1` (79 antes de esta fase), roles con `@Roles`, Swagger actualizado.

**E9-04 — Seeds deterministas api↔mock idénticos (9 líneas × 2 turnos)**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **investigador**, quiero que los seeds de la API y los mocks del frontend usen exactamente los mismos datos (misma semilla), para que demostrar el sistema en modo mock o contra la API real dé el mismo resultado.
- `apps/api/src/database/seeds/data/*` y `apps/web/src/mocks/data/*` regenerados con la misma `SEED`.
- Barrido M/T/N → D/N en ~18 vistas (órdenes, reportes, analítica, home, evidencia, heatmaps, comparativa por turno).
- Los totales de tesis no se alteran al redistribuir entre 9 líneas × 2 turnos: 164/137 predicciones, 412 kg de merma, 7 puntos de tendencia OEE, 28/30 TCI, 128/152 TSP.

**E9-05 — Retiro de Pasteurización y Personal**
`Prioridad: Should · Puntos: 2 · Estado: Hecho · Sprint: S5`
Como **jefe de producción**, quiero que las rutas `/pasteurizacion` y `/personal` desaparezcan de la navegación, para no mostrar módulos placeholder que no aportan a la tesis.
- `app/(app)/pasteurizacion/*` y `app/(app)/personal/*` eliminados; ítems retirados de `config/navigation.ts` y `config/breadcrumbs.ts`.
- Referencias limpiadas en `app/dev/ui/page.tsx` y `app/dev/api/page.tsx`; ambas rutas devuelven 404.
- El flag `enviarPasteurizacion` de merma se conserva como dato (E2-03), sin prometer una pantalla.

**E9-06 — Importar históricos reales de paradas y mermas**
`Prioridad: Should · Puntos: 8 · Estado: Pendiente · Sprint: S6`
Como **investigador**, quiero cargar el histórico real de paradas y mermas del sistema anterior (no solo los catálogos), para que los reportes de tendencia reflejen producción real y no solo datos sintéticos de demostración.
- Requiere extraer y mapear las tablas transaccionales del dump (`paradas`, `mermas` reales) contra el nuevo modelo de causas y líneas.
- Debe convivir con los seeds de tesis (E9-04) sin romper los totales fijos de los 5 KPIs.

**E9-07 — Migración a PostgreSQL**
`Prioridad: Should · Puntos: 8 · Estado: Pendiente · Sprint: S6`
Como **equipo de desarrollo**, quiero migrar de SQLite a PostgreSQL, para operar en un entorno de producción con concurrencia y respaldo reales.
- `TypeOrmModule` ya está aislado detrás de un datasource (documentado en el README como "migrar a PostgreSQL = cambiar el datasource"), pero no hay migraciones ni script de despliegue todavía.
- Requiere generar migraciones TypeORM (hoy `synchronize: true`) antes del corte a producción.

**E9-08 — Tiempos estándar de cambio producto × producto**
`Prioridad: Could · Puntos: 5 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero registrar el tiempo estándar de cambio (changeover) entre cada par de productos en una misma línea, tal como lo tenía el sistema anterior, para que el OEE descuente correctamente el tiempo de preparación al cambiar de producto.
- El sistema anterior incorporaba esta matriz producto×producto (fuera del alcance de `producto_lineas`, que ya se migró en E9-01/E9-03).
- No forma parte del modelo actual (`VelocidadEstandar` cubre `cipMin`/`arranqueMin` por par, no la transición entre dos productos distintos).

**E9-09 — Sincronizar el snapshot mock de tiempo real con la API**
`Prioridad: Could · Puntos: 2 · Estado: Pendiente · Sprint: S6`
Como **equipo de desarrollo**, quiero que el snapshot mock de `lineaEstados` (escrito a mano) coincida exactamente con lo que produce la API, para que demostrar el sistema en modo mock o modo api dé el mismo estado de planta.
- El snapshot mock difiere de la API en 3 líneas y en el turno (hallazgo del QA de fase 2).
- Requiere regenerar `apps/web/src/mocks/data/realtime.ts` desde la misma semilla que usa `realtime.service.ts`, no mantenerlo a mano.

**E9-10 — Anclar los seeds de tesis al día operativo**
`Prioridad: Should · Puntos: 3 · Estado: Pendiente · Sprint: S6`
Como **investigador**, quiero que los seeds de evidencia de tesis en la API usen el mismo día operativo fijo que usa el mock (constante `HOY`), no el reloj real del servidor, para que los 5 KPIs no varíen según la fecha en que se levante la demo.
- Hoy `apps/api/src/database/seeds/thesis-seed.util.ts` calcula `hoy()` contra el reloj real; el mock usa una constante `HOY` fija.
- Detectado en el QA de fase 2 (4-sep-2026); no afecta los totales fijos de los 5 KPIs, sólo la fecha de referencia.

**E9-11 — Importar tiempos estándar de resolución de causas de parada cuando el dump los incluya**
`Prioridad: Could · Puntos: 2 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero que `CausaParada.tiempoEstandarMin` refleje el tiempo estándar real de resolución de cada causa específica, para poder comparar el tiempo real de una parada contra su estándar.
- El dump extraído en E9-01 es anterior a esta funcionalidad: `tiempoEstandarMin` queda en 0 en las 52 causas específicas.
- Depende de que el sistema anterior (o una fuente equivalente) exporte esos tiempos; hasta entonces el campo se mantiene editable a mano en el mantenedor de causas.

---

### E10 — Backend, seguridad y calidad

**E10-01 — JWT + roles por endpoint**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S1`
Como **jefe de producción**, quiero que cada endpoint valide el token y el rol antes de responder, para que la autorización no dependa solo de ocultar botones en el frontend.
- `JwtAuthGuard` global + `@Public()` en login/encuesta; `RolesGuard` con `@Roles` por endpoint (6 roles).
- Contraseñas con bcrypt, sin claves en el cliente, CORS restringido.

**E10-02 — Validación 422 tipada y Swagger**
`Prioridad: Must · Puntos: 5 · Estado: Hecho · Sprint: S2`
Como **equipo de desarrollo**, quiero DTOs con `class-validator` y Swagger generado desde el mismo código, para que el contrato documentado nunca se desincronice del real.
- `ValidationPipe` whitelist, excepciones tipadas (`BUSINESS_RULE`, `CONFLICT`, `NOT_FOUND`), `details` campo → mensaje.
- Swagger en `/docs` (12+ tags, bearer auth, DTOs y errores documentados).

**E10-03 — Suite e2e (118 pruebas)**
`Prioridad: Must · Puntos: 8 · Estado: Hecho · Sprint: S5`
Como **equipo de desarrollo**, quiero una suite e2e que cubra el modelo real (9 líneas, árbol de causas, par producto×línea, usuarios) y no el modelo anterior, para no dar por bueno un cambio que en realidad rompió un flujo.
- 5 suites base actualizadas al modelo real (`auth`, `orders`, `downtimes`, `realtime`, `thesis`) + 2 nuevas (`catalogs-crud.e2e-spec.ts`, `users.e2e-spec.ts`).
- 118 pruebas en verde (5 + 43 + 11 + 11 + 25 + 6 + 17 por archivo).

**E10-04 — Refresh token**
`Prioridad: Should · Puntos: 5 · Estado: Pendiente · Sprint: S6`
Como **maquinista**, quiero que mi sesión se renueve sola durante el turno, para no reloguearme a mitad de un registro de parada por expiración del token.
- Hoy solo hay `accessToken` con expiración fija (`JWT_EXPIRES_IN`); no hay flujo de refresco.

**E10-05 — Auditoría de accesos y rate limiting**
`Prioridad: Should · Puntos: 5 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero un registro de quién entró, cuándo y con qué IP, y un límite de intentos de login, para detectar accesos indebidos antes de que sean un incidente.
- No existe hoy un log de accesos separado del `ultimoAcceso` sellado en `User`.
- Sin límite de tasa en `/auth/login` (expuesto a fuerza bruta).

**E10-06 — Integración continua (CI)**
`Prioridad: Should · Puntos: 5 · Estado: Pendiente · Sprint: S6`
Como **equipo de desarrollo**, quiero que cada cambio corra `typecheck`/`lint`/`build`/`test:e2e` automáticamente antes de mezclar a `main`, para no depender de que un agente o una persona recuerde correrlo a mano.
- Hoy la verificación es manual, por oleada (`pnpm --filter @mes/types build && pnpm typecheck && pnpm lint && pnpm build`).
- No hay pipeline (`GitHub Actions` u otro) configurado en el repositorio.

---

### E11 — Despliegue y operación

**E11-01 — Dockerizar `web` y `api`**
`Prioridad: Should · Puntos: 5 · Estado: Pendiente · Sprint: S6`
Como **equipo de desarrollo**, quiero imágenes Docker de `apps/web` y `apps/api`, para desplegar el sistema en cualquier entorno sin instalar Node/pnpm manualmente.
- No existen `Dockerfile` ni `docker-compose.yml` en el repositorio hoy.

**E11-02 — Variables de entorno y secretos por ambiente**
`Prioridad: Should · Puntos: 3 · Estado: Pendiente · Sprint: S6`
Como **equipo de desarrollo**, quiero `.env` diferenciados por ambiente (desarrollo/staging/producción) con secretos fuera del repositorio, para no reutilizar el `JWT_SECRET` de desarrollo en producción.
- Hoy solo hay `.env.example` de referencia para desarrollo local.

**E11-03 — Backups y monitoreo**
`Prioridad: Should · Puntos: 5 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero backups automáticos de la base de datos y alertas si el sistema cae, para no perder el histórico de producción de la planta ni enterarme de una caída por un operario que no puede registrar una parada.
- Depende de E9-07 (PostgreSQL) para backups gestionados; sobre SQLite hoy no hay estrategia de respaldo.

---

### E12 — Mejoras UX detectadas

**E12-01 — Agrupar filtro de líneas por proceso**
`Prioridad: Could · Puntos: 2 · Estado: Pendiente · Sprint: S6`
Como **supervisor de turno**, quiero que el filtro de líneas agrupe por tipo de proceso (llenadora/extrusora/moldeadora), para encontrar mi línea entre 9 opciones sin leerlas una por una.

**E12-02 — `TvRow` con código de OF y producto**
`Prioridad: Could · Puntos: 2 · Estado: Pendiente · Sprint: S6`
Como **supervisor de turno**, quiero que el Modo TV muestre el código de la orden y el producto (no solo el detalle de la alerta), para identificar qué se está produciendo sin acercarme a la pantalla.

**E12-03 — "Periodo anterior" en la tendencia OEE**
`Prioridad: Could · Puntos: 3 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero ver la serie del periodo anterior superpuesta en la tendencia OEE, para comparar visualmente sin sacar dos reportes por separado.
- Requiere un campo nuevo en el contrato de `/reportes/indicadores` (`tendenciaOee` con serie comparativa).

**E12-04 — Dropdown de rol en la encuesta pública**
`Prioridad: Could · Puntos: 1 · Estado: Pendiente · Sprint: S6`
Como **maquinista**, quiero elegir mi rol en un dropdown al responder la encuesta TSP, para no escribirlo a mano cada vez que un enlace se comparte con alguien nuevo.

**E12-05 — Unificar `paradasConservadas`**
`Prioridad: Could · Puntos: 2 · Estado: Pendiente · Sprint: S6`
Como **jefe de producción**, quiero que el número de paradas conservadas al dar de baja una causa coincida con el contador del panel, para no ver dos cifras distintas del mismo dato (histórico + vivas vs. solo histórico).

**E12-06 — Filtro `?periodo=hoy` anclado al día operativo**
`Prioridad: Should · Puntos: 3 · Estado: Hecho · Sprint: S5`
Como **supervisor de turno**, quiero que "hoy" en el filtro de órdenes respete el turno Noche (18:00–06:00, cruza medianoche), para no perder de vista la orden que empezó anoche y sigue en curso.
- **Cierre (4-sep-2026):** `GET /ordenes?periodo=hoy` usa el día operativo (antes devolvía 0 órdenes «hoy», ahora 8); timeline y tiempos de tiempo real también anclados al día operativo (`realtime.service.ts`, `AlertaLinea.generadaEn`, `TiempoRealResumen.diaOperativo`); `useResumenMaquinista` corregido en el mismo sentido. Verificado en el QA de fase 2.

**E12-07 — `LineCard`: distinguir "sin orden" de "última orden cerrada"**
`Prioridad: Could · Puntos: 2 · Estado: Pendiente · Sprint: S6`
Como **supervisor de turno**, quiero que una línea sin orden activa muestre claramente "Sin orden" en vez de los datos de la última OF cerrada, para no confundir una línea parada con una línea todavía produciendo.
- Hoy la `LineCard` en estado `sin_orden` sigue mostrando la última OF cerrada de esa línea.
- Detectado en el QA de fase 2 (4-sep-2026).

---

## 5. Resumen por sprint

| Sprint | Objetivo | Historias | Puntos | Estado |
| --- | --- | --- | --- | --- |
| **S1** | Base del shell, Design System y seguridad JWT/roles | 3 | 29 | Hecho |
| **S2** | Órdenes, captura básica (parada/IoT), responsive, validación 422 | 8 | 44 | Hecho |
| **S3** | Reportes, alertas, analítica IA (motor de reglas) | 11 | 57 | Hecho |
| **S4** | Evidencia de tesis: los 5 KPIs y su exportación | 6 | 31 | Hecho |
| **S5** | Maestros reales: 9 líneas, par producto×línea, árbol de merma, mantenedores completos, usuarios | 21 | 137 | **Hecho** |
| **S6+** | Microservicio Python, históricos reales, PostgreSQL, seguridad avanzada, despliegue, mejoras UX | 22 | 92 | Pendiente |
| **Total** | — | **71** | **390** | — |

Cierre de S5 (4-sep-2026): las 8 historias que estaban `En curso` (E2-01, E2-03, E2-04, E8-04, E8-05, E8-06, E8-08, E8-09)
se completaron, commitearon y verificaron (`pnpm typecheck` 7/7 · `pnpm lint` limpio · `pnpm build` 4/4 ·
`pnpm --filter @mes/api test:e2e` 118/118); además `E12-06` (filtro `?periodo=hoy` anclado al día operativo) se
resolvió en el mismo QA de cierre y se reclasifica de `S6+` a `S5`. Detalle completo en «QA fase 2 · maestros
reales y mantenedores (4-sep-2026)» al inicio de `docs/qa-report.md`.

### Riesgos y dependencias

- **Microservicio Python (E6-05):** sin él, la analítica IA sigue operando con reglas (`RuleBasedPredictionProvider`); el capítulo de analítica de la tesis debe dejar explícito que el modelo entrenado es un hito posterior al periodo experimental actual.
- **Calidad de los datos del dump (E9-01/E9-06/E9-11):** la extracción dedujo sabor por coincidencia de texto (sin FK en el dump original), descartó filas de prueba/duplicadas y es anterior a `tiempoEstandarMin` (queda en 0 en las 52 causas específicas); una nueva extracción de históricos (E9-06) hereda el mismo riesgo de datos sucios y debe reportar % resuelto igual que la extracción de catálogos.
- **Sabor sin relación FK (E2-03/E9-01):** `Producto.sabor` es informativo (heurística de texto); el wizard de merma usa `/sabores` como catálogo independiente, no como validación cruzada contra el producto.
- **Adopción en planta (transversal):** el diseño reduce el TRI en la medición controlada del experimento; la adopción real por 9 sedes con turnos D/N depende de capacitación que no está en este backlog (fuera del alcance de la tesis, pero condiciona si el sistema se sostiene después del periodo experimental).
- **Paridad mock↔API residual (E9-09):** el snapshot mock de `lineaEstados`, escrito a mano, difiere de la API en 3 líneas y en el turno — riesgo de demostrar un estado de planta distinto según el modo elegido hasta que se resuelva.
- **Reloj real vs. día operativo fijo en los seeds de tesis (E9-10):** mientras `thesis-seed.util.ts: hoy()` no se ancle a la misma constante `HOY` que usa el mock, una demo contra la API en una fecha distinta puede mostrar una referencia temporal distinta a la del mock (los totales de los 5 KPIs no cambian, sólo la fecha de referencia).

---

## 6. Métricas del backlog

### Por estado

| Estado | Historias | % | Puntos | % |
| --- | --- | --- | --- | --- |
| Hecho | 49 | 69,0 % | 298 | 76,4 % |
| En curso | 0 | 0 % | 0 | 0 % |
| Pendiente | 22 | 31,0 % | 92 | 23,6 % |
| **Total** | **71** | **100 %** | **390** | **100 %** |

### Por épica

| Épica | Historias | Puntos | Hecho | En curso | Pendiente |
| --- | --- | --- | --- | --- | --- |
| E1 — Shell y Design System | 3 | 26 | 3 | 0 | 0 |
| E2 — Tiempo real y captura | 7 | 45 | 6 | 0 | 1 |
| E3 — Órdenes de fabricación | 4 | 21 | 4 | 0 | 0 |
| E4 — Reportes | 5 | 28 | 4 | 0 | 1 |
| E5 — Alertas y motor de reglas | 4 | 21 | 4 | 0 | 0 |
| E6 — Analítica IA | 5 | 36 | 4 | 0 | 1 |
| E7 — Evidencia de tesis | 6 | 31 | 6 | 0 | 0 |
| E8 — Configuración y mantenedores | 10 | 54 | 9 | 0 | 1 |
| E9 — Datos maestros reales y migración | 11 | 64 | 5 | 0 | 6 |
| E10 — Backend, seguridad y calidad | 6 | 36 | 3 | 0 | 3 |
| E11 — Despliegue y operación | 3 | 13 | 0 | 0 | 3 |
| E12 — Mejoras UX detectadas | 7 | 15 | 1 | 0 | 6 |
| **Total** | **71** | **390** | **49** | **0** | **22** |

---

## 7. Trazabilidad tesis → backlog

| Funcionalidad de tesis (Anexo 05) | Historias |
| --- | --- |
| Captura de datos | E2-01 a E2-07 |
| Registro de producción | E2-01, E3-01 a E3-04 |
| Registro de paradas | E2-02, E8-01, E8-03, E8-04 |
| Registro de mermas | E2-03, E2-07, E8-02 |
| Repositorio centralizado | E9-01 a E9-05, E3-04, E10-01 a E10-03 |
| Dashboard en tiempo real | E1-01, E2-06 |
| Indicadores | E4-01 a E4-05 |
| Analítica IA | E6-01 a E6-05 |
| Alertas y predicciones | E5-01 a E5-04, E6-05, E8-07 |

| KPI de tesis | Historias que lo sustentan |
| --- | --- |
| **TRI** (1,4 min, −51,7 %) | E2-02, E2-03, E2-04 (`tiempoRegistroSeg`), E7-01 |
| **TCI** (93,3 %, 28/30) | E3-03, E7-02 |
| **TSP** (84,2 %, 128/152) | E7-03 |
| **CFS** (9/9) | E7-04 — depende del cumplimiento de las 9 funcionalidades de la tabla anterior en su conjunto |
| **EP** (83,5 %, 137/164) | E5-03, E6-03, E7-05 |

---

*Documento actualizado a partir del estado real del código en `feat/maestros-reales` (commits `2bb7f89`…`9f43e2a`,
rama íntegramente commiteada salvo este archivo) al 4-sep-2026, cierre de la fase 2 "maestros reales". Las 8
historias que quedaban `En curso` al 3-sep-2026 se completaron y verificaron (`pnpm typecheck` 7/7 · `pnpm lint`
limpio · `pnpm build` 4/4 · `pnpm --filter @mes/api test:e2e` 118/118 en 7 suites); `docs/api-contracts.md`,
`docs/implementation-summary.md` y `docs/qa-report.md` se actualizaron en la misma fase y ya no reflejan el modelo
anterior a esta fase (5 líneas + PT-01, turnos M/T/N, `/pasteurizacion` y `/personal` activos).*
