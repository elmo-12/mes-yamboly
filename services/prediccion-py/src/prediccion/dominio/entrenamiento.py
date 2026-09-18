"""Orquestación de `/entrenar` (§3 del contrato): walk-forward con `repartir()`
portado, comparación de 3 candidatos por objetivo, calibración Platt,
explicabilidad y empaquetado del artefacto final.

Este módulo es puro respecto a I/O de disco: recibe `muestras` ya validadas
y devuelve el resultado + el bundle a persistir. `api/rutas_entrenar.py` es
quien llama a `registro/artefactos.py` y `registro/registro.py`.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sklearn.base import clone
from sklearn.metrics import average_precision_score

from .dataset import PLIEGUES, dias_unicos_ordenados, repartir
from .metricas import (
    accuracy,
    evaluar,
    f1_macro,
    lift_top_k,
    mae,
    r2,
    rmse,
    top_k_accuracy,
    umbral_optimo_f1,
)
from .modelo import (
    Candidato,
    CalibradorPlatt,
    ajustar_platt,
    candidatos_binario,
    candidatos_multiclase,
    candidatos_regresion,
    importancias,
    normalizar_importancias,
)

MINIMO_FILAS_PLIEGUE = 10
MINIMO_EJEMPLOS_POR_CLASE = 2
"""Cada clase presente en el tramo de entrenamiento de un pliegue debe tener
al menos esta cantidad de ejemplos; una clase con un único ejemplo no deja
nada que aprender y, en LightGBM multiclase, puede degenerar en el error
"Number of classes should be ... greater than 1" si termina siendo la única
clase vista en ese fit."""


class ObjetivoNoEntrenable(Exception):
    """Señal explícita (no un crash) de que un objetivo no se pudo entrenar
    con los datos de hoy — típicamente `causa_dominante` cuando la mayoría de
    los turnos no tuvo parada imprevista y el target queda `null`, dejando
    menos de 2 clases distintas en los tramos de entrenamiento walk-forward.
    `api/rutas_entrenar.py` la captura por objetivo y sigue con los demás
    (aislamiento §3 del contrato): nunca debe escapar como un 500 que se
    lleve por delante a los otros tres objetivos.
    """


class TodosLosObjetivosFallaron(Exception):
    """Los `objetivos` pedidos fallaron todos (por `ObjetivoNoEntrenable` o
    por cualquier otro error aislado). Es el único caso en el que `/entrenar`
    responde 500 en vez de 200 con bloques `{"error": ...}` (§3 del
    contrato)."""

    def __init__(self, resultados: dict[str, dict[str, Any]]) -> None:
        self.resultados = resultados
        resumen = "; ".join(f"{obj}: {info.get('error')}" for obj, info in resultados.items())
        super().__init__(f"Todos los objetivos fallaron: {resumen}")


@dataclass
class BundleModelo:
    """Lo que se serializa en el `.joblib`."""

    objetivo: str
    version: str
    tipo: str
    algoritmo: str
    estimador: Any
    nombres: list[str]
    medianas: list[float]
    calibrador: CalibradorPlatt | None
    umbral: float
    clases: list[Any] | None
    hiperparametros: dict[str, Any]
    entrenado_en: str
    etiquetas: dict[str, str] = field(default_factory=dict)


@dataclass
class ResultadoObjetivo:
    respuesta: dict[str, Any]
    bundle: BundleModelo


def _vectorizar_matriz(muestras: list[dict], nombres: list[str]) -> np.ndarray:
    filas = []
    for m in muestras:
        f = m.get("features") or {}
        filas.append([float(f[n]) if n in f and f[n] is not None else np.nan for n in nombres])
    return np.array(filas, dtype=float) if filas else np.zeros((0, len(nombres)))


def _medianas(X: np.ndarray) -> np.ndarray:
    if X.size == 0:
        return np.zeros(X.shape[1] if X.ndim > 1 else 0)
    with np.errstate(invalid="ignore"):
        med = np.nanmedian(X, axis=0)
    return np.nan_to_num(med, nan=0.0)


def _proba_positiva(estimador: Any, X: np.ndarray) -> np.ndarray:
    proba = estimador.predict_proba(X)
    clases = list(estimador.classes_)
    idx = clases.index(1) if 1 in clases else len(clases) - 1
    return proba[:, idx]


def _hiperparametros(estimador: Any) -> dict[str, Any]:
    from sklearn.pipeline import Pipeline

    base = estimador.named_steps["modelo"] if isinstance(estimador, Pipeline) else estimador
    parametros = base.get_params()
    limpio = {}
    for k, v in parametros.items():
        if isinstance(v, (int, float, str, bool)) or v is None:
            limpio[k] = v
    return limpio


def _generar_pliegues(dias: list[str]) -> tuple[list[list[str]], int]:
    n = PLIEGUES + 1
    if len(dias) < n:
        return [], n
    return repartir(dias, n), n


def _entrenar_walkforward(
    muestras: list[dict],
    nombres: list[str],
    columna_target: str,
    candidatos: list[Candidato],
    tipo: str,
    extra: dict[str, Candidato] | None = None,
) -> tuple[dict[str, dict[str, list]], list[dict]]:
    """Ejecuta el walk-forward para los 3 candidatos a la vez (mismos
    pliegues), devolviendo el pool fuera de muestra de cada uno y los
    pliegues realmente usados (los que `Nest` compara).

    `extra` permite colar candidatos adicionales (p. ej. el campeón
    reconstruido para `campeonReevaluado`, §3.2 del contrato) **en el mismo
    bucle**, así se garantiza por construcción que usan exactamente los
    mismos pliegues que los candidatos principales — no una segunda pasada
    que podría, en teoría, divergir. Se indexan por una clave propia (no por
    `algoritmo`) para no chocar si el campeón resulta ser de la misma familia
    que uno de los tres candidatos.
    """
    dias = dias_unicos_ordenados([m["fecha"] for m in muestras])
    bloques, _n = _generar_pliegues(dias)
    pools: dict[str, dict[str, list]] = {c.algoritmo: {"y": [], "p": [], "filas": []} for c in candidatos}
    extra = extra or {}
    for clave in extra:
        pools[clave] = {"y": [], "p": [], "filas": []}
    pliegues_usados: list[dict] = []

    for k in range(PLIEGUES):
        if k + 1 >= len(bloques) or not bloques[k] or not bloques[k + 1]:
            continue
        hasta = bloques[k][-1]
        bloque_val = bloques[k + 1]
        prueba_set = set(bloque_val)
        entrenamiento = [m for m in muestras if m["fecha"] <= hasta]
        validacion = [m for m in muestras if m["fecha"] in prueba_set]
        if len(entrenamiento) < MINIMO_FILAS_PLIEGUE or not validacion:
            continue
        y_train = [m[columna_target] for m in entrenamiento]

        if tipo in ("binario", "multiclase"):
            # No basta con "al menos 2 clases distintas": una clase con un
            # único ejemplo no deja nada que aprender y, en LightGBM
            # multiclase, puede degenerar en fitear con una sola clase
            # efectiva. Se exige un mínimo de ejemplos por clase (excluidos
            # los `null`, que son el caso real de `causa_dominante` con la
            # mayoría de turnos sin parada imprevista).
            conteo = Counter(v for v in y_train if v is not None)
            if len(conteo) < 2 or min(conteo.values()) < MINIMO_EJEMPLOS_POR_CLASE:
                continue
        elif tipo == "regresion":
            # Varianza cero: el pliegue no aporta nada que evaluar y algunos
            # regresores (LightGBM incluido) pueden comportarse mal con un
            # target constante. Se salta en vez de arriesgar una excepción.
            valores = [v for v in y_train if v is not None]
            if len(valores) < 2 or float(np.var(valores)) == 0.0:
                continue

        X_train = _vectorizar_matriz(entrenamiento, nombres)
        X_val = _vectorizar_matriz(validacion, nombres)
        y_val = [m[columna_target] for m in validacion]

        pliegues_usados.append(
            {
                "entrenamientoHasta": hasta,
                "validacionDesde": min(bloque_val),
                "validacionHasta": max(bloque_val),
            }
        )

        for clave, cand in [*((c.algoritmo, c) for c in candidatos), *extra.items()]:
            modelo = clone(cand.estimador)
            modelo.fit(X_train, y_train)
            if tipo == "binario":
                p = _proba_positiva(modelo, X_val).tolist()
            elif tipo == "multiclase":
                p = modelo.predict(X_val).tolist()
            else:
                p = modelo.predict(X_val).tolist()
            pool = pools[clave]
            pool["y"].extend(y_val)
            pool["p"].extend(p)
            pool["filas"].extend(validacion)

    return pools, pliegues_usados


CLAVE_CAMPEON = "__campeon__"


def _reconstruir_candidato_campeon(algoritmo: str, hiperparametros: dict[str, Any], semilla: int) -> Candidato | None:
    """Reconstruye la configuración del campeón archivado (`campeon.algoritmo`
    + `campeon.hiperparametros`, §3.2) sobre una de nuestras tres familias
    binarias. No adivina: si el nombre no encaja con ninguna, devuelve
    `None` — el llamador debe registrar el motivo en vez de fallar la
    corrida."""
    nombre = (algoritmo or "").strip().lower()
    if not nombre:
        return None

    familia = None
    for candidato in candidatos_binario(semilla):
        if candidato.algoritmo.lower() in nombre:
            familia = candidato
            break
    if familia is None:
        return None

    estimador = clone(familia.estimador)
    from sklearn.pipeline import Pipeline

    if isinstance(estimador, Pipeline):
        aceptados = set(estimador.named_steps["modelo"].get_params().keys())
        filtrados = {f"modelo__{k}": v for k, v in (hiperparametros or {}).items() if k in aceptados}
    else:
        aceptados = set(estimador.get_params().keys())
        filtrados = {k: v for k, v in (hiperparametros or {}).items() if k in aceptados}
    if filtrados:
        estimador.set_params(**filtrados)

    return Candidato(algoritmo=familia.algoritmo, estimador=estimador)


def _calibrar_y_evaluar_binario(
    y_oof: np.ndarray, p_oof_crudo: np.ndarray, semilla: int
) -> tuple[dict[str, Any], float, CalibradorPlatt, np.ndarray]:
    """Calibración Platt + umbral óptimo F1 + métricas walk-forward, sobre un
    pool fuera de muestra ya construido. Es el mismo protocolo tanto para el
    candidato campeón de esta corrida como para `campeonReevaluado` (§3.2):
    se factoriza aquí precisamente para que no puedan divergir por accidente.
    """
    if len(y_oof) == 0:
        vacio = evaluar(np.array([]), np.array([]), 0.5)
        walkforward = {
            "vp": vacio.vp,
            "fp": vacio.fp,
            "vn": vacio.vn,
            "fn": vacio.fn,
            "umbral": round(vacio.umbral, 4),
            "precision": round(vacio.precision, 4),
            "recall": round(vacio.recall, 4),
            "f1": round(vacio.f1, 4),
            "aucRoc": round(vacio.auc, 4),
            "brier": round(vacio.brier, 4),
            "prAuc": 0.0,
        }
        return walkforward, 0.5, CalibradorPlatt(1.0, 0.0), p_oof_crudo

    calibrador = ajustar_platt(y_oof, p_oof_crudo, semilla)
    p_oof_cal = calibrador.aplicar(p_oof_crudo)
    umbral = umbral_optimo_f1(y_oof, p_oof_cal)
    metricas_wf = evaluar(y_oof, p_oof_cal, umbral)
    pr_auc = (
        float(average_precision_score(y_oof, p_oof_cal)) if len(set(y_oof.tolist())) > 1 else 0.0
    )
    walkforward = {
        "vp": metricas_wf.vp,
        "fp": metricas_wf.fp,
        "vn": metricas_wf.vn,
        "fn": metricas_wf.fn,
        "umbral": round(metricas_wf.umbral, 4),
        "precision": round(metricas_wf.precision, 4),
        "recall": round(metricas_wf.recall, 4),
        "f1": round(metricas_wf.f1, 4),
        "aucRoc": round(metricas_wf.auc, 4),
        "brier": round(metricas_wf.brier, 4),
        "prAuc": round(pr_auc, 4),
    }
    return walkforward, float(umbral), calibrador, p_oof_cal


def _split_prueba(muestras: list[dict], prueba_desde: str) -> tuple[list[dict], list[dict], str, str]:
    dias = dias_unicos_ordenados([m["fecha"] for m in muestras])
    anteriores = [d for d in dias if d < prueba_desde]
    corte_entrenamiento = anteriores[-1] if anteriores else (dias[0] if dias else "")
    corte_prueba = dias[-1] if dias else ""
    entrenamiento = [m for m in muestras if m["fecha"] < prueba_desde]
    prueba = [m for m in muestras if m["fecha"] >= prueba_desde]
    return entrenamiento, prueba, corte_entrenamiento, corte_prueba


def _auc_simple(y: list, p: list) -> float:
    from .metricas import auc as auc_fn

    if not y or len(set(y)) < 2:
        return 0.5
    return auc_fn(np.array(y, dtype=float), np.array(p, dtype=float))


def entrenar_binario(
    objetivo: str,
    version: str,
    columna_target: str,
    muestras_anticipado: list[dict],
    muestras_retro: list[dict],
    nombres: list[str],
    nombres_retro: list[str],
    prueba_desde: str,
    semilla: int,
    etiquetas: dict[str, str],
    campeon: dict[str, Any] | None = None,
) -> ResultadoObjetivo:
    candidatos = candidatos_binario(semilla)

    candidato_campeon: Candidato | None = None
    motivo_campeon: str | None = None
    if campeon is not None:
        candidato_campeon = _reconstruir_candidato_campeon(
            campeon.get("algoritmo", ""), campeon.get("hiperparametros") or {}, semilla
        )
        if candidato_campeon is None:
            motivo_campeon = f"algoritmo de campeón no reconocido: {campeon.get('algoritmo')!r}"

    extra = {CLAVE_CAMPEON: candidato_campeon} if candidato_campeon is not None else None
    pools, pliegues_usados = _entrenar_walkforward(
        muestras_anticipado, nombres, columna_target, candidatos, "binario", extra=extra
    )
    if not pliegues_usados:
        raise ObjetivoNoEntrenable(
            "sin pliegues walk-forward utilizables: ningún tramo de entrenamiento tuvo "
            f"las {MINIMO_EJEMPLOS_POR_CLASE} muestras mínimas de cada clase en `{columna_target}`"
        )

    mejor_algoritmo = None
    mejor_pr_auc = -1.0
    metricas_por_candidato: dict[str, float] = {}
    for algoritmo, pool in pools.items():
        if algoritmo == CLAVE_CAMPEON:
            continue  # el campeón reconstruido no compite por el título: se reporta aparte
        if not pool["y"] or len(set(pool["y"])) < 2:
            metricas_por_candidato[algoritmo] = 0.0
            continue
        pr = average_precision_score(pool["y"], pool["p"])
        metricas_por_candidato[algoritmo] = float(pr)
        if pr > mejor_pr_auc:
            mejor_pr_auc = pr
            mejor_algoritmo = algoritmo

    if mejor_algoritmo is None:
        mejor_algoritmo = candidatos[0].algoritmo

    pool_campeon = pools[mejor_algoritmo]
    y_oof = np.array(pool_campeon["y"], dtype=float)
    p_oof_crudo = np.array(pool_campeon["p"], dtype=float)
    walkforward_dict, umbral, calibrador, p_oof_cal = _calibrar_y_evaluar_binario(y_oof, p_oof_crudo, semilla)

    # `campeonReevaluado` (§3.2): mismo protocolo (mismos pliegues, arriba;
    # misma calibración/umbral, aquí) aplicado al campeón archivado en vez
    # de al candidato. Si `campeon` era `None` (primera corrida) o su
    # algoritmo no se reconoció, queda `None` con el motivo documentado.
    campeon_reevaluado: dict[str, Any] | None = None
    if candidato_campeon is not None:
        pool_c = pools[CLAVE_CAMPEON]
        if pool_c["y"]:
            y_oof_c = np.array(pool_c["y"], dtype=float)
            p_oof_crudo_c = np.array(pool_c["p"], dtype=float)
            walkforward_campeon, _umbral_c, _cal_c, _p_c = _calibrar_y_evaluar_binario(
                y_oof_c, p_oof_crudo_c, semilla
            )
            campeon_reevaluado = {
                "version": campeon.get("version") if campeon else None,
                "algoritmo": candidato_campeon.algoritmo,
                "walkForward": walkforward_campeon,
            }
        else:
            motivo_campeon = "sin datos suficientes para reevaluar al campeón con los pliegues de hoy"

    filas_lift = [
        {"clave": f"{f['fecha']}|{f['turno']}", "y": y, "p": p}
        for f, y, p in zip(pool_campeon["filas"], pool_campeon["y"], p_oof_cal.tolist())
    ]
    lift_top3 = round(lift_top_k(filas_lift, 3), 2)

    fuera = [
        {
            "lineaId": f["lineaId"],
            "lineaCodigo": f["lineaCodigo"],
            "fecha": f["fecha"],
            "turno": f["turno"],
            "y": int(y),
            "p": round(float(p), 4),
            "minutosImprevistos": f.get("minutosImprevistos", 0.0),
        }
        for f, y, p in zip(pool_campeon["filas"], pool_campeon["y"], p_oof_cal.tolist())
    ]

    entrenamiento, prueba, corte_entrenamiento, corte_prueba = _split_prueba(muestras_anticipado, prueba_desde)
    candidato_final = next(c for c in candidatos_binario(semilla) if c.algoritmo == mejor_algoritmo)
    modelo_final = clone(candidato_final.estimador)
    base_final = entrenamiento or muestras_anticipado
    y_train_full = [m[columna_target] for m in base_final]
    X_train_full = _vectorizar_matriz(base_final, nombres)
    # Igual que en cada pliegue: el refit final que se persiste como
    # artefacto no puede recibir un target de una sola clase (sea porque
    # `pruebaDesde` cae antes de que aparezca la segunda clase, o por
    # cualquier otra razón). Con al menos un pliegue walk-forward exitoso
    # (comprobado arriba) esto es infrecuente, pero no está garantizado —
    # `pruebaDesde` no tiene por qué alinearse con los cortes de `repartir()`.
    if len({v for v in y_train_full if v is not None}) < 2:
        raise ObjetivoNoEntrenable(
            f"el conjunto de entrenamiento final (hasta `pruebaDesde`) tiene una sola clase en `{columna_target}`"
        )
    modelo_final.fit(X_train_full, y_train_full)

    if prueba:
        X_prueba = _vectorizar_matriz(prueba, nombres)
        y_prueba = [m[columna_target] for m in prueba]
        p_prueba = _proba_positiva(modelo_final, X_prueba).tolist()
        auc_prueba = _auc_simple(y_prueba, p_prueba)
    else:
        auc_prueba = 0.5

    # aucRetro: techo del modelo si se permitiera usar features retrospectivas
    # (fuga intencional para medir cuánto se pierde por el guardarraíl §3).
    auc_retro = auc_prueba
    if muestras_retro:
        entrenamiento_r = [m for m in muestras_retro if m["fecha"] < prueba_desde]
        prueba_r = [m for m in muestras_retro if m["fecha"] >= prueba_desde]
        if entrenamiento_r and prueba_r and len({m[columna_target] for m in entrenamiento_r}) > 1:
            modelo_retro = clone(candidato_final.estimador)
            modelo_retro.fit(_vectorizar_matriz(entrenamiento_r, nombres_retro), [m[columna_target] for m in entrenamiento_r])
            p_retro = _proba_positiva(modelo_retro, _vectorizar_matriz(prueba_r, nombres_retro)).tolist()
            auc_retro = _auc_simple([m[columna_target] for m in prueba_r], p_retro)

    pares_importancia = importancias(Candidato(algoritmo=mejor_algoritmo, estimador=modelo_final), nombres)
    importancias_norm = normalizar_importancias(pares_importancia)

    alternativas = [
        {"algoritmo": alg, "prAuc": round(valor, 4)}
        for alg, valor in sorted(metricas_por_candidato.items(), key=lambda kv: kv[1], reverse=True)
        if alg != mejor_algoritmo
    ]

    medianas = _medianas(X_train_full)

    respuesta = {
        "algoritmo": mejor_algoritmo,
        "hiperparametros": _hiperparametros(candidato_final.estimador),
        "muestras": len(muestras_anticipado),
        "features": len(nombres),
        "tasaPositivos": round(sum(1 for m in muestras_anticipado if m[columna_target] == 1) / len(muestras_anticipado), 4)
        if muestras_anticipado
        else 0.0,
        "walkForward": walkforward_dict,
        "aucPrueba": round(auc_prueba, 4),
        "aucRetro": round(auc_retro, 4),
        "liftTop3": lift_top3,
        "corteEntrenamiento": corte_entrenamiento,
        "cortePrueba": corte_prueba,
        "pliegues": pliegues_usados,
        "importancias": importancias_norm,
        "fuera": fuera,
        "alternativas": alternativas,
        "campeonReevaluado": campeon_reevaluado,
    }
    if motivo_campeon is not None:
        respuesta["campeonReevaluadoMotivo"] = motivo_campeon

    bundle = BundleModelo(
        objetivo=objetivo,
        version=version,
        tipo="binario",
        algoritmo=mejor_algoritmo,
        estimador=modelo_final,
        nombres=nombres,
        medianas=medianas.tolist(),
        calibrador=calibrador,
        umbral=float(umbral),
        clases=[0, 1],
        hiperparametros=respuesta["hiperparametros"],
        entrenado_en="",
        etiquetas=etiquetas,
    )
    return ResultadoObjetivo(respuesta=respuesta, bundle=bundle)


def entrenar_regresion(
    objetivo: str,
    version: str,
    columna_target: str,
    muestras_anticipado: list[dict],
    nombres: list[str],
    prueba_desde: str,
    semilla: int,
) -> ResultadoObjetivo:
    candidatos = candidatos_regresion(semilla)
    pools, pliegues_usados = _entrenar_walkforward(muestras_anticipado, nombres, columna_target, candidatos, "regresion")
    if not pliegues_usados:
        raise ObjetivoNoEntrenable(
            "sin pliegues walk-forward utilizables: ningún tramo de entrenamiento tuvo "
            f"varianza distinta de cero en `{columna_target}`"
        )

    mejor_algoritmo = None
    mejor_mae = float("inf")
    metricas_por_candidato: dict[str, float] = {}
    for algoritmo, pool in pools.items():
        if not pool["y"]:
            metricas_por_candidato[algoritmo] = float("inf")
            continue
        valor = mae(np.array(pool["y"]), np.array(pool["p"]))
        metricas_por_candidato[algoritmo] = valor
        if valor < mejor_mae:
            mejor_mae = valor
            mejor_algoritmo = algoritmo

    if mejor_algoritmo is None:
        mejor_algoritmo = candidatos[0].algoritmo

    pool_campeon = pools[mejor_algoritmo]
    y_oof = np.array(pool_campeon["y"], dtype=float)
    p_oof = np.array(pool_campeon["p"], dtype=float)

    entrenamiento, prueba, corte_entrenamiento, corte_prueba = _split_prueba(muestras_anticipado, prueba_desde)
    candidato_final = next(c for c in candidatos_regresion(semilla) if c.algoritmo == mejor_algoritmo)
    modelo_final = clone(candidato_final.estimador)
    base = entrenamiento or muestras_anticipado
    X_train_full = _vectorizar_matriz(base, nombres)
    y_train_full = [m[columna_target] for m in base]
    valores_full = [v for v in y_train_full if v is not None]
    if len(valores_full) < 2 or float(np.var(valores_full)) == 0.0:
        raise ObjetivoNoEntrenable(
            f"el conjunto de entrenamiento final (hasta `pruebaDesde`) tiene varianza cero en `{columna_target}`"
        )
    modelo_final.fit(X_train_full, y_train_full)

    pares_importancia = importancias(Candidato(algoritmo=mejor_algoritmo, estimador=modelo_final), nombres)
    importancias_norm = normalizar_importancias(pares_importancia)
    alternativas = [
        {"algoritmo": alg, "mae": round(valor, 4)}
        for alg, valor in sorted(metricas_por_candidato.items(), key=lambda kv: kv[1])
        if alg != mejor_algoritmo
    ]
    medianas = _medianas(X_train_full)

    respuesta = {
        "algoritmo": mejor_algoritmo,
        "hiperparametros": _hiperparametros(candidato_final.estimador),
        "muestras": len(muestras_anticipado),
        "features": len(nombres),
        "metricas": {
            "mae": round(float(mae(y_oof, p_oof)) if len(y_oof) else 0.0, 4),
            "rmse": round(float(rmse(y_oof, p_oof)) if len(y_oof) else 0.0, 4),
            "r2": round(float(r2(y_oof, p_oof)) if len(y_oof) else 0.0, 4),
        },
        "corteEntrenamiento": corte_entrenamiento,
        "cortePrueba": corte_prueba,
        "pliegues": pliegues_usados,
        "importancias": importancias_norm,
        "alternativas": alternativas,
    }

    bundle = BundleModelo(
        objetivo=objetivo,
        version=version,
        tipo="regresion",
        algoritmo=mejor_algoritmo,
        estimador=modelo_final,
        nombres=nombres,
        medianas=medianas.tolist(),
        calibrador=None,
        umbral=0.0,
        clases=None,
        hiperparametros=respuesta["hiperparametros"],
        entrenado_en="",
    )
    return ResultadoObjetivo(respuesta=respuesta, bundle=bundle)


def entrenar_multiclase(
    objetivo: str,
    version: str,
    columna_target: str,
    muestras_anticipado: list[dict],
    nombres: list[str],
    prueba_desde: str,
    semilla: int,
) -> ResultadoObjetivo:
    candidatos = candidatos_multiclase(semilla)
    # Excluye las filas con target nulo *antes* de contar clases: la mayoría
    # de los turnos no tiene parada imprevista accionable, así que
    # `tipoCausaDominante` es `null` en la mayoría de los granos del corpus
    # real (§ caso reportado con 225 muestras `anticipado`).
    muestras_validas = [m for m in muestras_anticipado if m.get(columna_target)]
    todas_clases = sorted({m[columna_target] for m in muestras_validas})
    if len(todas_clases) < 2:
        raise ObjetivoNoEntrenable(
            f"menos de 2 clases distintas en `{columna_target}` tras excluir nulos "
            f"({len(muestras_validas)} filas con causa, clases observadas: {todas_clases})"
        )

    pools, pliegues_usados = _entrenar_walkforward(muestras_validas, nombres, columna_target, candidatos, "multiclase")
    if not pliegues_usados:
        raise ObjetivoNoEntrenable(
            "sin pliegues walk-forward utilizables: ningún tramo de entrenamiento tuvo "
            f"las {MINIMO_EJEMPLOS_POR_CLASE} muestras mínimas de cada clase en `{columna_target}` "
            "(target mayoritariamente nulo)"
        )

    mejor_algoritmo = None
    mejor_f1 = -1.0
    metricas_por_candidato: dict[str, float] = {}
    for algoritmo, pool in pools.items():
        if not pool["y"]:
            metricas_por_candidato[algoritmo] = 0.0
            continue
        valor = f1_macro(np.array(pool["y"]), np.array(pool["p"]), todas_clases)
        metricas_por_candidato[algoritmo] = valor
        if valor > mejor_f1:
            mejor_f1 = valor
            mejor_algoritmo = algoritmo

    if mejor_algoritmo is None:
        mejor_algoritmo = candidatos[0].algoritmo

    pool_campeon = pools[mejor_algoritmo]
    y_oof = np.array(pool_campeon["y"])
    p_oof = np.array(pool_campeon["p"])

    entrenamiento, prueba, corte_entrenamiento, corte_prueba = _split_prueba(muestras_validas, prueba_desde)
    candidato_final = next(c for c in candidatos_multiclase(semilla) if c.algoritmo == mejor_algoritmo)
    modelo_final = clone(candidato_final.estimador)
    base = entrenamiento or muestras_validas
    X_train_full = _vectorizar_matriz(base, nombres)
    y_train_full = [m[columna_target] for m in base]
    if len({v for v in y_train_full if v is not None}) < 2:
        raise ObjetivoNoEntrenable(
            f"el conjunto de entrenamiento final (hasta `pruebaDesde`) tiene una sola clase en `{columna_target}`"
        )
    modelo_final.fit(X_train_full, y_train_full)

    top2 = 0.0
    if prueba:
        X_prueba = _vectorizar_matriz(prueba, nombres)
        y_prueba = np.array([m[columna_target] for m in prueba])
        if hasattr(modelo_final, "predict_proba"):
            proba_prueba = modelo_final.predict_proba(X_prueba)
            clases_modelo = list(modelo_final.classes_)
            top2 = top_k_accuracy(y_prueba, proba_prueba, clases_modelo, 2)

    pares_importancia = importancias(Candidato(algoritmo=mejor_algoritmo, estimador=modelo_final), nombres)
    importancias_norm = normalizar_importancias(pares_importancia)
    alternativas = [
        {"algoritmo": alg, "f1Macro": round(valor, 4)}
        for alg, valor in sorted(metricas_por_candidato.items(), key=lambda kv: kv[1], reverse=True)
        if alg != mejor_algoritmo
    ]
    medianas = _medianas(X_train_full)

    respuesta = {
        "algoritmo": mejor_algoritmo,
        "hiperparametros": _hiperparametros(candidato_final.estimador),
        "muestras": len(muestras_validas),
        "features": len(nombres),
        "metricas": {
            "f1Macro": round(float(f1_macro(y_oof, p_oof, todas_clases)) if len(y_oof) else 0.0, 4),
            "accuracy": round(float(accuracy(y_oof, p_oof)) if len(y_oof) else 0.0, 4),
            "top2": round(float(top2), 4),
        },
        "corteEntrenamiento": corte_entrenamiento,
        "cortePrueba": corte_prueba,
        "pliegues": pliegues_usados,
        "importancias": importancias_norm,
        "alternativas": alternativas,
    }

    bundle = BundleModelo(
        objetivo=objetivo,
        version=version,
        tipo="multiclase",
        algoritmo=mejor_algoritmo,
        estimador=modelo_final,
        nombres=nombres,
        medianas=medianas.tolist(),
        calibrador=None,
        umbral=0.0,
        clases=list(modelo_final.classes_) if hasattr(modelo_final, "classes_") else todas_clases,
        hiperparametros=respuesta["hiperparametros"],
        entrenado_en="",
    )
    return ResultadoObjetivo(respuesta=respuesta, bundle=bundle)
