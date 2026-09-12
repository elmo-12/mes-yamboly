# Plan — Módulo de IA / analítica real para `/analitica`

> Estado del documento: **propuesta de implementación** (no implementado).
> Origen: la vista `/analitica` hoy sirve datos sembrados; este plan la reconstruye sobre los
> datos reales que deja `apps/api/scripts/sincronizar-produccion.ts`.

## 1. Diagnóstico: qué es real y qué es inventado hoy

| Pieza de la UI | Fuente actual | Real / Inventado |
| --- | --- | --- |
| KPI `ep` | `registro_ep` vía `calcEp` — `analytics.service.ts:357` | **Real** (0 % porque nadie ha confirmado alertas todavía) |
| KPI `precision`, `recall`, `alertas30d` | columnas de `modelo_version` sembradas — `thesis-analytics.seed.ts:9` | Inventado (81 / 77 / 142) |
| "Hallazgos del modelo" | constante `INSIGHTS` — `analytics.constants.ts:7` | Inventado |
| "Riesgo de parada por línea" | constante `RIESGO_POR_LINEA` — `analytics.constants.ts:32` | Inventado |
| Heatmap causa × turno | `parada_agregada.minutosPorTurno` sembrado — `thesis-reports.seed.ts:213` | Inventado (deriva de `CAUSAS_PARADA`, no de `parada`) |
| "Recurrencias detectadas" | constante `RECURRENCIAS` — `analytics.constants.ts:40` | Inventado |
| Serie predicho vs real | `indicador_diario.prediccionesPredichas/Reales` con `rng(606)` — `thesis-reports.seed.ts:158` | Inventado |
| Histórico de predicciones | 24 filas `PRD-HIS-*` con `rng(707)` — `thesis-analytics.seed.ts:31` | Inventado |
| Variables de entrada (importancia) | constante `VARIABLES_ENTRADA` — `analytics.constants.ts:52` | Inventado |
| Fases CRISP-DM | `FASES_DESCRIPCION` — `analytics.constants.ts:83` | Texto correcto, métricas inventadas |
| `estado-datos` | `EVENTOS_MIGRADOS = 2130` + conteo de `registro_tiempo` — `analytics.service.ts:233` | Semi-inventado |
| "Reentrenar" | `setTimeout(3000)` + incremento determinista de AUC — `analytics.service.ts:261` | Simulado |
| `prediccionesActivas` | alertas con `estado='activa'` — `analytics.service.ts:74` | Real en forma, pero las alertas vienen del seed |

**Hallazgo crítico**: `AlertsEngineService.evaluar()` (`apps/api/src/modules/alerts/alerts-engine.service.ts:54`)
**nunca se invoca desde ningún punto del código** (sólo se registra en `alerts.module.ts:24`). El motor de
alertas y su `PredictionProvider` existen y funcionan, pero no hay nada que los dispare: todas las alertas
de la bandeja vienen de `thesis-alerts.seed.ts`. El texto de la UI "se recalculan cada 15 minutos"
(`ResumenTab.tsx:124`) no corresponde a ningún proceso. Este plan convierte esa frase en verdad.

**Segundo hallazgo**: no existe `@nestjs/schedule` en `apps/api/package.json`; hay que añadirlo (es la única
dependencia nueva obligatoria del plan en el lado Nest).

---

## 2. Alcance y casos de uso priorizados

Criterio de priorización: **no rediseñar el frontend**. Los cuatro contratos de
`packages/types/src/analytics.ts` se conservan; sólo se añaden campos opcionales (aditivos) donde la UI
hoy quema valores.

| # | Caso de uso | Pestaña que llena | Contrato | Prioridad |
| --- | --- | --- | --- | --- |
| CU-1 | **Riesgo de parada por línea × turno siguiente** | Resumen (`RiesgoPorLineaChart`) | `RiesgoLinea[]` | Must |
| CU-2 | **Predicciones activas recalculadas cada 15 min** → alertas reales | Resumen + `/alertas` | `PrediccionActiva[]` + `Alerta` | Must |
| CU-3 | **Heatmap causa × turno calculado sobre `parada`** | Patrones | `HeatmapCelda[]` | Must |
| CU-4 | **Patrones recurrentes (reglas asociativas) sobre paradas y mermas** | Patrones + Resumen (insights) | `Recurrencia[]`, `InsightCard[]` | Must |
| CU-5 | **Backtest predicho vs real y matriz de confusión** | Predicciones + Modelo | `Predicciones`, `MetricasModelo` | Must |
| CU-6 | **EP (KPI de tesis) desde confirmaciones humanas** | Resumen (KPI EP) | `kpis.ep` | Must (ya existe; se alimenta al haber alertas reales) |
| CU-7 | **Reentrenamiento real desde el botón "Reentrenar"** | Modelo | `ReentrenamientoJob` | Must |
| CU-8 | **Predicción de merma por turno (kg y sobre-estándar)** | Resumen (insights) + alertas `merma_prevista` | `InsightCard`, `Alerta` | Should |
| CU-9 | **Importancia de variables real** | Modelo | `VariableEntrada[]` | Should |
| CU-10 | **Modelo gradient boosting en microservicio Python** | transversal | contrato `PythonHttpPredictionProvider` | Could (E6-05) |

### Campos aditivos propuestos en `packages/types/src/analytics.ts`

Todos opcionales; el frontend actual sigue compilando sin tocarse.

```
InsightCard      + confianza?: number      // hoy quemada en ResumenTab.tsx:50 (CONFIANZAS)
AnaliticaResumen.kpis + epDelta?, precisionDelta?, recallDelta?, alertas30dDelta?
                                           // hoy quemados en ResumenTab.tsx:73/81/89/96
RiesgoLinea      + probabilidadCausa?: number, ventana?: string
MetricasModelo   + vp?, fp?, vn?, fn?, corteEntrenamiento?, corteValidacion?
Predicciones     + matrizConfusion?: { vp, fp, vn, fn }
```

Segunda pasada de frontend (opcional, fase F5): reemplazar `CONFIANZAS` y los `delta` fijos por los campos
reales, y el subtítulo "…a partir de 14 variables de proceso" (`RiesgoPorLineaChart.tsx:36`) y
"…2 140 eventos registrados" (`PatronesTab.tsx:103`) por valores inyectados.

---

