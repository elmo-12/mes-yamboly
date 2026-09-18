"""Vectorización del `PredictionContext` estrecho, portada 1:1 desde
`modelo-local.provider.ts:81-104` (tabla del §2 del contrato).

Cuando el contexto trae `features`, se vectoriza por nombre contra los
`nombres` del artefacto: claves desconocidas se ignoran, ausentes → NaN.
Cuando no trae `features` (el caso normal del motor de alertas), se mapea el
contexto estrecho exactamente como la tabla del contrato.
"""

from __future__ import annotations

import re

import numpy as np


def nombre_feature_linea(linea_codigo: str) -> str:
    """Misma regex que `nombreFeatureLinea` en `features.ts`."""
    return "linea_" + re.sub(r"[^A-Za-z0-9]", "_", linea_codigo)


def features_desde_contexto_estrecho(ctx: dict) -> dict[str, float]:
    """Tabla del §2 del contrato / `modelo-local.provider.ts:83-91`."""
    mapa: dict[str, float] = {
        "paradasImprev7d": ctx["eventos7d"],
        "paradasImprev30d": ctx["eventos30d"],
        "desvioVelocidadTurnoPrevio": ctx["desvioVelocidadPct"],
        "oeeTurnoPrevio": ctx["oeeActual"],
        "turnoEsNoche": 1.0 if ctx.get("turno") == "N" else 0.0,
    }
    mapa[nombre_feature_linea(ctx["lineaCodigo"])] = 1.0
    return mapa


def vectorizar_por_nombre(features: dict[str, float] | None, nombres: list[str]) -> np.ndarray:
    """Diccionario nombrado → vector en el orden de `nombres`. Ausente → NaN
    (HistGB/LightGBM lo tratan de forma nativa; sklearn LogisticRegression
    necesita imputación, ver `dominio/modelo.py`)."""
    features = features or {}
    return np.array(
        [float(features[n]) if n in features and features[n] is not None else np.nan for n in nombres],
        dtype=float,
    )


def vector_desde_contexto(ctx: dict, nombres: list[str]) -> np.ndarray:
    """Punto de entrada de `/predict`: usa `ctx['features']` si viene, si no
    mapea el contexto estrecho (§2 del contrato)."""
    features = ctx.get("features")
    if features:
        return vectorizar_por_nombre(features, nombres)
    return vectorizar_por_nombre(features_desde_contexto_estrecho(ctx), nombres)
