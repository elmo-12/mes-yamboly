"""Candidatos de modelo, calibración Platt e importancias (§3.3/3.4 del
contrato). Tres familias por objetivo: LightGBM, HistGradientBoosting*, y
LogisticRegression/Ridge de sklearn. Gana el mejor por PR-AUC (binarios) /
MAE (regresión) / F1-macro (multiclase).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

TipoObjetivo = Literal["binario", "regresion", "multiclase"]


@dataclass
class Candidato:
    algoritmo: str
    estimador: Any
    necesita_imputacion: bool = False


def _pipeline_lineal(base) -> Pipeline:
    """LogisticRegression/Ridge no aceptan NaN nativamente: se imputa con la
    mediana de entrenamiento y se estandariza, como haría cualquier pipeline
    lineal razonable con ~1.200 filas."""
    return Pipeline(
        steps=[
            ("imputar", SimpleImputer(strategy="median")),
            ("escalar", StandardScaler()),
            ("modelo", base),
        ]
    )


def candidatos_binario(semilla: int) -> list[Candidato]:
    return [
        Candidato(
            "LightGBM",
            LGBMClassifier(
                random_state=semilla,
                deterministic=True,
                force_row_wise=True,
                n_jobs=1,
                verbosity=-1,
                min_child_samples=5,
                importance_type="gain",
            ),
        ),
        Candidato(
            "HistGradientBoosting",
            HistGradientBoostingClassifier(random_state=semilla),
        ),
        Candidato(
            "LogisticRegression",
            _pipeline_lineal(LogisticRegression(max_iter=2000, random_state=semilla)),
        ),
    ]


def candidatos_regresion(semilla: int) -> list[Candidato]:
    return [
        Candidato(
            "LightGBM",
            LGBMRegressor(
                random_state=semilla,
                deterministic=True,
                force_row_wise=True,
                n_jobs=1,
                verbosity=-1,
                min_child_samples=5,
                importance_type="gain",
            ),
        ),
        Candidato(
            "HistGradientBoosting",
            HistGradientBoostingRegressor(random_state=semilla),
        ),
        Candidato(
            "Ridge",
            _pipeline_lineal(Ridge(random_state=semilla)),
        ),
    ]


def candidatos_multiclase(semilla: int) -> list[Candidato]:
    return [
        Candidato(
            "LightGBM",
            LGBMClassifier(
                random_state=semilla,
                deterministic=True,
                force_row_wise=True,
                n_jobs=1,
                verbosity=-1,
                min_child_samples=5,
                objective="multiclass",
                importance_type="gain",
            ),
        ),
        Candidato(
            "HistGradientBoosting",
            HistGradientBoostingClassifier(random_state=semilla),
        ),
        Candidato(
            "LogisticRegression",
            # `multi_class` se retiró de scikit-learn 1.7 (LogisticRegression
            # ya decide softmax multinomial automáticamente con `lbfgs`
            # cuando y tiene más de dos clases).
            _pipeline_lineal(LogisticRegression(max_iter=2000, random_state=semilla)),
        ),
    ]


def importancias(candidato: Candidato, nombres: list[str]) -> list[tuple[str, float]]:
    """Importancia bruta por feature, sin normalizar (se normaliza fuera)."""
    est = candidato.estimador
    if isinstance(est, Pipeline):
        modelo = est.named_steps["modelo"]
        if hasattr(modelo, "coef_"):
            coefs = np.abs(np.asarray(modelo.coef_))
            valores = coefs.mean(axis=0) if coefs.ndim > 1 else coefs
        else:
            valores = np.zeros(len(nombres))
    elif hasattr(est, "feature_importances_"):
        valores = np.asarray(est.feature_importances_, dtype=float)
    else:
        valores = np.zeros(len(nombres))
    return list(zip(nombres, [float(v) for v in valores]))


def normalizar_importancias(pares: list[tuple[str, float]], top: int | None = None) -> list[dict]:
    total = sum(max(v, 0.0) for _, v in pares)
    if total <= 0:
        return []
    normalizadas = sorted(
        ({"nombre": n, "importancia": round(max(v, 0.0) / total * 100, 4)} for n, v in pares),
        key=lambda d: d["importancia"],
        reverse=True,
    )
    if top is not None:
        normalizadas = normalizadas[:top]
    return normalizadas


# --------------------------------------------------------------------------
# Calibración Platt (§3.4): ajustada sobre las probabilidades fuera de
# muestra de los pliegues, no sobre el conjunto de prueba final. Se prefiere
# sobre la isotónica porque con ~1.200 filas ésta tiene demasiada varianza.
# --------------------------------------------------------------------------


@dataclass
class CalibradorPlatt:
    pendiente: float
    intercepto: float

    def aplicar(self, p_crudo: np.ndarray) -> np.ndarray:
        z = self._logit(p_crudo)
        return 1.0 / (1.0 + np.exp(-(self.pendiente * z + self.intercepto)))

    @staticmethod
    def _logit(p: np.ndarray) -> np.ndarray:
        p = np.clip(p, 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p))


def ajustar_platt(y: np.ndarray, p_crudo: np.ndarray, semilla: int) -> CalibradorPlatt:
    z = CalibradorPlatt._logit(np.asarray(p_crudo, dtype=float)).reshape(-1, 1)
    y = np.asarray(y, dtype=float)
    if len(set(y.tolist())) < 2:
        # Sin las dos clases en el pool fuera de muestra no hay nada que
        # calibrar: identidad (pendiente 1, intercepto 0 sobre el logit).
        return CalibradorPlatt(pendiente=1.0, intercepto=0.0)
    modelo = LogisticRegression(max_iter=1000, random_state=semilla)
    modelo.fit(z, y)
    return CalibradorPlatt(pendiente=float(modelo.coef_[0][0]), intercepto=float(modelo.intercept_[0]))