## 3. CRISP-DM: qué se hace en cada fase, en este repo

La tesis exige la metodología explícita; aquí cada fase tiene un artefacto verificable dentro del
monorepo, no sólo prosa.

| Fase | Qué se hace | Dónde vive el artefacto |
| --- | --- | --- |
| **1. Comprensión del negocio** | Objetivo: anticipar paradas imprevistas que afectan OEE y mermas sobre estándar en las 9 líneas, con ≥ 80 % de EP (meta de tesis). Se define qué decisión cambia: el supervisor interviene la línea antes del turno. | `docs/plan-modulo-ia-analitica.md` (este doc) + `FASES_DESCRIPCION` en `analytics.constants.ts:84` (se conserva el texto, se sustituyen las métricas) |
| **2. Comprensión de los datos** | Perfilado automático del corpus sincronizado: conteos por tabla, rango de fechas, % de nulos por columna, distribución de `causaId`/`tipoCausaId`, tasa de positivos del target, paradas sin categorizar, órdenes sin `velocidadEstandar`. Se ejecuta y se persiste, no se redacta a mano. | nuevo `apps/api/scripts/perfilar-datos-analitica.ts` + tabla `perfil_datos` (o JSON en `modelo_version.perfil`) |
| **3. Preparación de los datos** | Construcción del *feature store* (§4): una fila por `línea × día operativo × turno`, con el target y ~20 features. Imputación, codificación de causas, ventanas temporales. | nuevo `DatasetBuilderService` en `apps/api/src/modules/analytics/dataset/` + entidad `muestra_analitica` |
| **4. Modelado** | Entrenamiento de la línea base (regresión logística con descenso de gradiente en TypeScript) y, si `PREDICTION_SERVICE_URL` está configurada, del modelo superior (HistGradientBoosting en Python). Hiperparámetros y pesos se persisten. | nuevo `EntrenamientoService` + `modelo_version.coeficientes` / `services/prediccion-py/` |
| **5. Evaluación** | Validación **temporal** (corte por fecha, nunca aleatoria), matriz de confusión, precisión, recall, F1, AUC, calibración; backtest día a día que llena la serie predicho vs real. | nuevo `EvaluacionService` + `modelo_version` (métricas) + `prediccion` (backtest) |
| **6. Despliegue** | Scheduler cada 15 min que puntúa las 9 líneas, escribe `prediccion` y dispara `AlertsEngineService.evaluar()`; botón "Reentrenar" real; `/alertas` confirma y alimenta EP. | nuevo `InferenciaSchedulerService` + `analytics.service.ts` (reentrenar real) |

Las 6 fases dejan de ser texto estático: `GET /analitica/modelo` devolverá `estado` por fase derivado de
hechos (`¿hay perfil?`, `¿hay muestras?`, `¿hay versión entrenada?`, `¿hay métricas de test?`,
`¿hay scheduler activo?`).

---

## 4. Ingeniería de características

### 4.1 Grano y target

**Grano de la unidad de análisis**: `(lineaId, fechaOperativa, turno)`.
Volumen esperado con 30 días: 9 líneas × 2 turnos × 30 días ≈ **540 filas** (menos las combinaciones sin
orden). Este número manda sobre toda la elección de modelo (§5).

**Target primario (CU-1, clasificación binaria)** — `huboParadaImprevista`:

```
∃ parada p con p.ordenId ∈ órdenes del (linea, fecha, turno)
   AND p.afectaOee = true
   AND causa_parada[p.tipoCausaId].clasificacion = 'imprevista'
   AND p.duracionMin >= UMBRAL_MIN            -- por defecto 10 min
```

Se usa `parada.afectaOee` (columna real, `parada.entity.ts:47`) y `causa_parada.clasificacion`
(`causa-parada.entity.ts:24`) para excluir rutinarias/programadas (CIP, refrigerio, cambio de formato
planificado), que de otro modo harían el target trivialmente positivo.

**Target secundario (CU-8, clasificación binaria)** — `mermaSobreEstandar`:

```
SUM(merma.cantidadKg del turno) / producido_kg_equivalente
      > producto_linea.mermaEstandarPct        (velocidad-estandar.entity.ts:41)
```

Fallback cuando el par no define `mermaEstandarPct`: percentil 75 histórico del par `productoId × lineaId`.

### 4.2 Features (columnas reales, nombres en español)

| Grupo | Feature | Derivación (columnas reales) |
| --- | --- | --- |
| Calendario | `diaSemana` (0–6), `esFinDeSemana`, `diaDelMes` | `orden_fabricacion.fecha` |
| Contexto | `turnoEsNoche` | `orden_fabricacion.turno` = `'N'` (turnos reales D 06–18 / N 18–06, `packages/shared/src/dates.ts:4`) |
| Contexto | `lineaId` (one-hot, 9) | `orden_fabricacion.lineaId` |
| Contexto | `familiaProducto` (one-hot agrupada) | `orden_fabricacion.productoId` → `producto` (201 productos ⇒ **agrupar por familia/sabor**, nunca one-hot de 201) |
| Contexto | `nOrdenesTurno`, `nCambiosProducto` | `COUNT/DISTINCT` de `orden_fabricacion` del turno |
| Plan | `planificadoUnid`, `ratioPlanCapacidad` | `orden_fabricacion.planificado` / (`velocidadEstandar` × min. del turno) |
| Velocidad | `velocidadEstandarUnidMin` | `orden_fabricacion.velocidadEstandar` (congelada) |
| Velocidad | `velocidadRealUnidMin` | `producido / minutos operativos` (`inicio`→`fin`, menos `SUM(parada.duracionMin)` con `afectaOee`) |
| Velocidad | `desvioVelocidadPct` | `calcDesvioVelocidad` de `packages/shared/src/oee.ts:77` |
| OEE | `oeeDisponibilidad`, `oeeRendimiento`, `oeeCalidad`, `oeeTotal` | `orden_fabricacion.oee` (JSON `OeeDetalle`) |
| Histórico corto | `paradasImprev7d`, `minParadasImprev7d` | `parada` de la línea en los 7 días previos (excluye el turno actual: **evita fuga de datos**) |
| Histórico largo | `paradasImprev30d`, `minParadasImprev30d`, `mtbfAprox` | ídem 30 días |
| Histórico por causa | `topCausa7d` (tipoCausaId modal), `rachaSinParada` (turnos consecutivos sin parada imprevista) | `parada.tipoCausaId`, `parada.inicio` |
| Merma | `mermaKg7d`, `mermaKgTurnoPrevio`, `mermaPctVsEstandar` | `merma.cantidadKg` + `producto_linea.mermaEstandarPct` |
| Merma | `mermaPasteurizacionPct` | `merma.enviarPasteurizacion` |
| Arranque / CIP | `esArranqueLinea` (primera orden tras ≥ 1 turno inactivo), `minCipPrevistos`, `minArranquePrevistos` | `producto_linea.cipMin`, `producto_linea.arranqueMin` (`velocidad-estandar.entity.ts:44,47`) |
| Personas | `maquinistaExpTurnos` (nº de turnos previos del maquinista en esa línea), `cambioDeMaquinista` | `orden_fabricacion.maquinistaId`, `supervisorId` |
| Calidad del dato | `pctParadasSinCategorizar` | paradas cuyo `causaId` cae en el nodo genérico/desconocido |

