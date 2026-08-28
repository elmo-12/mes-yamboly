# Contratos de API — MES Yamboly

Prefijo de todos los endpoints: **`/api/v1`** (`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`).
Tipos compartidos: `@mes/types` (`packages/types/src`). Mocks msw equivalentes: `apps/web/src/mocks/handlers`.

## Convenciones

| Tema | Regla |
| --- | --- |
| Colecciones paginadas | `{ data: T[], meta: { page, pageSize, total, totalPages } }` (`Paginated<T>`) |
| Colecciones no paginadas | `{ data: T[] }` (catálogos, subrecursos de una orden) |
| Errores | `{ statusCode, code, message, details? }` (`ApiError`) |
| Códigos de error | `VALIDATION_ERROR` 422 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `INTERNAL_ERROR` 500 |
| Detalle de validación | `details` es un mapa **campo → mensaje** (`{ "cantidadKg": "La cantidad debe ser mayor que 0" }`); las vistas lo pintan bajo cada campo con `aplicarErroresApi` |
| POST de acción | Los `POST` que **no crean** un recurso (atender/descartar/confirmar una alerta, activar una versión, finalizar) responden **200**; sólo las altas reales responden 201 y los trabajos encolados 202 |
| Autenticación | `Authorization: Bearer <accessToken>` en todo salvo `POST /auth/login` y `/encuesta/:token` |
| Paginación | `?page=1&pageSize=25` (máx. 200) |
| Filtros múltiples | clave repetida (`?lineaId=LIN-01&lineaId=LIN-02`) o separada por comas |
| Periodos | `?periodo=hoy\|semana\|mes\|trimestre\|personalizado`; con `personalizado` se envían `desde`/`hasta` (`YYYY-MM-DD`) |
| Fechas | ISO-8601: `YYYY-MM-DD` para fechas, `YYYY-MM-DDTHH:mm:ss` para marcas de tiempo |
| Errores simulables (solo mock) | `?__error=500\|401\|403\|404\|409\|422\|empty` o cabecera `x-mock-error` |

---

## auth

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/auth/login` | POST | `LoginRequest { email, password, recordarme? }` — `email` acepta correo o DNI | `LoginResponse { accessToken, user }` | 401 credenciales inválidas · 422 validación |
| `/auth/me` | GET | — | `User` (incluye `ultimoAcceso`, sellado en cada login) | 401 sin token o token inválido |
| `/auth/logout` | POST | — | `204 No Content` | 401 |

### Usuarios seed (contraseña `Yamboly2026` en todos)

| Correo | Nombre | Rol | Notas |
| --- | --- | --- | --- |
| `jefe@yamboly.lat` | Carlos Mendoza | `jefe` | Jefe de producción (Home 02.C) |
| `jorge.quispe@yamboly.lat` | Jorge Quispe | `maquinista` | Maquinista L2 Conos (OF-2026-0815) |
| `ana.rios@yamboly.lat` | Ana Ríos | `supervisor` | Supervisora de turno |
| `maria.torres@yamboly.lat` | María Torres | `mermas` | Encargada de merma |
| `investigador@yamboly.lat` | Investigador Tesis | `investigador` | Solo módulo Evidencia |
| `rosa.huaman@yamboly.lat` | Rosa Huamán | `calidad` | Analista de calidad |
| `luis.vargas@yamboly.lat` · `sofia.cardenas@yamboly.lat` · `pedro.ccahuana@yamboly.lat` · `elena.ramos@yamboly.lat` | — | `maquinista` | L1, L3, L4, L5 |
| `diego.salazar@yamboly.lat` | Diego Salazar | `supervisor` | Turno Tarde |

---

## catalogs

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/sedes` | GET | — | `{ data: Sede[] }` | 401 |
| `/turnos` | GET | — | `{ data: TurnoDef[] }` | 401 |
| `/lineas` | GET | `sedeId?` | `{ data: Linea[] }` — L1 Paletas … L5 Bombones + PT-01 | 401 |
| `/productos` | GET | `lineaId?` | `{ data: Producto[] }` con `velocidadEstandar` | 401 |
| `/productos/:id` | PATCH | `{ velocidadEstandar?, estado? }` | `Producto` — Configuración → Productos y velocidades (10.C) | 404 · 422 fuera de 1–1 000 u/min |
| `/maquinas` | GET | `lineaId?`, `estado?` | `{ data: Maquina[] }` con `paradas30d` | 401 |
| `/maquinas` | POST | `MaquinaInput { codigo, nombre, tipo, lineaId, estado }` | `Maquina` (201) | 409 código duplicado · 422 |
| `/maquinas/:id` | PATCH | `Partial<MaquinaInput>` | `Maquina` | 404 · 422 |
| `/causas-parada` | GET | `formato=arbol\|plano` (def. `arbol`), `nivel?`, `lineaId?` | `{ data: CausaParadaNodo[] }` (árbol Tipo → General → Específica) o `{ data: CausaParada[] }` | 401 |
| `/causas-parada` | POST | `CausaParadaInput` | `CausaParada` (201) | 409 código duplicado · 422 |
| `/causas-parada/:id` | PATCH | `Partial<CausaParadaInput>` | `CausaParada` | 404 · 422 |
| `/causas-parada/:id` | DELETE | — | `{ id, codigo, estado: 'inactivo', paradasConservadas, mensaje }` | 404 |
| `/causas-merma` | GET | `tipo?=MP\|EP\|PT` | `{ data: CausaMerma[] }` — MR-01…MR-04 | 401 |
| `/usuarios` | GET | `rol[]`, `sedeId?`, `lineaId?` | `{ data: User[] }` — personas para los selectores de captura (responsable, maquinista, supervisor). **Sin restricción de rol**: lo consumen tanto Configuración como los wizards de captura. `lineaId` incluye además a los usuarios sin línea (jefe, supervisores, calidad) | 401 |
| `/colaboradores` | GET | — | `{ data: Colaborador[] }` — cuadrilla del turno del paso "Equipo" de la OF. Añadido por V2 | 401 |

