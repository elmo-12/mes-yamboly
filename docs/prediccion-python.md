# Contrato del servicio de predicción en Python (`services/prediccion-py`)

> **Estado: congelado (F0).** Los bloques A (servicio Python), B (orquestador Nest),
> C (sincronización) y D (cascada) se desarrollan en paralelo contra este documento.
> Cualquier cambio aquí obliga a avisar a los cuatro.

## 1. Frontera

```
Tablas operativas ─► DatasetBuilderService (TS) ─► muestra_analitica
                        único dueño del feature engineering
                        y de la regla anti-fuga anticipada/retrospectiva
                                    │
                    filas + catálogo + cortes temporales
                                    ▼
                          services/prediccion-py
                       LightGBM · HistGB · LogisticRegression
                       calibración Platt · SHAP · .joblib versionado
                                    │
                        métricas + fuera[] + artefacto
                                    ▼
              EntrenamientoContinuoService (TS) ─► modelo_version
                          único escritor de la tabla
```

**Reglas duras**

1. Python **no escribe en PostgreSQL**. Sólo persiste artefactos `.joblib` en su volumen.
2. Python **no reconstruye features** desde tablas crudas. No recalcula ventanas 7/30 d,
   turnos, causas, OEE, mermas ni personal. Puede imputar, calibrar, ponderar clases,
   buscar hiperparámetros y explicar.
3. **Nest manda los cortes temporales.** Python no los inventa; los devuelve y Nest los
   verifica.
4. Apagar Python no puede romper ninguna pantalla: la cascada cae a reglas.

## 2. `POST /predict`

Lo consume `apps/api/src/modules/alerts/prediction/python-http.provider.ts:41-52`
**sin modificarlo**: envía `JSON.stringify(ctx)`, exige `respuesta.ok`, y valida que
`probabilidad` sea `number` y `factores` un array. Los campos extra se ignoran.

### Request — es `PredictionContext` tal cual (`prediction.provider.ts:7-29`)

```jsonc
{
  "tipo": "parada_prevista",        // parada_prevista | merma_prevista | velocidad_baja | oee_bajo
  "lineaId": "LIN-LLEN-M2",
  "lineaCodigo": "LLEN-M2",
  "turno": "D",                     // D | N  (el JSDoc dice M·T·N: está obsoleto)
  "eventos7d": 3,
  "eventos30d": 11,
  "desvioVelocidadPct": -4.2,       // negativo = por debajo del estándar
  "oeeActual": 71.3,
  "minutosDesdeCambio": 0,
  "features": { "diaSemana": 2, "paradasImprev7d": 3 }   // opcional
}
```

Pydantic con `extra='ignore'`.

### Response 200

```jsonc
{
  "probabilidad": 63.4,             // 0–100, NO 0–1
  "factores": [                     // máx. 3, contribuciones 0–100 que suman 100
    { "texto": "Paradas imprevistas 7 d", "contribucion": 52 },
    { "texto": "OEE del turno anterior",  "contribucion": 31 },
    { "texto": "Turno Noche",             "contribucion": 17 }
  ],
  "version": "v2.4", "proveedor": "python-gbm", "latenciaMs": 12   // extras, ignorados
}
```

### Reglas de servicio

- Con `features`: vectorizar por nombre según los `nombres` del artefacto; claves
  desconocidas se ignoran; **ausentes → `NaN`** (HistGB/LightGBM lo tratan de forma nativa).
- Sin `features`: mapear el contexto estrecho **exactamente** como
  `modelo-local.provider.ts:83-91`:

  | contexto | feature |
  | --- | --- |
  | `eventos7d` | `paradasImprev7d` |
  | `eventos30d` | `paradasImprev30d` |
  | `desvioVelocidadPct` | `desvioVelocidadTurnoPrevio` |
  | `oeeActual` | `oeeTurnoPrevio` |
  | `turno === 'N'` | `turnoEsNoche` = 1 |
  | `lineaCodigo` | `linea_<codigo>` = 1 (misma regex que `nombreFeatureLinea`) |

  El resto, `NaN`.
- `tipo != 'parada_prevista'` → **422**. Sin modelo activo → **503**. En ambos casos el
  provider devuelve `null` y la cascada baja a reglas.
- Presupuesto **p95 < 500 ms** (el cliente corta a `PREDICTION_TIMEOUT_MS`, 1 500 ms).
- Sin autenticación: el provider no manda cabeceras. Se protege publicando el puerto
  sólo en `127.0.0.1`.

## 3. `POST /entrenar`

Síncrono. Lo llama Nest con timeout de 600 s y cabecera `X-Internal-Token`.