**Regla anti-fuga (crítica)**: toda feature con sufijo `7d`/`30d`/`Previo` se calcula con **corte estricto
antes del inicio del turno objetivo**. Las features del propio turno (`oee*`, `velocidadReal*`, `producido`)
**sólo** pueden usarse en el modo *evaluación retrospectiva*; para la predicción del **turno siguiente** se
sustituyen por los valores del turno anterior (`*TurnoPrevio`). El `DatasetBuilderService` genera por tanto
dos vistas:

- `muestra_analitica.modo = 'retro'` — todo disponible, para evaluar el techo del modelo.
- `muestra_analitica.modo = 'anticipado'` — sólo lo conocido antes del turno, **es el que se despliega**.

### 4.3 Materialización

Entidad nueva `muestra_analitica` (`apps/api/src/database/entities/muestra-analitica.entity.ts`), una fila
por `lineaId × fecha × turno × modo`, con `features` en `simple-json` + columnas escalares para los targets.
Se reconstruye completa en cada reentrenamiento (540 filas: reconstruir es más barato que mantener
incrementalmente).

---

## 5. Elección de modelos

### 5.1 Por qué no gradient boosting como paso 1

Con ~540 muestras y ~25 features, un GBM sobreajusta y no aporta sobre un modelo lineal bien regularizado.
Además, `PREDICTION_SERVICE_URL` puede estar vacía (`apps/api/.env.example:23`) y **el sistema debe seguir
funcionando** — hoy eso lo garantiza `PythonHttpPredictionProvider` cayendo en reglas
(`python-http.provider.ts:47`).

### 5.2 Cascada de tres niveles (sin cambiar el contrato `PredictionProvider`)

| Nivel | Proveedor | Cuándo actúa | Estado |
| --- | --- | --- | --- |
| 1 | `PythonHttpPredictionProvider` | `PREDICTION_SERVICE_URL` definida y responde en `PREDICTION_TIMEOUT_MS` | Existe (`python-http.provider.ts`), se conserva |
| 2 | **`ModeloLocalPredictionProvider` (nuevo)** | Hay una `modelo_version` con `estado='vigente'` y `coeficientes` no vacíos | **A construir** |
| 3 | `RuleBasedPredictionProvider` | Arranque en frío: sin datos o sin modelo entrenado | Existe (`rule-based.provider.ts:23`), se conserva intacto |

Se añade un `PrediccionCascadaProvider` que implementa la misma interfaz `PredictionProvider`
(`prediction/prediction.provider.ts:33`) y encadena 1 → 2 → 3. **Cero cambios en `AlertsEngineService`**:
sigue inyectando `PREDICTION_PROVIDER`.

### 5.3 Nivel 2 — el modelo entrenado en TypeScript

**Algoritmo: regresión logística con regularización L2**, entrenada por descenso de gradiente por lotes
(~200 iteraciones sobre 540 filas: milisegundos, sin dependencias nuevas).

Justificación para la tesis:

- Es un modelo *entrenado con datos reales*, no heurístico: satisface E6-05 parcialmente sin microservicio.
- Coeficientes interpretables → alimentan directamente `VariableEntrada[]` (importancia = |coef.
  estandarizado| normalizado 0–100) y `FactorAlerta[]` (contribución = `coef_i × x_i` normalizada), que es lo
  que la UI ya pinta en el detalle de alerta.
- Robusto con n pequeño y clases desbalanceadas (se aplica `class_weight` por ponderación inversa de
  frecuencia).
- Serializable: los pesos caben en un `simple-json` de `modelo_version`, así que "activar versión v3.2"
  (`analytics.service.ts:314`) pasa a significar *cargar esos pesos*, que es exactamente lo que la UI promete.

Complemento no paramétrico para causa probable: **tabla de frecuencias con suavizado de Laplace**
`P(tipoCausaId | linea, turno, diaSemana)` → llena `RiesgoLinea.causaProbable` con la causa real más
probable (hoy es literal en `analytics.constants.ts:33`).

### 5.4 Nivel 1 — microservicio Python (E6-05, fase posterior)

`services/prediccion-py/` (FastAPI + scikit-learn). Contrato ya fijado por `PythonHttpPredictionProvider`:
`POST /predict` recibe `PredictionContext` y devuelve `{ probabilidad, factores[] }`. Se añade
`POST /entrenar` (recibe el dataset exportado por la API o lee la misma Postgres) y `GET /salud`.
Modelos: `HistGradientBoostingClassifier` para el target primario y `HistGradientBoostingRegressor` para kg
de merma, con `TimeSeriesSplit`. Explicabilidad con SHAP → se mapea a `factores[]` sin tocar el frontend.
**Requisito de aceptación**: apagar el servicio (`PREDICTION_SERVICE_URL=`) no puede degradar ninguna
pantalla; los tests e2e deben correr siempre en nivel 2/3.

### 5.5 Patrones (CU-3, CU-4): no es un clasificador

- **Heatmap** (`Patrones.heatmap`): `SUM(parada.duracionMin)` agrupado por `parada.tipoCausaId` × turno. El
  turno se toma de `orden_fabricacion.turno` vía `parada.ordenId` (más fiable que derivarlo de
  `parada.inicio`, que puede cruzar el límite 18:00). Sustituye la lectura de `parada_agregada` en
  `analytics.service.ts:119`.