> **Baja de causas (spec 10.D):** la causa nunca se borra físicamente. `DELETE` la marca `estado: 'inactivo'` y devuelve `paradasConservadas` para el modal Danger («Hay 14 paradas históricas con esta causa; se conservarán con el código»).

---

## orders

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/ordenes` | GET | `periodo`, `desde`, `hasta`, `lineaId[]`, `turno[]`, `estado[]`, `search`, `sort=fecha\|codigo\|oee\|producido`, `orden=asc\|desc`, `page`, `pageSize` | `Paginated<OrdenListItem>` | 401 |
| `/ordenes/resumen` | GET | — | `OrdenesResumen { todas, porValidar, conParadas, conMermas, ultimaSincronizacion }` | 401 |
| `/ordenes/:id` | GET | acepta id (`ORD-0815`) o código (`OF-2026-0815`) | `OrdenListItem` | 404 |
| `/ordenes` | POST | `CreateOrden { codigo, lineaId, productoId, lote, vencimiento, turno, planificado, maquinistaId, supervisorId, operarios, colaboradorIds[] }` | `OrdenListItem` (201) | 409 código duplicado · 422 |
| `/ordenes/:id/finalizar` | POST | `FinalizeOrden { producido, conteoCodificadora, evidenciaUrl?, comentario? }` | `OrdenListItem` (estado → `por_validar`) | 404 · 409 ya finalizada · 422 |
| `/ordenes/:id/validar` | POST | `ValidateOrden { produccionRegistrada, paradasConCausa, mermasClasificadas, evidenciaEtiqueta, observacion? }` (los 4 booleanos deben ser `true`) | `OrdenListItem` (estado → `validada`) | 404 · 409 en curso o ya validada · 422 |
| `/ordenes/:id/paradas` | GET | — | `{ data: ParadaListItem[], resumen: { cantidad, minutos, afectanOee } }` | 404 |
| `/ordenes/:id/mermas` | GET | — | `{ data: MermaListItem[], resumen: { cantidad, kg } }` | 404 |
| `/ordenes/:id/velocidades` | GET | — | `{ data: RegistroVelocidadListItem[] }` | 404 |
| `/ordenes/:id/bitacora` | GET | `tipo[]` (`creacion\|edicion\|parada\|merma\|velocidad\|validacion\|sistema`) | `{ data: AuditEvent[] }` desc por fecha | 404 |

**Estados de orden:** `en_curso` · `cerrada` · `por_validar` · `validada` · `incompleta`.

---

## downtimes

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/paradas` | GET | `ordenId?`, `lineaId[]`, `causaId[]`, `desde`, `hasta`, `abiertas=true`, `page`, `pageSize` | `Paginated<ParadaListItem>` | 401 |
| `/paradas` | POST | `CreateParada { ordenId, lineaId, maquinaId, tipoCausaId, causaId, inicio, accionTomada*, numeroSolicitud?, evidenciaUrl?, afectaOee, responsableId, origen, deteccionId?, tiempoRegistroSeg }` | `ParadaListItem` (201) | 422 `accionTomada` obligatoria · 422 `numeroSolicitud` si la causa lo exige · 422 causa inválida |
| `/paradas/:id` | PATCH | `UpdateParada` (+ `fin?: string \| null`, `motivoEdicion?`) | `ParadaListItem`; el cambio de causa y el de hora de fin se escriben en la bitácora. `fin` recalcula `duracionMin`; `fin: null` reabre la parada (spec 05.F) | 404 · 422 |
| `/paradas/:id/finalizar` | POST | `FinalizeParada { fin, comentarioCierre? }` | `ParadaListItem` con `duracionMin` | 404 · 409 ya finalizada |
| `/detecciones-iot` | GET | `estado=sugerida\|confirmada\|descartada` | `{ data: DeteccionIoT[] }` | 401 |
| `/detecciones-iot/:id/confirmar` | POST | `{ causaId, maquinaId, accionTomada, tiempoRegistroSeg }` | `{ deteccion, parada }` (201) | 404 · 409 ya procesada · 422 |
| `/detecciones-iot/:id/descartar` | POST | — | `DeteccionIoT` (`estado: 'descartada'`) | 404 |

