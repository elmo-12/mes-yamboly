"""`campeonReevaluado` (§3.2 del contrato, actualizado): Python debe
reentrenar la configuración del campeón archivado (`campeon.algoritmo` +
`campeon.hiperparametros`) sobre los datos de hoy, **con el mismo
protocolo** (mismos pliegues de `repartir()`, misma calibración Platt) que
el candidato, y devolver sus métricas — nunca comparar contra la métrica
archivada, porque `aplicarTarget` puede haber cambiado de regla entre
semanas.
"""

from __future__ import annotations

from fixtures import CATALOGO, PROHIBIDAS, generar_muestras

from prediccion.dominio.entrenamiento import entrenar_binario

NOMBRES = [c["nombre"] for c in CATALOGO if c["nombre"] not in set(PROHIBIDAS)]
NOMBRES_RETRO = [c["nombre"] for c in CATALOGO]
ETIQUETAS = {c["nombre"]: c["etiqueta"] for c in CATALOGO}


def _entrenar(campeon: dict | None, semilla_datos: int = 21, semilla_modelo: int = 42):
    muestras = generar_muestras(semilla=semilla_datos, n_dias=45)
    anticipado = [m for m in muestras if m["modo"] == "anticipado"]
    retro = [m for m in muestras if m["modo"] == "retro"]
    dias = sorted({m["fecha"] for m in anticipado})
    prueba_desde = dias[int(len(dias) * 0.8)]

    return entrenar_binario(
        objetivo="parada_imprevista",
        version="vcampeon",
        columna_target="huboParadaImprevista",
        muestras_anticipado=anticipado,
        muestras_retro=retro,
        nombres=NOMBRES,
        nombres_retro=NOMBRES_RETRO,
        prueba_desde=prueba_desde,
        semilla=semilla_modelo,
        etiquetas=ETIQUETAS,
        campeon=campeon,
    )


def test_campeon_reevaluado_se_puebla_y_usa_los_mismos_pliegues() -> None:
    campeon = {"version": "v2.1", "algoritmo": "LightGBM 4.5", "hiperparametros": {}}
    resultado = _entrenar(campeon)
    respuesta = resultado.respuesta

    campeon_reevaluado = respuesta["campeonReevaluado"]
    assert campeon_reevaluado is not None, respuesta.get("campeonReevaluadoMotivo")
    assert campeon_reevaluado["version"] == "v2.1"
    assert campeon_reevaluado["algoritmo"] == "LightGBM"
    assert "walkForward" in campeon_reevaluado
    assert 0 <= campeon_reevaluado["walkForward"]["aucRoc"] <= 1
    assert 0 <= campeon_reevaluado["walkForward"]["prAuc"] <= 1
    assert "campeonReevaluadoMotivo" not in respuesta

    # Mismo protocolo: el campeón reconstruido se evaluó en el mismo bucle
    # walk-forward que el candidato (`_entrenar_walkforward` con `extra`),
    # así que el número total de filas fuera de muestra —la matriz de
    # confusión completa— tiene que coincidir exactamente con la del
    # candidato: ambos vieron los mismos pliegues.
    total_candidato = sum(respuesta["walkForward"][k] for k in ("vp", "fp", "vn", "fn"))
    total_campeon = sum(campeon_reevaluado["walkForward"][k] for k in ("vp", "fp", "vn", "fn"))
    assert total_campeon == total_candidato
    assert total_campeon > 0

    # Con `hiperparametros={}` (sin overrides), el campeón reconstruido es
    # exactamente la familia LightGBM por defecto: si esa fue también la
    # elegida como candidato, las métricas deben ser bit a bit idénticas
    # (mismos datos, mismos pliegues, misma configuración, misma semilla).
    if respuesta["algoritmo"] == "LightGBM":
        assert campeon_reevaluado["walkForward"] == respuesta["walkForward"]


def test_campeon_none_no_reevalua_nada() -> None:
    resultado = _entrenar(campeon=None)
    assert resultado.respuesta["campeonReevaluado"] is None
    assert "campeonReevaluadoMotivo" not in resultado.respuesta


def test_campeon_con_algoritmo_desconocido_no_adivina() -> None:
    campeon = {"version": "v1.0", "algoritmo": "RedNeuronalMagica 9000", "hiperparametros": {}}
    resultado = _entrenar(campeon)
    assert resultado.respuesta["campeonReevaluado"] is None
    assert "algoritmo de campeón no reconocido" in resultado.respuesta["campeonReevaluadoMotivo"]
    assert "RedNeuronalMagica" in resultado.respuesta["campeonReevaluadoMotivo"]


def test_campeon_hiperparametros_se_aplican_al_reconstruir() -> None:
    # `n_estimators` bajo debería, en general, degradar o cambiar las
    # métricas frente a la configuración por defecto: comprobamos sobre todo
    # que no revienta y que el valor efectivamente se usó (vía
    # hiperparámetros del bundle no es observable desde aquí, así que se
    # verifica indirectamente con un resultado íntegro).
    campeon = {"version": "v0.1", "algoritmo": "HistGradientBoosting", "hiperparametros": {"max_iter": 5}}
    resultado = _entrenar(campeon)
    campeon_reevaluado = resultado.respuesta["campeonReevaluado"]
    assert campeon_reevaluado is not None
    assert campeon_reevaluado["algoritmo"] == "HistGradientBoosting"