- **Reglas asociativas** (`Recurrencia[]`): Apriori limitado a itemsets de tamaño ≤ 3 sobre "cestas" por
  turno. Ítems: `linea=X`, `turno=N`, `familia=Y`, `tipoCausa=Z`, `causa=W`, `diaSemana=vie`,
  `franja=12-18h`, `trasCambioProducto`, `trasArranque`, `mermaAlta`. Con ~540 cestas y ~120 ítems es
  trivial en TS. Se reportan reglas con `soporte ≥ 3 ocurrencias`, `confianza ≥ 0,6`, `lift ≥ 1,3`,
  ordenadas por `impactoMin = SUM(duracionMin)`.
  Mapeo directo al contrato existente: `frecuencia` = soporte absoluto, `confianza` = confianza × 100,
  `impactoMin` = minutos acumulados, `lineas` = códigos implicados, `patron` = frase generada en español
  desde el itemset.
- **Agrupamiento** (opcional, F4): k-means (k=3–4) sobre el perfil `(minParadas, nEventos, mermaPct,
  desvioVelocidad)` por línea×turno para etiquetar "turnos problemáticos" y enriquecer los insights.
- **Insights** (`InsightCard[]`): top-3 reglas por `impactoMin × lift`, con `tono` = `warning` si
  `impactoMin` está sobre la mediana, `info` si no, y `soporte` = "N de M eventos de la causa en los últimos
  30 días" (frase generada con cifras reales).

---

## 6. Métricas de evaluación

### 6.1 Tres métricas que hoy se confunden — separarlas explícitamente

| Métrica | Definición | Origen | Dónde se muestra |
| --- | --- | --- | --- |
| **EP (KPI de tesis)** | `PCC / PTG × 100` sobre **confirmaciones humanas** | `registro_ep`, creado en `alerts.service.ts:170` al confirmar una alerta | `kpis.ep` en Resumen; `/evidencia/ep` |
| **EP-backtest** | aciertos / total sobre predicciones contrastadas **automáticamente** contra `parada` observada | `prediccion.acierto` (nuevo cálculo) | serie predicho vs real (pestaña Predicciones) |
| **Precisión / recall / F1 / AUC** | evaluación offline del modelo en el conjunto de prueba temporal | `modelo_version` | pestaña Modelo + `kpis.precision/recall` |

Esta separación es obligatoria: la EP de tesis **no debe** inflarse con aciertos automáticos (el backlog ya
lo exige en E7-14, `docs/product-backlog.md:369`). El backtest es lo que hace creíble la pestaña
Predicciones mientras la planta aún no confirma alertas.

### 6.2 Validación temporal, nunca aleatoria

```
Ventana total: 30 días sincronizados
Entrenamiento: días 1–23   (≈ 414 muestras)
Prueba:        días 24–30  (≈ 126 muestras)
```

Adicionalmente, **validación walk-forward de 5 pliegues expansivos** (`TimeSeriesSplit`): entrenar con los
primeros k días, evaluar el día k+1, acumular. Es la métrica que se reporta como principal, porque con 126
muestras de test la varianza de un único corte es alta.
Prohibido `train_test_split` aleatorio y prohibido `StratifiedKFold` aleatorio: rompen el orden temporal y
filtran el futuro a través de las features `7d`/`30d`.

### 6.3 Matriz de confusión y umbral

Se persisten `vp`, `fp`, `vn`, `fn` en `modelo_version` (columnas nuevas). El umbral de decisión **no se
fija en 0,5**: se elige el que maximiza F1 en el conjunto de validación, y se guarda en
`modelo_version.umbralDecision`. Ese umbral se concilia con `umbrales.probabilidadMinima`
(`umbrales.entity.ts:16`, hoy 70): el motor de alertas seguirá filtrando por el umbral configurable del
jefe, y el modelo reportará su umbral óptimo como sugerencia en la pestaña Modelo.

Métricas adicionales a registrar (para el capítulo de la tesis): **Brier score** (calidad de calibración de
la probabilidad) y **lift@top-3-líneas** (de las 3 líneas que el modelo marca como más riesgosas, cuántas
efectivamente paran) — esta última es la métrica que mejor refleja el uso real de `RiesgoPorLineaChart`.

### 6.4 Persistencia

`modelo_version` (ampliada):

| Columna | Nueva | Uso |
| --- | --- | --- |
| `version`, `entrenadoEn`, `eventos`, `auc`, `f1`, `precision`, `recall`, `features`, `algoritmo`, `alertas30d`, `estado`, `orden` | existentes | se mantienen, ahora con valores calculados |
| `objetivo` | ✅ | `'parada_imprevista'` \| `'merma_sobre_estandar'` |
| `coeficientes` | ✅ | `simple-json` con pesos + medias/desv. de estandarización |
| `umbralDecision` | ✅ | corte óptimo por F1 |
| `vp`, `fp`, `vn`, `fn` | ✅ | matriz de confusión del test |
| `brier`, `liftTop3` | ✅ | métricas complementarias |
| `corteEntrenamiento`, `cortePrueba` | ✅ | fechas ISO del split temporal |
| `importancias` | ✅ | `simple-json` → `VariableEntrada[]` |
| `perfilDatos` | ✅ | salida de la fase 2 CRISP-DM |
| `proveedor` | ✅ | `'local-logistica'` \| `'python-gbm'` |

`prediccion` (ampliada): `+ lineaId`, `+ turnoObjetivo`, `+ ventanaInicio/ventanaFin`, `+ features` (json,
para reproducibilidad), `+ alertaId` (enlace con la alerta generada), `+ origen` (`'backtest'` \| `'vivo'`).
`modeloVersion` ya existe (`prediccion.entity.ts:35`).

`registro_ep`: **sin cambios** — sigue siendo el instrumento del Anexo 06 alimentado sólo por humanos.

---

## 7. Arquitectura e integración

### 7.1 Estructura de archivos propuesta