`tiempoRegistroSeg` alimenta el KPI **TRI**: cada parada, merma o velocidad creada añade una fila al Anexo 02 (postest).

---

## scrap

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/mermas` | GET | `ordenId?`, `lineaId[]`, `tipo[]`, `causaId[]`, `desde`, `hasta`, `page`, `pageSize` | `Paginated<MermaListItem>` | 401 |
| `/mermas` | POST | `CreateMerma { ordenId, lineaId, tipo (MP\|EP\|PT), cantidadKg, sabor, causaId, responsableId, codigoBalde?, enviarPasteurizacion, observacion?, tiempoRegistroSeg }` | `MermaListItem` (201) | 422 cantidad ≤ 0 · 422 causa inválida |
| `/mermas/:id` | PATCH | `UpdateMerma` | `MermaListItem` | 404 · 422 |

---

## speeds

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/velocidades` | GET | `ordenId?`, `lineaId[]`, `page`, `pageSize` | `Paginated<RegistroVelocidadListItem>` | 401 |
| `/velocidades` | POST | `CreateVelocidad { ordenId, lineaId, velocidadReal, motivo?, responsableId, tiempoRegistroSeg }` | `RegistroVelocidadListItem` con `desvioPct` calculado (201) | 422 velocidad ≤ 0 |

---

