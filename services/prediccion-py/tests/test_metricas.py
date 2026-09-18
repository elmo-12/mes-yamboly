from __future__ import annotations

import numpy as np

from prediccion.dominio.metricas import auc, brier, evaluar, lift_top_k, umbral_optimo_f1


def test_auc_orden_perfecto() -> None:
    y = np.array([0, 0, 1, 1])
    p = np.array([0.1, 0.2, 0.8, 0.9])
    assert auc(y, p) == 1.0


def test_auc_orden_invertido() -> None:
    y = np.array([0, 0, 1, 1])
    p = np.array([0.9, 0.8, 0.2, 0.1])
    assert auc(y, p) == 0.0


def test_auc_con_empates_es_mann_whitney() -> None:
    # Un positivo y un negativo empatados en la misma probabilidad cuentan
    # como 0.5 de acierto (rango promediado), no 0 ni 1.
    y = np.array([0, 1])
    p = np.array([0.5, 0.5])
    assert auc(y, p) == 0.5


def test_auc_sin_una_clase_es_neutro() -> None:
    assert auc(np.array([1, 1, 1]), np.array([0.2, 0.5, 0.9])) == 0.5
    assert auc(np.array([0, 0]), np.array([0.2, 0.5])) == 0.5


def test_brier_perfecto_es_cero() -> None:
    assert brier(np.array([1, 0]), np.array([1.0, 0.0])) == 0.0


def test_umbral_optimo_f1_recorre_probabilidades_observadas() -> None:
    y = np.array([0, 0, 0, 1, 1])
    p = np.array([0.1, 0.2, 0.3, 0.9, 0.95])
    umbral = umbral_optimo_f1(y, p)
    assert umbral in {round(v, 3) for v in p}


def test_evaluar_matriz_confusion() -> None:
    y = np.array([1, 1, 0, 0])
    p = np.array([0.9, 0.4, 0.6, 0.1])
    m = evaluar(y, p, 0.5)
    assert (m.vp, m.fp, m.vn, m.fn) == (1, 1, 1, 1)
    assert abs(m.precision - 0.5) < 1e-9
    assert abs(m.recall - 0.5) < 1e-9


def test_lift_top_k_agrupa_por_clave() -> None:
    filas = [
        {"clave": "t1", "y": 1, "p": 0.9},
        {"clave": "t1", "y": 0, "p": 0.1},
        {"clave": "t2", "y": 0, "p": 0.8},
        {"clave": "t2", "y": 1, "p": 0.2},
    ]
    lift = lift_top_k(filas, k=1)
    # De 2 seleccionados (uno por turno), 1 acierta; tasa base = 2/4 = 0.5.
    assert lift == (1 / 2) / 0.5