```
apps/api/src/modules/analytics/
├── analytics.controller.ts          (modificado: + endpoints de diagnóstico)
├── analytics.service.ts             (modificado: deja de leer constantes)
├── analytics.constants.ts           (reducido: sólo FASES_DESCRIPCION y umbrales de negocio)
├── dataset/
│   ├── dataset-builder.service.ts   (nuevo · fase 3 CRISP-DM)
│   └── features.ts                  (nuevo · definición declarativa de las ~25 features)
├── modelado/
│   ├── regresion-logistica.ts       (nuevo · entrenador puro, sin Nest, testeable)
│   ├── entrenamiento.service.ts     (nuevo · orquesta build → train → eval → versionar)
│   └── evaluacion.service.ts        (nuevo · split temporal, matriz, backtest)
├── patrones/
│   ├── apriori.ts                   (nuevo · reglas asociativas puras)
│   └── patrones.service.ts          (nuevo · heatmap real + recurrencias + insights)
└── inferencia/
    ├── riesgo.service.ts            (nuevo · puntúa 9 líneas × turno siguiente)
    └── inferencia.scheduler.ts      (nuevo · @Cron cada 15 min)

apps/api/src/modules/alerts/prediction/
├── modelo-local.provider.ts         (nuevo · nivel 2)
└── cascada.provider.ts              (nuevo · 1 → 2 → 3)

apps/api/src/database/entities/
├── muestra-analitica.entity.ts      (nueva)
├── patron-detectado.entity.ts       (nueva · sustituye RECURRENCIAS + INSIGHTS)
├── modelo-version.entity.ts         (ampliada)
└── prediccion.entity.ts             (ampliada)

apps/api/scripts/
├── perfilar-datos-analitica.ts      (nuevo · fase 2 CRISP-DM, sólo lectura)
└── entrenar-modelo.ts               (nuevo · CLI: pnpm --filter @mes/api entrenar)

services/prediccion-py/              (fase F6, opcional)
```

`synchronize: true` está activo (`apps/api/src/database/data-source.ts:18`), así que las entidades nuevas y
las columnas añadidas no requieren migración manual.

### 7.2 Endpoints

Los **7 endpoints actuales se conservan con la misma firma y forma de respuesta**
(`analytics.controller.ts`). Cambia sólo el interior. Se añaden:

| Endpoint | Método | Uso | Roles |
| --- | --- | --- | --- |
| `/analitica/modelo/diagnostico` | GET | matriz de confusión, curva de calibración, split temporal | `jefe`, `investigador` |
| `/analitica/predicciones/recalcular` | POST | fuerza un ciclo de inferencia sin esperar al cron (QA y demo) | `jefe`, `investigador` |
| `/analitica/dataset/exportar` | GET | CSV del feature store para el capítulo de la tesis y para entrenar en Python | `investigador` |

### 7.3 Ciclo de inferencia de 15 minutos

`InferenciaSchedulerService` (`@Cron('*/15 * * * *')`, con `ScheduleModule.forRoot()` en `app.module.ts`):

1. Determina el **turno objetivo** (el siguiente al actual, misma lógica que `analytics.service.ts:107`).
2. Para cada una de las 9 líneas construye la muestra en modo `anticipado`
   (`DatasetBuilderService.construirVivo(lineaId, turnoObjetivo)`).
3. Puntúa con el `PrediccionCascadaProvider` → `{ probabilidad, factores }`, y con la tabla de frecuencias
   obtiene `causaProbable`.
4. Hace *upsert* en `prediccion` (`origen='vivo'`, clave `lineaId+fecha+turno+objetivo`) — la UI de Resumen
   lee de ahí en vez de constantes.
5. Construye una `SenalLinea` y llama a **`AlertsEngineService.evaluar()`**
   (`alerts-engine.service.ts:54`) — su primera invocación real. El motor aplica
   `umbrales.probabilidadMinima` y crea la alerta si procede, enlazándola en `prediccion.alertaId`.
6. Llama a `AlertsEngineService.vencerCaducadas()` (`alerts-engine.service.ts:130`), que hoy tampoco se
   ejecuta nunca.
7. Un segundo cron diario (`@Cron('15 6 * * *')`, al cambio de turno de la mañana) cierra el backtest:
   contrasta las predicciones del turno terminado contra las `parada` realmente registradas, fija
   `prediccion.acierto` y actualiza `indicador_diario.prediccionesPredichas/prediccionesReales` — con lo
   que la serie de la pestaña Predicciones pasa a ser real.

Guardarraíl: si el conteo de muestras es inferior al mínimo, el scheduler no crea alertas y registra un
warning; `estado-datos` devolverá `suficiente: false` y la UI muestra `DatosInsuficientes.tsx`, que ya
existe.

### 7.4 Reentrenamiento real (botón "Reentrenar")

`AnalyticsService.reentrenar()` (`analytics.service.ts:261`) sustituye su `setTimeout` simulado por:

1. Verificar que no hay otra versión `entrenando` (guarda ya existente, `analytics.service.ts:262`).
2. Crear la fila `modelo_version` en `estado='entrenando'` (ya se hace) y **devolver 202 inmediatamente** —
   el contrato `ReentrenamientoJob` y el sondeo de `useModelo()`
   (`apps/web/src/features/analytics/hooks.ts:25`) no cambian.
3. En segundo plano: `DatasetBuilderService.reconstruir()` → `EntrenamientoService.entrenar()` →
   `EvaluacionService.evaluar()` → `PatronesService.recalcular()` → persistir métricas + importancias +
   patrones → `finalizarEntrenamiento()` (ya existe, `analytics.service.ts:303`).
4. Si falla: `estado='error'` en la versión y el job devuelve `estado: 'error'` con mensaje — el tipo
   `ReentrenamientoJob` ya contempla `'error'` (`packages/types/src/analytics.ts:183`).

Duración estimada real con 540 muestras: < 2 s. El sondeo cada 2 s de la UI sigue siendo adecuado.

### 7.5 Enlace con alertas y umbrales

- La probabilidad del modelo entra al motor por el canal que ya existe (`PREDICTION_PROVIDER`), de modo que
  `umbrales.probabilidadMinima`, `velocidadBajoEstandarPct` y `oeeMinimo` siguen gobernando cuándo hay
  alerta. **No se duplica lógica de umbrales en analítica.**
- Se propone una mejora acotada en `alerts-engine.service.ts:78`: la condición `senal.eventos7d >= 3`
  (heurística fija) pasa a ser "el modelo asigna probabilidad ≥ umbral al target de parada", dejando las
  otras dos reglas (velocidad, OEE) intactas como salvaguarda determinista.