## realtime

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/tiempo-real/lineas` | GET | `sedeId?`, `lineaId[]`, `estado[]` (`produciendo\|parada\|sin_orden\|alerta\|sugerida`) | `TiempoRealResumen { actualizadoEn, turno, turnoLabel, turnoRango, sedeId, lineas: LineaEstado[] }` | 401 |
| `/tiempo-real/lineas/:id/timeline` | GET | — | `LineaTimeline { lineaId, lineaCodigo, lineaNombre, ordenCodigo?, eventos: TimelineEvento[] }` | 404 |
| `/tiempo-real/tv` | GET | — | `TvResumen { actualizadoEn, turnoLabel, filas: TvRow[] }` | 401 |
| `/tiempo-real/stream` | GET (SSE) | `token?` | `text/event-stream`, eventos `estado` con `RealtimeStreamEvent`. `EventSource` no admite cabeceras: **sólo esta ruta** acepta el JWT por query (`?token=…`); cualquier otra lo ignora | 401 |

---

## reports

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/reportes/indicadores` | GET | `periodo`, `desde`, `hasta`, `lineaId[]`, `turno[]`, `comparar=periodo_anterior\|anio_anterior` | `IndicadoresResumen { kpis, tendenciaOee, oeePorLinea, comparativaTurno }` | 401 |
| `/reportes/paradas` | GET | idem | `ParadasResumen { kpis, pareto, donut, detallePorCausa }` | 401 |
| `/reportes/mermas` | GET | idem | `MermasResumen { kpis, apiladasPorLinea, heatmap, tabla }` | 401 |
| `/reportes/exportar` | POST | `ExportRequest { datasets[], formato (xlsx\|csv\|pdf), desde, hasta, lineaId? }` | `ExportJob` `estado: 'generando'` (202) | 422 sin datasets |
| `/reportes/exportaciones` | GET | — | `{ data: ExportJob[] }` (historial, `listo` / `generando`). `url` es la ruta **relativa al prefijo del API** (`/reportes/exportaciones/:id/descargar`) y sólo aparece si el archivo se puede servir | 401 |
| `/reportes/exportaciones/:id/descargar` | GET | — | binario (`Content-Disposition: attachment`). Requiere `Authorization`, así que el frontend lo pide con `fetch` y lo guarda desde un blob (`descargarArchivo`), no con `<a download>` | 404 sin archivo |

Datasets válidos: `ordenes`, `paradas`, `mermas`, `velocidades`, `indicadores`, `alertas`, `evidencia`.

---

## alerts

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/alertas` | GET | `tipo[]`, `severidad[]`, `lineaId[]`, `estado[]`, `search`, `desde`, `hasta`, `page`, `pageSize` | `Paginated<Alerta>` | 401 |
| `/alertas/resumen` | GET | — | `AlertasResumen { activas, atendidasHoy, pendientesConfirmar, vencidas, epAcumulada }` | 401 |
| `/alertas/recientes` | GET | `limit` (def. 3) | `{ data: Alerta[] }` — popover de la campana (07.E) | 401 |
| `/alertas/:id` | GET | — | `Alerta` con `factores[]` | 404 |
| `/alertas/:id/atender` | POST | `AtenderAlerta { accionTomada }` (mín. 10 caracteres) | `{ alerta, resumen }` | 404 · 409 ya confirmada · 422 |
| `/alertas/:id/descartar` | POST | `DescartarAlerta { motivo }` | `{ alerta, resumen }` | 404 · 422 |
| `/alertas/:id/confirmar` | POST | `ConfirmarEvento { ocurrio, observacion? }` | `{ alerta, resumen, ep: number }` — `ep` es la EP acumulada en % | 404 · 409 ya confirmada · 422 |
| `/alertas/confirmar-lote` | POST | `{ confirmaciones: [{ alertaId, ocurrio, observacion? }] }` | `{ data: Alerta[], resumen, ep: number }` | 422 lista vacía |
| `/alertas/umbrales` | GET | — | `Umbrales` | 401 |
| `/alertas/umbrales` | PUT | `Umbrales { velocidadBajoEstandarPct, oeeMinimo, probabilidadMinima, notificarN8n, mostrarTv }` | `Umbrales` | 403 solo `jefe` · 422 |

**Tipos:** `parada_prevista` · `merma_prevista` · `velocidad_baja` · `oee_bajo`.
**Severidades:** `critica` · `alta` · `media`. **Estados:** `activa` · `atendida` · `vencida` · `confirmada` · `descartada`.

---

## analytics

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/analitica/resumen` | GET | — | `AnaliticaResumen { modelo, kpis { ep, precision, recall, alertas30d }, insights, riesgoPorLinea, prediccionesActivas }` | 401 |
| `/analitica/patrones` | GET | `periodo?`, `lineaId[]`, `variable?` | `Patrones { heatmap (causa × turno, minutos), recurrencias }` | 401 |
| `/analitica/predicciones` | GET | — | `Predicciones { serie (predicho vs real 30 d), historico }` | 401 |
| `/analitica/modelo` | GET | — | `Modelo { fasesCrispDm[6], metricas, versiones, variablesEntrada }` | 401 |
| `/analitica/estado-datos` | GET | `estado?=suficiente\|insuficiente` | `EstadoDatos { suficiente, eventos, requeridos, progresoPct, estimacion }`. Sin query devuelve el estado calculado (la planta sembrada tiene 2 140 eventos → `suficiente`); con `estado` se fuerza la variante para revisar el estado vacío de 08.E | 401 |
| `/analitica/reentrenar` | POST | — | `ReentrenamientoJob` (202) | 403 solo `jefe`/`investigador` |
| `/analitica/modelo/:version/activar` | POST | — | `Modelo` con la versión marcada `vigente` | 404 versión inexistente |

