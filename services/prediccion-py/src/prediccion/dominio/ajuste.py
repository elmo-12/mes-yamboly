"""Ajuste de hiperparámetros con validación temporal interna.

Cada candidato trae una rejilla pequeña (`Candidato.rejilla`). Dentro de cada
tramo de entrenamiento se prueba la rejilla con `TimeSeriesSplit` —las filas
llegan ordenadas por fecha y turno— y se reentrena con la mejor combinación
sobre el tramo completo. Los pliegues walk-forward con los que se evalúa al
candidato nunca intervienen en la elección, así que las métricas reportadas no
quedan infladas por la búsqueda.
"""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np
from sklearn.base import clone
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from threadpoolctl import threadpool_limits

from .modelo import Candidato

PLIEGUES_INTERNOS = 3
MINIMO_FILAS_AJUSTE = 120
"""Por debajo de esto los pliegues internos tendrían ~30 filas: no hay con
qué comparar combinaciones y se entrena con la configuración por defecto."""

PUNTUACION = {
    "binario": "average_precision",
    "multiclase": "f1_macro",
    # Igual que la regla de promoción de la API (RMSE). El MAE premia
    # predecir siempre 0 en un objetivo con 58 % de ceros.
    "regresion": "neg_root_mean_squared_error",
}


def ajustar(candidato: Candidato, X: np.ndarray, y: list, tipo: str) -> Any:
    """Devuelve el estimador del candidato ya entrenado sobre `X, y`."""
    estimador = clone(candidato.estimador)
    if not candidato.rejilla or len(y) < MINIMO_FILAS_AJUSTE:
        with threadpool_limits(limits=1):
            return estimador.fit(X, y)

    busqueda = GridSearchCV(
        estimador,
        candidato.rejilla,
        scoring=PUNTUACION[tipo],
        cv=TimeSeriesSplit(n_splits=PLIEGUES_INTERNOS),
        # Un pliegue interno con una sola clase no debe tumbar la búsqueda:
        # esa combinación queda sin puntaje y se elige entre las demás.
        error_score=np.nan,
        refit=False,
    )
    # Con ~1.000 filas, los hilos de OpenMP de HistGradientBoosting cuestan más
    # de lo que aportan y se pisan entre combinaciones: un hilo es más rápido.
    with warnings.catch_warnings(), threadpool_limits(limits=1):
        warnings.simplefilter("ignore")
        busqueda.fit(X, y)

    puntajes = np.asarray(busqueda.cv_results_["mean_test_score"], dtype=float)
    if np.all(np.isnan(puntajes)):
        return estimador.fit(X, y)
    mejores = busqueda.cv_results_["params"][int(np.nanargmax(puntajes))]
    with threadpool_limits(limits=1):
        return clone(candidato.estimador).set_params(**mejores).fit(X, y)