- `modelo_version.alertas30d` deja de ser una constante sembrada:
  `COUNT(alerta WHERE generadaEn >= hoy-30d)`.

---

## 8. Migración desde los datos sembrados

Principio: **el seed deja de inventar y pasa a arrancar el pipeline**. Nada de borrones bruscos que rompan
e2e o mocks.

### 8.1 `thesis-analytics.seed.ts`

Se reescribe (mismo archivo, misma clase `ThesisAnalyticsSeeder`, mismo registro en `thesis.seeds.ts:17`)
con esta lógica:

```
si (COUNT(parada) >= MIN_PARADAS && COUNT(orden_fabricacion) >= MIN_ORDENES)
    → bootstrap real: construir dataset, entrenar v1.0, evaluar, detectar patrones, backtest
si no
    → no sembrar nada: 0 filas en modelo_version y prediccion
      (la UI cae en DatosInsuficientes.tsx, que es el estado 08.E ya diseñado)
```

Se elimina el arreglo `VERSIONES` (`thesis-analytics.seed.ts:9`) y el bucle `rng(707)`
(`thesis-analytics.seed.ts:31`). El versionado arranca en `v1.0` (entrenada con datos reales), no en `v3.2`
— y eso se documenta: *v3.2 era la numeración de la maqueta*.

`thesis-reports.seed.ts:158` (`seedDiario`) deja de inventar `prediccionesPredichas/Reales` con `rng(606)`;
esas dos columnas las llena el backtest. La parte de OEE del mismo seeder se conserva mientras no se
recalcule desde `orden_fabricacion` (fuera del alcance de este plan).

`analytics.constants.ts` se reduce a `FASES_DESCRIPCION` (texto CRISP-DM, sigue siendo válido) y a los
umbrales de negocio (`EVENTOS_REQUERIDOS`, `RITMO_DIARIO_EVENTOS`). Se eliminan `INSIGHTS`,
`RIESGO_POR_LINEA`, `RECURRENCIAS`, `VARIABLES_ENTRADA`, `EVENTOS_MIGRADOS`, `EXCEDENTE_DEMO`,
`EVENTOS_DEMO_INSUFICIENTES`.

`estadoDatos()` (`analytics.service.ts:233`) pasa a contar eventos reales:
`COUNT(parada) + COUNT(merma) + COUNT(orden_fabricacion)`; `RITMO_DIARIO_EVENTOS` se calcula como la media
diaria de los últimos 7 días en vez de la constante 63. El parámetro `?estado=` se conserva tal cual (es el
interruptor de demo/QA y lo usan los mocks).

### 8.2 Tests e2e

`apps/api/test/thesis.e2e-spec.ts:385-450` contiene asserts atados a los valores ficticios:
`version: 'v3.2'`, `eventos: 2140`, `precision: 81`, `recall: 77`, `alertas30d: 142`, `heatmap` de 10 celdas
con `PN-02/D = 96`, `serie` de 30 puntos, `historico` de 24, `estado-datos` con 2 130.

Estrategia de migración de los tests (no borrarlos, reescribirlos como **invariantes estructurales**):

| Assert actual | Assert nuevo |
| --- | --- |
| `modelo.version === 'v3.2'` | `modelo.version` cumple `/^v\d+\.\d+$/` y `activo === true` |
| `eventos === 2140` | `eventos > 0` y `=== metricas.registros` |
| `precision === 81` | `0 <= precision <= 100` y `f1` coherente con `precision`/`recall` |
| `heatmap` 10 celdas exactas | `heatmap.length === nºCausasRaíz × 2` y todos los `valor >= 0` |
| `serie` 30 puntos | `serie.length <= 30`, fechas ascendentes y sin huecos |
| `historico` 24 filas | cada fila con `acierto ∈ {true,false,null}` y `probabilidad ∈ [0,100]` |
| `estado-datos` 2 130 | `eventos === COUNT` real; `?estado=insuficiente` sigue devolviendo `suficiente: false` |
| reentrenar `'v3.3'` en 3,5 s | reentrenar devuelve 202 y la versión queda `vigente` antes de 10 s (polling, no `sleep` fijo) |

