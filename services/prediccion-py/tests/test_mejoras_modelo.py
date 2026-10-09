"""Regresión robusta, modelo en dos partes y ajuste temporal de hiperparámetros."""

from __future__ import annotations

import numpy as np
from sklearn.linear_model import LinearRegression, LogisticRegression

from prediccion.dominio.ajuste import ajustar
from prediccion.dominio.modelo import (
    Candidato,
    RegresorAcotado,
    RegresorDosPartes,
    _pipeline_lineal,
    candidatos_regresion,
)


def _datos_cero_inflados(n: int = 400, semilla: int = 3):
    rng = np.random.default_rng(semilla)
    X = rng.normal(size=(n, 4))
    hay_parada = rng.random(n) < 1 / (1 + np.exp(-1.5 * X[:, 0]))
    minutos = np.where(hay_parada, rng.exponential(60, n), 0.0)
    minutos[:3] = 900.0  # paradas extremas, como en el corpus real
    return X, minutos


def test_regresor_acotado_nunca_predice_negativo_ni_sobre_el_tope() -> None:
    X, y = _datos_cero_inflados()
    modelo = RegresorAcotado(LinearRegression()).fit(X, y)
    pred = modelo.predict(X * 50)  # fuera del rango visto: un lineal extrapolaría
    assert pred.min() >= 0.0
    assert pred.max() <= modelo.tope_ < 900.0


def test_dos_partes_sigue_la_probabilidad_de_parada() -> None:
    X, y = _datos_cero_inflados()
    modelo = RegresorDosPartes(_pipeline_lineal(LogisticRegression(max_iter=1000))).fit(X, y)
    alto = np.array([[3.0, 0, 0, 0]])
    bajo = np.array([[-3.0, 0, 0, 0]])
    assert modelo.predict(alto)[0] > modelo.predict(bajo)[0] >= 0.0


def test_dos_partes_sin_paradas_predice_cero() -> None:
    X = np.zeros((50, 2))
    modelo = RegresorDosPartes(_pipeline_lineal(LogisticRegression())).fit(X, np.zeros(50))
    assert np.all(modelo.predict(X) == 0.0)


def test_ajustar_elige_de_la_rejilla_y_entrena() -> None:
    X, y = _datos_cero_inflados()
    candidato = next(c for c in candidatos_regresion(42) if c.algoritmo == "LogisticaDosPartes")
    modelo = ajustar(candidato, X, list(y), "regresion")
    c = modelo.clasificador_.named_steps["modelo"].C
    assert c in candidato.rejilla["clasificador__modelo__C"]


def test_ajustar_sin_rejilla_o_con_pocas_filas_usa_la_configuracion_dada() -> None:
    X, y = _datos_cero_inflados(n=60)
    candidato = Candidato("x", RegresorAcotado(LinearRegression()), rejilla={"estimador__fit_intercept": [False]})
    modelo = ajustar(candidato, X, list(y), "regresion")
    assert modelo.estimador_.fit_intercept is True