### Request

```jsonc
{
  "version": "v2.4",
  "objetivos": ["parada_imprevista", "merma_sobre_estandar",
                "minutos_imprevistos", "causa_dominante"],
  "snapshot": { "sha256": "…", "filas": 1130, "desde": "2026-03-20", "hasta": "2026-09-16" },
  "catalogo": [ { "nombre": "paradasImprev7d", "grupo": "historico7d",
                  "etiqueta": "Paradas imprevistas 7 d" } ],
  "prohibidas": ["oeeTotal", "oeeDisponibilidad", "oeeRendimiento", "oeeCalidad",
                 "velocidadRealUnidMin", "desvioVelocidadPct", "mermaKgTurno"],
  "evaluacion": {
    "pruebaDesde": "2026-08-18",
    "pliegues": [ { "entrenamientoHasta": "2026-04-15",
                    "validacionDesde": "2026-04-16", "validacionHasta": "2026-05-15" } ]
  },
  "muestras": [ { "lineaId": "…", "lineaCodigo": "LLEN-M2", "fecha": "2026-03-04",
                  "turno": "D", "modo": "anticipado", "inicioTurno": "2026-03-04T06:00:00",
                  "features": { }, "huboParadaImprevista": 1, "mermaSobreEstandar": 0,
                  "minutosImprevistos": 34.0, "tipoCausaDominante": "CPA-PN-02" } ],
  "campeon": { "version": "v2.1", "algoritmo": "LightGBM 4.5",
               "hiperparametros": { } },
  "semilla": 42
}
```

### Validaciones → 422

- Alguna columna de `prohibidas` presente en una fila `modo='anticipado'`
  (**guardarraíl anti-fuga**).
- `snapshot.sha256` no coincide con el recalculado sobre `muestras`.
- Menos de 200 filas `anticipado`, o una sola clase **en todo el corpus** para un
  objetivo binario, o `catalogo` vacío. Esto es un chequeo global previo a entrenar
  nada: distinto de la insuficiencia de clases *dentro de un pliegue o de un objetivo
  concreto* (p. ej. `causa_dominante` con target mayoritariamente `null`), que no es un
  422 sino un fallo aislado de ese objetivo — ver §3.3.

**409** si ya hay un entrenamiento en curso. **500** sólo si **todos** los
objetivos pedidos fallaron al entrenar — ver §3.3.

### Response 200 — un bloque por objetivo

```jsonc
{
  "runId": "TRAIN-v2.4",
  "resultados": {
    "parada_imprevista": {
      "algoritmo": "LightGBM 4.5",
      "hiperparametros": { },
      "muestras": 1130, "features": 41, "tasaPositivos": 0.364,
      "walkForward": { "aucRoc": 0.74, "prAuc": 0.61, "f1": 0.58,
                       "precision": 0.51, "recall": 0.67,   // 0–1, Nest multiplica ×100
                       "brier": 0.181, "vp": 91, "fp": 44, "vn": 203, "fn": 62,
                       "umbral": 0.37 },                    // 0–1
      "aucPrueba": 0.73, "aucRetro": 0.88, "liftTop3": 1.62,
      "corteEntrenamiento": "2026-08-17", "cortePrueba": "2026-09-16",
      "pliegues": [ ],                                       // los que usó de verdad
      "importancias": [ { "nombre": "paradasImprev7d", "importancia": 100 } ],
      "fuera": [ { "lineaId": "…", "lineaCodigo": "…", "fecha": "…", "turno": "D",
                   "y": 1, "p": 0.61, "minutosImprevistos": 34 } ],
      "alternativas": [ { "algoritmo": "HistGradientBoosting", "prAuc": 0.58 },
                        { "algoritmo": "LogisticRegression",   "prAuc": 0.55 } ],
      "campeonReevaluado": { "version": "v2.1", "walkForward": { } },
      "artefacto": { "uri": "modelos/parada_imprevista/v2.4.joblib",
                     "sha256": "…", "bytes": 184320 }
    },
    "minutos_imprevistos": { "metricas": { "mae": 12.4, "rmse": 21.8, "r2": 0.31 } },
    "causa_dominante":     { "metricas": { "f1Macro": 0.41, "accuracy": 0.58, "top2": 0.74 } }
  },
  "duracionMs": 41200
}
```

**`pliegues[]` y `snapshot.sha256` son mecanismos de seguridad, no decoración.** Nest los
verifica contra su propio `repartir()` (`evaluacion.service.ts:205-213`) y rechaza la
promoción si difieren: un off-by-one en el port produciría métricas no comparables y
promociones falsas.