**Los e2e corren en SQLite `:memory:`** (`data-source.ts:30`) y siembran desde cero: si el nuevo seeder no
siembra sin datos reales, los tests de analítica se quedarían sin sujeto. Solución: un seeder de test
(`test/fixtures/analitica.fixture.ts`) que genere un corpus mínimo determinista de
`orden_fabricacion`/`parada`/`merma` (p. ej. 60 turnos con un patrón plantado: "LLEN-M2 + turno N ⇒
parada"), y que los asserts verifiquen que el pipeline **descubre ese patrón plantado**. Es un test mucho
más fuerte que el actual y sostiene el capítulo de validación de la tesis.

### 8.3 Modo mock (`apps/web/src/mocks`)

No se toca en las fases F0–F4. Los handlers msw (`apps/web/src/mocks/handlers/analytics.ts`) y sus fixtures
(`apps/web/src/mocks/data`) son la **demo offline** y deben seguir funcionando con el mismo contrato. Como
los contratos sólo se amplían con campos opcionales, el mock sigue siendo válido sin cambios.

En F5 (cosmético) se propone regenerar `apps/web/src/mocks/data/analytics*` a partir de un *dump* real
(`GET /analitica/*` contra la base sincronizada, volcado a JSON), para que la demo deje de mostrar
"v3.2 · 2 140 eventos" y muestre cifras plausibles y coherentes. Es copia de datos, no cambio de código.

### 8.4 Documentación

`docs/api-contracts.md:305-316`: actualizar la nota de `estado-datos` (ya no hay "planta sembrada con
2 140 eventos") y documentar los 3 endpoints nuevos y los campos aditivos.
`docs/product-backlog.md:246-281`: E6-01…E6-04 pasan de `Hecho` a `Hecho (reimplementado sobre datos
reales)`; E6-05 se desdobla en **E6-06 (modelo local entrenado en TS)** y **E6-05 (microservicio Python)**,
lo que permite cerrar el hueco de IA sin depender de Python.

---

## 9. Fases de entrega

Estimación en días-persona (1 desarrollador con el repo ya conocido). Precondición global:
`sincronizar-produccion.ts` operativo con ~30 días de datos.

### F0 — Comprensión y preparación de datos · 3 d

- `perfilar-datos-analitica.ts` (perfil de nulos, cardinalidades, tasa de positivos, paradas sin
  categorizar).
- `features.ts` + `DatasetBuilderService` + entidad `muestra_analitica`.
- `estadoDatos()` real.
- **Aceptación**: `pnpm --filter @mes/api perfilar` imprime el perfil de las 4 tablas; `muestra_analitica`
  tiene ≥ 400 filas en modo `anticipado`; `GET /analitica/estado-datos` devuelve el conteo real y no
  contiene ninguna constante de `analytics.constants.ts`; la tasa de positivos del target está documentada
  y entre 15 % y 60 % (si no, se recalibra `UMBRAL_MIN` antes de seguir).

### F1 — Patrones reales · 2 d

- `PatronesService`: heatmap desde `parada` + Apriori + insights.
- Entidad `patron_detectado`.
- **Aceptación**: `GET /analitica/patrones` devuelve un heatmap cuya suma de minutos coincide (±1 min) con
  `SELECT SUM(duracionMin) FROM parada` del periodo; `recurrencias` tiene ≥ 3 reglas con `lift ≥ 1,3` y
  cada `impactoMin` es verificable con una consulta SQL; el fixture de test con patrón plantado se descubre
  en el top-3.

### F2 — Modelo base + inferencia cada 15 min · 5 d

- `regresion-logistica.ts` (+ pruebas unitarias sobre un dataset sintético con separación conocida).
- `EntrenamientoService`, `ModeloLocalPredictionProvider`, `PrediccionCascadaProvider`.
- `InferenciaSchedulerService` + `@nestjs/schedule` + `POST /analitica/predicciones/recalcular`.
- **Aceptación**: con `PREDICTION_SERVICE_URL` vacía, `GET /analitica/resumen` devuelve `riesgoPorLinea`
  con las 9 líneas reales y `causaProbable` tomada de causas existentes en `causa_parada`; forzar un
  recálculo crea/actualiza filas en `prediccion` y, si supera `umbrales.probabilidadMinima`, una `alerta`
  real visible en `/alertas`; apagar la base de modelos (`modelo_version` vacía) mantiene la respuesta 200
  vía `RuleBasedPredictionProvider`.

### F3 — Evaluación, backtest y reentrenamiento real · 4 d

- `EvaluacionService` (split temporal + walk-forward + matriz + Brier + lift@3).
- Cron diario de backtest → `prediccion.acierto` e `indicador_diario`.
- `reentrenar()` real + `importancias` → `VariableEntrada[]` + fases CRISP-DM con estado derivado.
- **Aceptación**: la pestaña Modelo muestra AUC/F1/precisión/recall calculados (reproducibles con
  `pnpm --filter @mes/api entrenar`, resultados idénticos entre corridas con semilla fija);
  `GET /analitica/predicciones` devuelve una serie donde `real` coincide con `SELECT COUNT(*) FROM parada`
  del día; el botón "Reentrenar" produce una versión nueva con métricas distintas de las anteriores y queda
  `vigente` sin intervención; `kpis.ep` sigue viniendo sólo de `registro_ep`.

### F4 — Merma y agrupamiento · 3 d

- Segundo objetivo (`merma_sobre_estandar`) con su propia `modelo_version.objetivo`.
- Alertas `merma_prevista` reales; insights de merma.
- k-means de turnos problemáticos.
- **Aceptación**: existe una `modelo_version` con `objetivo='merma_sobre_estandar'` y métricas propias; se
  generan alertas `merma_prevista` con factores que citan causas reales de `causa_merma`.

### F5 — Limpieza de la UI y de la demo · 2 d

- Campos aditivos en `packages/types`, sustitución de `CONFIANZAS` y deltas fijos en `ResumenTab.tsx`,
  subtítulos dinámicos en `PatronesTab.tsx:103` y `RiesgoPorLineaChart.tsx:36`.
- Regeneración de fixtures msw desde un dump real.
- Actualización de `docs/api-contracts.md` y `docs/product-backlog.md`.
- **Aceptación**: `rg "2 140|v3\.2|14 variables"` no devuelve resultados en `apps/web/src/features/analytics`
  ni en `apps/api/src/modules/analytics`; el modo mock arranca y las 4 pestañas pintan sin errores.

### F6 — Microservicio Python (E6-05) · 5 d · opcional

- `services/prediccion-py/` con FastAPI, `POST /predict`, `POST /entrenar`, `GET /salud`, SHAP →
  `factores[]`, `Dockerfile` y entrada en `docker-compose`.
- **Aceptación**: con `PREDICTION_SERVICE_URL` apuntando al servicio, `modelo_version.proveedor='python-gbm'`
  y el AUC mejora sobre la línea base **o** se documenta que no mejora (resultado igualmente publicable);
  apagando el servicio, los e2e siguen en verde sin cambios de código.

**Total F0–F5: 19 días-persona.** Con F6: 24.

---

## 10. Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación |
| --- | --- | --- | --- |
| R1 | **Volumen limitado** (~540 muestras, 30 días) | Sobreajuste; métricas inestables | Modelo lineal regularizado como nivel 2 (no GBM); walk-forward en vez de un corte único; reportar intervalos, no puntos; ampliar la ventana de sincronización a 60–90 días en cuanto la fuente lo permita — el `DatasetBuilderService` es agnóstico al rango |
| R2 | **Desbalance de clases** | Recall pésimo o modelo trivial | Medir la tasa de positivos en F0 **antes** de modelar; ponderación inversa de clase; umbral por F1, no 0,5; si la tasa supera ~70 %, cambiar el target a "minutos de parada imprevista sobre la mediana del par línea×producto" (regresión→binarización), decisión ya prevista en F0 |
| R3 | **Causas mal categorizadas / "parada sin categorizar"** | Reglas asociativas basura; `causaProbable` inútil | Tratar el nodo sin categorizar como una clase propia (`SIN_CATEGORIZAR`), excluirla del consecuente de las reglas pero contarla en el target; exponer `pctParadasSinCategorizar` en el perfil y en la ficha del modelo (es un hallazgo válido para la tesis: "el X % de las paradas no está categorizado") |
| R4 | **Fuga de datos** por features del propio turno | Métricas espectaculares e inservibles en producción | Separación dura `modo='retro'` vs `modo='anticipado'`; el despliegue **sólo** usa `anticipado`; prueba unitaria que falla si una feature `anticipado` referencia una columna del turno objetivo |
| R5 | **Los e2e actuales se rompen** | Bloqueo del merge | Reescritura a invariantes estructurales (§8.2) + fixture con patrón plantado, en el mismo PR que cambia el seeder |
| R6 | **`PREDICTION_SERVICE_URL` ausente** (caso normal hoy) | Pantalla vacía si se depende de Python | Cascada de 3 niveles; test e2e que corre con la variable vacía y exige 200 en las 4 pestañas |
| R7 | **Drift del árbol de causas** (83 causas, jerarquía cambiante) | Modelo entrenado con códigos que dejan de existir | Modelar sobre `tipoCausaId` (nivel raíz, estable) y usar `causaId` sólo para texto; guardar en `modelo_version.perfilDatos` el catálogo vigente al entrenar y avisar si cambia |
| R8 | **Cron en múltiples instancias** | Predicciones y alertas duplicadas | *Upsert* idempotente por clave `lineaId+fecha+turno+objetivo`; bandera de entorno para desactivar el scheduler en réplicas y en e2e |
| R9 | **Expectativas de la tesis vs. realidad del modelo** (AUC modesto) | Narrativa débil | Enmarcar desde el inicio: el entregable es *un pipeline CRISP-DM reproducible sobre datos reales*, con métricas honestas y validación temporal. Un AUC de 0,68 documentado vale más que un 0,86 sembrado |
| R10 | **Confusión EP vs precisión** | KPI de tesis contaminado | Separación explícita de las tres métricas (§6.1); `registro_ep` intocado; el backtest nunca escribe en `registro_ep` |

---

## 11. Decisiones abiertas a confirmar con el tesista

1. **Numeración de versiones**: ¿arrancar en `v1.0` (honesto) o continuar en `v4.0` (continuidad visual con
   la maqueta)? Recomendación: `v1.0` + nota en la tesis.
2. **Ventana de sincronización**: 30 días es el mínimo viable; 90 días multiplicaría por 3 las muestras y
   haría defendible el GBM. Conviene evaluar si `sincronizar-produccion.ts` puede traer 90 días.
3. **Umbral de duración del target** (`UMBRAL_MIN`, propuesto 10 min): debe validarse con el jefe de
   producción — es una decisión de negocio, no estadística.

---

## 12. Resumen ejecutivo

1. La vista `/analitica` es hoy una maqueta: 6 de sus 8 bloques vienen de constantes en
   `analytics.constants.ts` y de `thesis-analytics.seed.ts`; sólo `kpis.ep` y `prediccionesActivas` tienen
   fuente real.
2. Hallazgo clave: `AlertsEngineService.evaluar()` y `vencerCaducadas()` **nunca se invocan** — el motor de
   alertas y su `PredictionProvider` funcionan pero nadie los dispara; el "se recalculan cada 15 minutos"
   de la UI no existe.
3. El plan **no rediseña el frontend**: conserva los 7 endpoints y los contratos de
   `packages/types/src/analytics.ts`, añadiendo sólo campos opcionales para los valores que la UI hoy quema.
4. Grano de análisis: `línea × día × turno` (~540 filas con 30 días), con ~25 features nombradas sobre
   columnas reales (`orden_fabricacion.oee`, `parada.afectaOee/tipoCausaId/duracionMin`,
   `merma.cantidadKg`, `producto_linea.mermaEstandarPct/cipMin/arranqueMin`).
5. Target primario: parada **imprevista que afecta OEE** y dura ≥ 10 min en el turno; secundario: merma
   sobre el estándar del par producto×línea.
6. Separación dura `retro` vs `anticipado` en el feature store para eliminar la fuga de datos; sólo
   `anticipado` se despliega.
7. Modelo: **regresión logística L2 entrenada en TypeScript**, con pesos persistidos en
   `modelo_version.coeficientes` — justificada por n≈540 y hace que el sistema tenga un modelo real *sin*
   depender de Python.
8. Cascada de 3 proveedores detrás de la interfaz `PredictionProvider` existente: Python (si
   `PREDICTION_SERVICE_URL`) → modelo local → reglas actuales. Apagar Python no puede degradar ninguna
   pantalla, y eso se verifica en e2e.
9. Patrones: heatmap calculado sobre `parada` (turno tomado de `orden_fabricacion.turno` vía `ordenId`) y
   **Apriori** (itemsets ≤ 3, soporte ≥ 3, confianza ≥ 0,6, lift ≥ 1,3) que llena `recurrencias` e
   `insights` con frases generadas y cifras verificables por SQL.
10. Evaluación con **validación temporal walk-forward** (nunca aleatoria), matriz de confusión, umbral
    elegido por F1, Brier y lift@top-3-líneas, todo persistido en `modelo_version`.
11. Tres métricas se separan explícitamente: **EP de tesis** (sólo confirmaciones humanas en `registro_ep`,
    intocado), **EP-backtest** (automática, alimenta la serie predicho vs real) y **precisión/recall/AUC**
    (evaluación offline).
12. Despliegue: cron `*/15` que puntúa las 9 líneas, hace upsert en `prediccion` y llama por primera vez a
    `AlertsEngineService.evaluar()`, respetando `umbrales.probabilidadMinima`; cron diario que cierra el
    backtest.
13. El botón "Reentrenar" deja de ser un `setTimeout(3000)` y ejecuta el pipeline completo (< 2 s con 540
    muestras), manteniendo el contrato `ReentrenamientoJob` y el sondeo del frontend.
14. Migración del seed: `thesis-analytics.seed.ts` pasa de inventar a hacer *bootstrap* del pipeline si hay
    datos reales, y a no sembrar nada si no los hay; los e2e se reescriben como invariantes estructurales
    más un fixture con patrón plantado que el pipeline debe descubrir; el modo mock msw no se toca.
15. Entrega en 6 fases, 19 días-persona sin microservicio Python (+5 con él), con criterios de aceptación
    verificables por consulta SQL o comando; riesgo principal gestionado de frente: con 30 días de datos la
    narrativa correcta es *pipeline CRISP-DM reproducible con métricas honestas*, no un AUC alto.
