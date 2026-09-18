"""Métricas de evaluación, portadas 1:1 desde
`apps/api/src/modules/analytics/modelado/metricas.ts`.

Son funciones puras sobre arrays `(y, p)`, sin dependencias de sklearn, para
que el resultado sea exactamente el mismo estadístico que usa Nest al
verificar `walkForward` y `pliegues[]`. PR-AUC (métrica primaria del
contrato) sí se apoya en scikit-learn porque el TS no lo necesitaba.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class MatrizConfusion:
    vp: int
    fp: int
    vn: int
    fn: int


@dataclass
class MetricasClasificacion:
    vp: int
    fp: int
    vn: int
    fn: int
    umbral: float
    precision: float
    recall: float
    f1: float
    auc: float
    brier: float
    exactitud: float


def matriz_confusion(y: np.ndarray, p: np.ndarray, umbral: float) -> MatrizConfusion:
    predicho = (p >= umbral).astype(int)
    y = y.astype(int)
    vp = int(np.sum((y == 1) & (predicho == 1)))
    fp = int(np.sum((y == 0) & (predicho == 1)))
    vn = int(np.sum((y == 0) & (predicho == 0)))
    fn = int(np.sum((y == 1) & (predicho == 0)))
    return MatrizConfusion(vp=vp, fp=fp, vn=vn, fn=fn)


def f1_desde(m: MatrizConfusion) -> float:
    precision = m.vp / (m.vp + m.fp) if (m.vp + m.fp) > 0 else 0.0
    recall = m.vp / (m.vp + m.fn) if (m.vp + m.fn) > 0 else 0.0
    return (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0


def auc(y: np.ndarray, p: np.ndarray) -> float:
    """AUC por el estadístico de Mann-Whitney con rangos promediados en los
    empates. Port literal de `auc()` en `metricas.ts`."""
    y = np.asarray(y, dtype=float)
    p = np.asarray(p, dtype=float)
    positivos = int(np.sum(y == 1))
    negativos = len(y) - positivos
    if positivos == 0 or negativos == 0:
        return 0.5

    indices = np.argsort(p, kind="stable")
    rangos = np.zeros(len(y))
    i = 0
    n = len(indices)
    while i < n:
        j = i
        while j + 1 < n and p[indices[j + 1]] == p[indices[i]]:
            j += 1
        rango_medio = (i + j) / 2 + 1
        for k in range(i, j + 1):
            rangos[indices[k]] = rango_medio
        i = j + 1

    suma_positivos = float(np.sum(rangos[y == 1]))
    return (suma_positivos - (positivos * (positivos + 1)) / 2) / (positivos * negativos)


def brier(y: np.ndarray, p: np.ndarray) -> float:
    if len(y) == 0:
        return 0.0
    y = np.asarray(y, dtype=float)
    p = np.asarray(p, dtype=float)
    return float(np.mean((p - y) ** 2))


def umbral_optimo_f1(y: np.ndarray, p: np.ndarray) -> float:
    """Recorre las probabilidades observadas (redondeadas a 3 decimales, como
    en el TS) y elige el umbral que maximiza F1. Nunca se fija en 0,5."""
    candidatos = sorted({round(float(v), 3) for v in p})
    if not candidatos:
        candidatos = [0.5]
    mejor = 0.5
    mejor_f1 = -1.0
    for umbral in candidatos:
        f1 = f1_desde(matriz_confusion(np.asarray(y), np.asarray(p), umbral))
        if f1 > mejor_f1:
            mejor_f1 = f1
            mejor = umbral
    return mejor


def evaluar(y: np.ndarray, p: np.ndarray, umbral: float) -> MetricasClasificacion:
    y = np.asarray(y, dtype=float)
    p = np.asarray(p, dtype=float)
    m = matriz_confusion(y, p, umbral)
    precision = m.vp / (m.vp + m.fp) if (m.vp + m.fp) > 0 else 0.0
    recall = m.vp / (m.vp + m.fn) if (m.vp + m.fn) > 0 else 0.0
    total = m.vp + m.fp + m.vn + m.fn
    return MetricasClasificacion(
        vp=m.vp,
        fp=m.fp,
        vn=m.vn,
        fn=m.fn,
        umbral=umbral,
        precision=precision,
        recall=recall,
        f1=(2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0,
        auc=auc(y, p),
        brier=brier(y, p),
        exactitud=(m.vp + m.vn) / total if total > 0 else 0.0,
    )


def lift_top_k(filas: list[dict], k: int = 3) -> float:
    """Lift de las `k` líneas más riesgosas por turno (`clave` agrupa,
    normalmente `f"{fecha}|{turno}"`). Port literal de `liftTopK`."""
    por_turno: dict[str, list[dict]] = {}
    for f in filas:
        por_turno.setdefault(f["clave"], []).append(f)

    aciertos = 0
    seleccionados = 0
    for lista in por_turno.values():
        top = sorted(lista, key=lambda f: f["p"], reverse=True)[:k]
        seleccionados += len(top)
        aciertos += sum(1 for f in top if f["y"] == 1)

    if seleccionados == 0:
        return 0.0
    base = sum(1 for f in filas if f["y"] == 1) / len(filas) if filas else 0.0
    if base <= 0:
        return 0.0
    return aciertos / seleccionados / base


# --------------------------------------------------------------------------
# Métricas adicionales requeridas por el contrato para regresión y multiclase
# (no existen en el TS porque Nest sólo evaluaba el binario).
# --------------------------------------------------------------------------


def mae(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean(np.abs(np.asarray(y, dtype=float) - np.asarray(p, dtype=float))))


def rmse(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.sqrt(np.mean((np.asarray(y, dtype=float) - np.asarray(p, dtype=float)) ** 2)))


def r2(y: np.ndarray, p: np.ndarray) -> float:
    y = np.asarray(y, dtype=float)
    p = np.asarray(p, dtype=float)
    ss_res = float(np.sum((y - p) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    if ss_tot <= 0:
        return 0.0
    return 1 - ss_res / ss_tot


def f1_macro(y: np.ndarray, p: np.ndarray, clases: list) -> float:
    y = np.asarray(y)
    p = np.asarray(p)
    f1s = []
    for c in clases:
        vp = int(np.sum((y == c) & (p == c)))
        fp = int(np.sum((y != c) & (p == c)))
        fn = int(np.sum((y == c) & (p != c)))
        precision = vp / (vp + fp) if (vp + fp) > 0 else 0.0
        recall = vp / (vp + fn) if (vp + fn) > 0 else 0.0
        f1s.append((2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0)
    return float(np.mean(f1s)) if f1s else 0.0


def accuracy(y: np.ndarray, p: np.ndarray) -> float:
    y = np.asarray(y)
    p = np.asarray(p)
    return float(np.mean(y == p)) if len(y) else 0.0


def top_k_accuracy(y: np.ndarray, proba: np.ndarray, clases: list, k: int = 2) -> float:
    """Fracción de casos donde la clase real está entre las `k` más probables."""
    y = np.asarray(y)
    if len(y) == 0:
        return 0.0
    indice_clase = {c: i for i, c in enumerate(clases)}
    aciertos = 0
    for i, real in enumerate(y):
        idx_real = indice_clase.get(real)
        if idx_real is None:
            continue
        orden = np.argsort(proba[i])[::-1][:k]
        if idx_real in orden:
            aciertos += 1
    return aciertos / len(y)