`fuera[]` tiene la forma de `ProbabilidadFuera` (`evaluacion.service.ts:24-33`) para que
`registrarBacktest()` no cambie.

**PR-AUC es la métrica primaria** (clases desbalanceadas); se reporta también ROC-AUC.

### 3.1 Canonicalización de `snapshot.sha256` — acoplamiento exacto

Es el punto más frágil del contrato: TS y Python tienen que producir **el mismo** hash o
todo entrenamiento se rechaza con 422. La regla, literal en ambos lados:

1. Se serializa **el array `muestras` tal cual va en el cuerpo**, en su mismo orden.
2. JSON con claves ordenadas alfabéticamente **en todos los niveles**, sin espacios
   (separadores `,` y `:`), sin escapar no-ASCII.
3. `sha256` del UTF-8 resultante, en hexadecimal minúscula.

```python
# Python — dominio/validacion.py
hashlib.sha256(
    json.dumps(muestras, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    .encode("utf-8")
).hexdigest()
```

```ts
// TS — debe producir exactamente lo mismo
const canonico = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonico)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonico((v as Record<string, unknown>)[k])]))
    : v;
createHash('sha256').update(JSON.stringify(canonico(muestras)), 'utf8').digest('hex');
```

`JSON.stringify` de Node ya emite sin espacios y no escapa no-ASCII, así que basta con
ordenar las claves recursivamente. **Cuidado con los números**: no introduzcas redondeos
distintos a cada lado; envía los `features` tal como salen de la base.

### 3.2 `campeonReevaluado` — obligatorio, no opcional

Python debe reentrenar la configuración del campeón (`campeon.algoritmo` +
`campeon.hiperparametros`) sobre **los datos de hoy y con el mismo protocolo** que el
candidato, y devolver sus métricas en `campeonReevaluado`.

No es un adorno: `aplicarTarget` puede cambiar la regla del target entre semanas
(`dataset-builder.service.ts`), así que la métrica archivada del campeón puede estar
midiendo otra cosa. Comparar el candidato contra ella promovería o bloquearía modelos por
un artefacto del target, no por mérito. Si `campeon` es `null` (primera corrida),
`campeonReevaluado` es `null` y el candidato se promueve si supera los guardarraíles
absolutos (`AUC_MINIMA`, `MIN_MUESTRAS`).

### 3.3 Aislamiento por objetivo — un objetivo no entrenable no tumba la corrida

Bug real (corpus de 30 días, 225 muestras `anticipado`, los 4 objetivos en una sola
llamada): `tipoCausaDominante` es `null` en la mayoría de los turnos —la mayoría no tuvo
parada imprevista accionable—, así que en los pliegues tempranos del walk-forward de
`causa_dominante` el target se queda con 0 o 1 clase distinta. Antes, eso reventaba con
un 500 y Nest perdía la corrida **entera**, incluido `parada_imprevista` —el único que
consume `/predict` y el que sostiene la tesis— aunque se hubiera entrenado sin problema.

**Regla dura:** cada objetivo de `objetivos[]` se entrena de forma aislada. Si uno falla
—clases insuficientes, varianza cero, o cualquier otro error— su bloque en `resultados`
es:

```jsonc
{ "error": "menos de 2 clases distintas en `tipoCausaDominante` tras excluir nulos (…)" }
```

en vez de estar ausente o de tumbar la respuesta. Los demás objetivos siguen su curso
normal —se entrenan y se persisten— sin importar qué le pasó a los otros.

> **`/entrenar` nunca activa nada.** Persiste el artefacto y devuelve sus métricas;
> el modelo que sirve `/predict` sólo cambia cuando Nest lo ordena con
> `POST /modelo/{objetivo}/{version}/activar`, después de su champion/challenger.
> Activar al entrenar anula la decisión de promoción: Nest resuelve «conservo al
> incumbente» mientras `/predict` ya sirve al retador rechazado, la vigente de
> Postgres y la activa de Python divergen, y la reconciliación de arranque acaba
> archivando la vigente buena por «artefacto perdido».
La respuesta es **200** mientras al menos un objetivo haya salido adelante:

```jsonc
{
  "runId": "TRAIN-v2.4",
  "resultados": {
    "parada_imprevista":     { "algoritmo": "LightGBM 4.5", "…": "…" },
    "merma_sobre_estandar":  { "algoritmo": "LightGBM 4.5", "…": "…" },
    "minutos_imprevistos":   { "metricas": { "mae": 12.4, "rmse": 21.8, "r2": 0.31 } },
    "causa_dominante":       { "error": "menos de 2 clases distintas en `tipoCausaDominante` tras excluir nulos (3 filas con causa, clases observadas: ['CPA-PN-02'])" }
  },
  "duracionMs": 41200
}
```

