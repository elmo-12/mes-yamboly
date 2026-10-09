"""Candidatos de modelo, calibración Platt e importancias (§3.3/3.4 del
contrato). Tres familias por objetivo: LightGBM, HistGradientBoosting*, y
LogisticRegression/Ridge de sklearn. Gana el mejor por PR-AUC (binarios) /
RMSE (regresión) / F1-macro (multiclase).

Cada candidato trae una `rejilla` pequeña de hiperparámetros que
`ajuste.ajustar()` elige con validación temporal *dentro* del tramo de
entrenamiento: así la regularización se adapta a cada objetivo sin mirar los
pliegues con los que después se evalúa.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.base import BaseEstimator, RegressorMixin, clone
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

TipoObjetivo = Literal["binario", "regresion", "multiclase"]


@dataclass
class Candidato:
    algoritmo: str
    estimador: Any
    necesita_imputacion: bool = False
    rejilla: dict[str, list] | None = None
    """Hiperparámetros a elegir con validación temporal interna (`ajuste.py`).
    `None` = se entrena tal cual (p. ej. el campeón archivado, que se
    reevalúa con su configuración original)."""


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


class RegresorAcotado(BaseEstimator, RegressorMixin):
    """Regresor para objetivos con muchos ceros y cola larga (minutos de parada).

    Entrena con el objetivo recortado en el percentil `percentil` del tramo de
    entrenamiento y acota la predicción a `[0, tope]`. Sin esto, un puñado de
    turnos con 400–900 min arrastra a los modelos de error cuadrático y los
    lineales extrapolan valores absurdos en los pliegues cortos (Ridge llegó a
    RMSE de 1 233 min con R² de −339 en el corpus v1.2)."""

    def __init__(self, estimador: Any = None, percentil: float = 99.0) -> None:
        self.estimador = estimador
        self.percentil = percentil

    def fit(self, X, y):
        y = np.asarray(y, dtype=float)
        self.tope_ = float(np.percentile(y, self.percentil)) if len(y) else 0.0
        self.estimador_ = clone(self.estimador).fit(X, np.minimum(y, self.tope_))
        return self

    def predict(self, X):
        return np.clip(self.estimador_.predict(X), 0.0, self.tope_)


class RegresorDosPartes(BaseEstimator, RegressorMixin):
    """Modelo en dos partes (*hurdle*) para minutos de parada:
    E[minutos] = P(minutos > 0) × duración media de los turnos con parada.

    La probabilidad la estima un clasificador lineal y la duración es la media
    del tramo de entrenamiento recortada en el percentil `percentil`. Con un
    objetivo que es 0 en la mayoría de los turnos, un modelo lineal directo
    (Ridge) no puede representar a la vez los ceros y la cola larga."""

    def __init__(self, clasificador: Any = None, percentil: float = 99.0) -> None:
        self.clasificador = clasificador
        self.percentil = percentil

    def fit(self, X, y):
        y = np.asarray(y, dtype=float)
        positivos = y > 0
        self.tope_ = float(np.percentile(y[positivos], self.percentil)) if positivos.any() else 0.0
        self.duracion_media_ = float(np.minimum(y[positivos], self.tope_).mean()) if positivos.any() else 0.0
        if positivos.all() or not positivos.any():
            self.clasificador_ = None
            self.tasa_ = float(positivos.mean()) if len(y) else 0.0
        else:
            self.clasificador_ = clone(self.clasificador).fit(X, positivos.astype(int))
        return self

    def predict(self, X):
        if self.clasificador_ is None:
            p = np.full(len(X), self.tasa_)
        else:
            p = self.clasificador_.predict_proba(X)[:, 1]
        return np.clip(p * self.duracion_media_, 0.0, self.tope_)


def _lgbm_base(semilla: int) -> dict[str, Any]:
    """Configuración común de LightGBM: pocas hojas, submuestreo y L2. Con
    ~1.100 filas el LightGBM por defecto (31 hojas, 5 muestras por hoja)
    sobreajusta y quedaba por debajo de la regresión logística."""
    return dict(
        random_state=semilla,
        deterministic=True,
        force_row_wise=True,
        n_jobs=1,
        verbosity=-1,
        n_estimators=200,
        learning_rate=0.03,
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.7,
        reg_lambda=5.0,
        importance_type="gain",
    )


REJILLA_LGBM = {"num_leaves": [4, 8, 16], "min_child_samples": [20, 40]}
REJILLA_HGB = {"max_depth": [2, 3, 4], "min_samples_leaf": [20, 40]}


def _hgb_base(semilla: int) -> dict[str, Any]:
    return dict(learning_rate=0.05, max_iter=200, l2_regularization=1.0, random_state=semilla)


def candidatos_binario(semilla: int) -> list[Candidato]:
    return [
        Candidato("LightGBM", LGBMClassifier(**_lgbm_base(semilla)), rejilla=REJILLA_LGBM),
        Candidato(
            "HistGradientBoosting",
            HistGradientBoostingClassifier(**_hgb_base(semilla)),
            rejilla=REJILLA_HGB,
        ),
        Candidato(
            "LogisticRegression",
            # `l1_ratio` = 1 es L1 (descarta variables sin señal, que con 40
            # variables y ~1.100 filas son la mayoría) y 0 es L2. liblinear
            # admite ambos extremos y es determinista con la semilla.
            _pipeline_lineal(LogisticRegression(solver="liblinear", max_iter=2000, random_state=semilla)),
            rejilla={"modelo__C": [0.03, 0.1, 0.3, 1.0], "modelo__l1_ratio": [0.0, 1.0]},
        ),
    ]


def candidatos_regresion(semilla: int) -> list[Candidato]:
    return [
        Candidato(
            "LightGBM",
            # Pérdida de Huber: cuadrática cerca del centro y lineal en la cola,
            # menos sensible a los turnos con paradas muy largas.
            RegresorAcotado(LGBMRegressor(**_lgbm_base(semilla), objective="huber", alpha=60.0)),
            rejilla={f"estimador__{k}": v for k, v in REJILLA_LGBM.items()},
        ),
        Candidato(
            "HistGradientBoosting",
            # Pérdida de Poisson: adecuada para un conteo de minutos no negativo
            # con muchos ceros.
            RegresorAcotado(HistGradientBoostingRegressor(**_hgb_base(semilla), loss="poisson")),
            rejilla={f"estimador__{k}": v for k, v in REJILLA_HGB.items()},
        ),
        Candidato(
            # Sustituye a Ridge, que en el corpus v1.2 extrapolaba valores
            # absurdos en los pliegues cortos (R² de −339 sin acotar y de
            # −0.40 acotado).
            "LogisticaDosPartes",
            RegresorDosPartes(
                _pipeline_lineal(LogisticRegression(solver="liblinear", max_iter=2000, random_state=semilla))
            ),
            rejilla={"clasificador__modelo__C": [0.03, 0.1, 0.3, 1.0], "clasificador__modelo__l1_ratio": [0.0, 1.0]},
        ),
    ]


def candidatos_multiclase(semilla: int) -> list[Candidato]:
    return [
        Candidato(
            "LightGBM",
            # Sin `objective` explícito a propósito: LGBMClassifier elige
            # solo `multiclass` con >2 clases y `binary` con 2. Forzar
            # "multiclass" rompe un pliegue walk-forward que solo vio 2
            # clases ("Number of classes should be specified and greater
            # than 1 for multiclass training").
            LGBMClassifier(**_lgbm_base(semilla)),
            rejilla=REJILLA_LGBM,
        ),
        Candidato(
            "HistGradientBoosting",
            HistGradientBoostingClassifier(**_hgb_base(semilla)),
            rejilla=REJILLA_HGB,
        ),
        Candidato(
            "LogisticRegression",
            # `multi_class` se retiró de scikit-learn 1.7 (LogisticRegression
            # ya decide softmax multinomial automáticamente con `lbfgs`
            # cuando y tiene más de dos clases).
            _pipeline_lineal(LogisticRegression(max_iter=2000, random_state=semilla)),
            rejilla={"modelo__C": [0.03, 0.1, 0.3, 1.0]},
        ),
    ]


def estimador_base(est: Any) -> Any:
    """El estimador que realmente lleva coeficientes o importancias."""
    if isinstance(est, RegresorAcotado):
        est = getattr(est, "estimador_", est.estimador)
    if isinstance(est, RegresorDosPartes):
        est = getattr(est, "clasificador_", None) or est.clasificador
    if isinstance(est, Pipeline):
        est = est.named_steps["modelo"]
    return est


def importancias(
    candidato: Candidato,
    nombres: list[str],
    X: np.ndarray | None = None,
    y: list | None = None,
    semilla: int = 0,
) -> list[tuple[str, float]]:
    """Importancia bruta por feature, sin normalizar (se normaliza fuera).

    HistGradientBoosting no expone importancias propias: con `X, y` se usa la
    importancia por permutación sobre el tramo de entrenamiento."""
    est = candidato.estimador
    if isinstance(est, RegresorAcotado):
        est = getattr(est, "estimador_", est.estimador)
    if isinstance(est, RegresorDosPartes):
        est = getattr(est, "clasificador_", None) or est.clasificador
    if isinstance(est, Pipeline):
        modelo = est.named_steps["modelo"]
        if hasattr(modelo, "coef_"):
            coefs = np.abs(np.asarray(modelo.coef_))
            valores = coefs.mean(axis=0) if coefs.ndim > 1 else coefs
        else:
            valores = np.zeros(len(nombres))
    elif hasattr(est, "feature_importances_"):
        valores = np.asarray(est.feature_importances_, dtype=float)
    elif X is not None and y is not None and len(y):
        from sklearn.inspection import permutation_importance

        resultado = permutation_importance(candidato.estimador, X, y, n_repeats=5, random_state=semilla)
        valores = np.asarray(resultado.importances_mean, dtype=float)
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