---

## evidence

| Endpoint | Método | Query / Body | Response | Errores |
| --- | --- | --- | --- | --- |
| `/evidencia/resumen` | GET | — | `EvidenciaResumen { pretestDesde…postestHasta, kpis: KpiTesis[5], comparativaTri }` | 401 |
| `/evidencia/tri` | GET | — | `EvidenciaTRI { postest, pretest, promedioPostest, promedioPretest, reduccionPct, meta, estado }` | 401 |
| `/evidencia/tri/pretest` | POST | `{ registros: [{ fecha, eventoRegistrado, horaInicioRegistro, tiempoMin }] }` (carga de hoja) | `{ data, promedioPretest }` (201) | 422 lista vacía |
| `/evidencia/tci` | GET | — | `EvidenciaTCI { registros, registrosCorrectos, registrosTotales, porcentaje, meta, estado }` | 401 |
| `/evidencia/tsp` | GET | — | `EncuestaTSP { items[8], respuestas, invitados, promedio, pctAcuerdo, meta, estado, enlace }` | 401 |
| `/evidencia/cfs` | GET | — | `EvidenciaCFS { items[9], cumplidas, totales, porcentaje, meta, estado }` | 401 |
| `/evidencia/cfs/:id` | PATCH | `{ cumple, observacion }` | `{ item, resumen }` | 404 · 422 |
| `/evidencia/ep` | GET | — | `EvidenciaEP { registros, prediccionesCorrectas, prediccionesTotales, porcentaje, meta, estado }` | 401 |
| `/evidencia/exportar` | POST | `ExportEvidencia { kpis[], formato, destino (spss\|informe) }` | `{ id, estado: 'generando' }` (202) | 422 |
| `/encuesta/:token` | GET **público** | — | `EncuestaPublica { token, titulo, descripcion, items[8], respondida }` | 404 token inválido |
| `/encuesta/:token` | POST **público** | `EncuestaRespuesta { token, respuestas: number[8] (1–5), comentario? }` | `{ recibido, respuestas, pctAcuerdo }` (201) — recalcula TSP | 404 · 422 respuestas fuera de rango |

### KPI de la tesis y sus fórmulas

| KPI | Fórmula | Meta | Valor del mock | Anexo |
| --- | --- | --- | --- | --- |
| TRI | `ΣTR / n` | reducción ≥ 40 % vs pretest | 1,4 min (−51,7 % vs 2,9 min) | 02 |
| TCI | `RC / RT × 100` | ≥ 90 % | 93,3 % (28/30) | 03 |
| TSP | `PO / PT × 100` | ≥ 80 % de acuerdo | 84,2 % (128/152, 19 respuestas) | 04 |
| CFS | `FV / FT × 100` | 9 / 9 | 100 % | 05 |
| EP | `PCC / PTG × 100` | ≥ 80 % | 83,5 % (137/164) | 06 |

---

## Notas de implementación del mock

- **`/ordenes/resumen.todas` devuelve 1 248** (total histórico del repositorio, spec 05.A) mientras que `meta.total` de `/ordenes` refleja las 60 órdenes cargadas en el dataset. La UI debe usar `resumen` para las summary cards y el subtítulo del header, y `meta` para el pie de la tabla.
- `porValidar: 12`, `conParadas: 37`, `conMermas: 21` sí se calculan sobre el dataset y coinciden con la spec.
- El Home (spec 02.C) declara `TRI −48 % vs pretest` y Evidencia (spec 09.A) `−52 %`. Ambos textos se reproducen tal cual: el Home usa el valor fijo de `homeKpisSecundarios`, Evidencia el calculado sobre los 10 registros del Anexo 02.
- El brief sitúa a Jorge Quispe como maquinista de **L2 Conos** (coherente con OF-2026-0815); la spec 02.D lo muestra en L1. Se siguió el brief.
