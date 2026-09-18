# prediccion-py

Servicio de inferencia y entrenamiento en Python del MES `yamboly` (bloque A
del contrato congelado en `docs/prediccion-python.md`, raíz del repo).

Python **no escribe en PostgreSQL** y **no reconstruye features**: sólo
recibe filas + catálogo + cortes temporales de Nest, entrena/pondera
LightGBM · HistGradientBoosting · LogisticRegression/Ridge, calibra con
Platt, explica con `pred_contrib`/sustitución a la mediana y persiste
`.joblib` versionados.

## Desarrollo

```bash
uv sync
uv run pytest -q
uv run uvicorn prediccion.main:app --port 8001 --reload
```

## Entrenar sin levantar el servidor

```bash
uv run prediccion entrenar --fixture tests/fixtures/entrenar_sintetico.json
```

## Variables de entorno

Ver `.env.example`. Ninguna apunta a PostgreSQL: éste servicio no la toca.
