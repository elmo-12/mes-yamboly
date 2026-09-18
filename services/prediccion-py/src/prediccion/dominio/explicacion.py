"""Explicabilidad de `/predict` (§5 del contrato): máximo 3 factores con
contribuciones positivas normalizadas a 100.

Se evita SHAP a propósito: con ~1.200 filas y un servicio que debe arrancar
rápido en un contenedor de 512 MB, la dependencia (llvmlite/numba) infla la
imagen y el tiempo de arranque sin ganancia medible sobre las dos
alternativas que el propio contrato acepta como válidas:

- `pred_contrib` nativo de LightGBM cuando el campeón es LightGBM (exacto,
  gratis: ya lo calcula el booster).
- Sustitución a la mediana para cualquier otro estimador (HistGB,
  LogisticRegression): la contribución de una feature es cuánto cambia la
  probabilidad al reemplazarla por su mediana de entrenamiento, manteniendo
  el resto del vector fijo.
"""

from __future__ import annotations

import numpy as np
from sklearn.pipeline import Pipeline

from .modelo import Candidato


def predecir_proba_binaria(candidato: Candidato, x: np.ndarray) -> float:
    """Probabilidad de la clase positiva para un único vector `x`."""
    fila = x.reshape(1, -1)
    est = candidato.estimador
    proba = est.predict_proba(fila)[0]
    # El índice de la clase 1 depende de `classes_`; con y binario 0/1
    # normalmente es el índice 1, pero se busca explícitamente por robustez.
    clases = list(est.classes_) if hasattr(est, "classes_") else [0, 1]
    idx = clases.index(1) if 1 in clases else len(clases) - 1
    return float(proba[idx])


def _es_lightgbm(candidato: Candidato) -> bool:
    return candidato.algoritmo == "LightGBM" and not isinstance(candidato.estimador, Pipeline)


def factores_lightgbm(candidato: Candidato, x: np.ndarray, nombres: list[str]) -> list[tuple[str, float]]:
    est = candidato.estimador
    booster = est.booster_
    fila = x.reshape(1, -1)
    contrib = booster.predict(fila, pred_contrib=True)
    fila_contrib = np.asarray(contrib)[0]
    # Última columna es el sesgo (bias); el resto son las `len(nombres)`
    # contribuciones por feature, en el mismo orden en que se entrenó.
    valores = fila_contrib[: len(nombres)]
    return list(zip(nombres, [float(v) for v in valores]))


def factores_sustitucion_mediana(
    candidato: Candidato,
    x: np.ndarray,
    nombres: list[str],
    medianas: np.ndarray,
) -> list[tuple[str, float]]:
    base = predecir_proba_binaria(candidato, x)
    contribuciones: list[tuple[str, float]] = []
    for j, nombre in enumerate(nombres):
        if np.isnan(x[j]) or x[j] == medianas[j]:
            contribuciones.append((nombre, 0.0))
            continue
        x_sustituido = x.copy()
        x_sustituido[j] = medianas[j]
        con_mediana = predecir_proba_binaria(candidato, x_sustituido)
        # Cuánto aporta la feature a *subir* la probabilidad respecto a
        # quitarla (llevarla a su valor típico).
        contribuciones.append((nombre, base - con_mediana))
    return contribuciones


def calcular_factores(
    candidato: Candidato,
    x: np.ndarray,
    nombres: list[str],
    medianas: np.ndarray,
    etiquetas: dict[str, str],
    maximo: int = 3,
) -> list[dict]:
    if _es_lightgbm(candidato):
        crudos = factores_lightgbm(candidato, x, nombres)
    else:
        crudos = factores_sustitucion_mediana(candidato, x, nombres, medianas)

    positivos = sorted((c for c in crudos if c[1] > 0), key=lambda c: c[1], reverse=True)[:maximo]
    total = sum(v for _, v in positivos)
    if total <= 0 or not positivos:
        return []

    factores = [
        {"texto": etiquetas.get(nombre, nombre), "contribucion": round((v / total) * 100)}
        for nombre, v in positivos
    ]
    # Corrige el redondeo para que la suma sea exactamente 100 (mismo truco
    # que `ModeloLocalPredictionProvider.normalizar`).
    suma = sum(f["contribucion"] for f in factores)
    if factores:
        factores[0]["contribucion"] += 100 - suma
    return factores