**500 sólo si fallan todos los objetivos pedidos.** El cuerpo entonces es:

```jsonc
{ "error": "Todos los objetivos fallaron", "resultados": { "…": { "error": "…" } } }
```

Nest debe leer `resultados[objetivo]` y, si trae `error` en vez de las métricas
esperadas, tratar ese objetivo como «no promovible esta corrida» —sin archivar nada ni
tocar `modelo_version`— y seguir con el resto exactamente igual que si esa llamada nunca
hubiera incluido ese objetivo.

Casos concretos que Python detecta y aísla en vez de dejar reventar el proceso:

- Binario o multiclase con menos de 2 clases distintas (excluyendo `null`) en el target,
  ya sea en un pliegue del walk-forward o en el conjunto de entrenamiento final.
- Multiclase con menos de 2 ejemplos de alguna clase en un pliegue (una clase con un solo
  ejemplo no deja nada que aprender y puede degenerar en el motor de LightGBM).
- Regresión con varianza cero en el target de un pliegue o del entrenamiento final.
- Cualquier pliegue candidato sin las filas mínimas (`MINIMO_FILAS_PLIEGUE`), como ya
  pasaba antes de este cambio.
- Si, tras aplicar lo anterior, **ningún** pliegue del walk-forward queda utilizable, el
  objetivo se marca no entrenable con el motivo, sin intentarlo igualmente.

## 4. Resto de endpoints

| Endpoint | Respuesta |
| --- | --- |
| `GET /salud` | Siempre 200 si el proceso vive: `{estado:'ok'\|'degradado', modeloCargado, version, sklearn, uptimeS}`. `degradado` = sin modelo; nunca tumba el contenedor |
| `GET /modelo/actual` | `{version, objetivo, algoritmo, hiperparametros, nombres, entrenadoEn, artefactoSha256, umbralDecisionPct}` · **404** si no hay activo |
| `GET /modelo/versiones` | Registro completo por objetivo |
| `POST /modelo/{objetivo}/{version}/activar` | Hot-swap atómico en memoria · **404** si falta el artefacto |
| `POST /modelo/{objetivo}/desactivar` | `/predict` pasa a 503 |

Las mutaciones exigen `X-Internal-Token` cuando `PREDICCION_TOKEN` está definido.

## 5. Objetivos

| Objetivo | Tipo | Columna de `muestra_analitica` | Métricas |
| --- | --- | --- | --- |
| `parada_imprevista` | binario | `huboParadaImprevista` | PR-AUC, ROC-AUC, F1, Brier, matriz, lift@3 |
| `merma_sobre_estandar` | binario | `mermaSobreEstandar` | ídem |
| `minutos_imprevistos` | regresión | `minutosImprevistos` | MAE, RMSE, R² |
| `causa_dominante` | multiclase | `tipoCausaDominante` | F1-macro, accuracy, top-2 |

`/predict` sirve **sólo** `parada_imprevista`: es el único que consume el motor de alertas.

## 6. Definición del target (fijada en F0)

Positivo de `parada_imprevista` = existe una parada del turno con
`afectaOee = true`, `duracionMin >= 10` y cuyo **tipo raíz pertenece a la rama `PN-*`**
(`PN-02 Paro por fallas`, `PN-03 Demoras`, `PN-04 Paro imprevisto`).

Se excluye `PS-05 Paro sin programa` aunque el catálogo lo marque `imprevista`: de ahí
cuelgan `Refrigerio` (causa nº 1 del corpus) y `Apoyo a otra línea`, que son tiempo sin
programa de producción, no averías. Ver `dataset-builder.service.ts`
(`PREFIJO_TIPO_IMPREVISTO`, `esImprevistaAccionable`).

**Efecto medido sobre el corpus de 30 días:** tasa de positivos 63,1 % → **36,4 %**;
la regla activa vuelve a ser `parada_individual` y la alternativa
`minutos_sobre_mediana` (que además tenía fuga de datos, ya corregida) deja de usarse.

## 7. Unidades — la fuente de errores más probable

| Magnitud | Python (`/entrenar`) | `modelo_version` / UI |
| --- | --- | --- |
| `probabilidad` de `/predict` | **0–100** | 0–100 |
| `aucRoc`, `prAuc`, `f1`, `brier` | 0–1 | 0–1 |
| `precision`, `recall` | 0–1 | **0–100** (Nest multiplica) |
| `umbral` | 0–1 | **0–100** (`umbralDecision`) |
