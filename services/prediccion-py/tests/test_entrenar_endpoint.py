from __future__ import annotations

import threading
import time

from fixtures import generar_request


def test_entrenar_happy_path_y_predict_después(cliente) -> None:
    payload = generar_request(semilla=1, n_dias=45, version="vhappy")
    resp = cliente.post("/entrenar", json=payload)
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()

    assert cuerpo["runId"] == "TRAIN-vhappy"
    assert set(cuerpo["resultados"].keys()) == {
        "parada_imprevista",
        "merma_sobre_estandar",
        "minutos_imprevistos",
        "causa_dominante",
    }

    binario = cuerpo["resultados"]["parada_imprevista"]
    assert binario["algoritmo"] in {"LightGBM", "HistGradientBoosting", "LogisticRegression"}
    assert 0 <= binario["walkForward"]["umbral"] <= 1
    assert 0 <= binario["walkForward"]["aucRoc"] <= 1
    assert 0 <= binario["aucPrueba"] <= 1
    assert isinstance(binario["pliegues"], list) and len(binario["pliegues"]) > 0
    assert len(binario["alternativas"]) == 2
    assert binario["artefacto"]["sha256"]
    assert binario["artefacto"]["bytes"] > 0
    for f in binario["fuera"]:
        assert f["p"] >= 0

    regresion = cuerpo["resultados"]["minutos_imprevistos"]
    assert set(regresion["metricas"].keys()) == {"mae", "rmse", "r2"}

    multiclase = cuerpo["resultados"]["causa_dominante"]
    assert set(multiclase["metricas"].keys()) == {"f1Macro", "accuracy", "top2"}

    # `/entrenar` persiste pero **no activa**: la promoción es decisión de Nest.
    # Antes de activar, /predict sigue sin modelo.
    assert cliente.get("/modelo/actual").status_code == 404
    activada = cliente.post("/modelo/parada_imprevista/vhappy/activar")
    assert activada.status_code == 200, activada.text

    actual = cliente.get("/modelo/actual")
    assert actual.status_code == 200
    assert actual.json()["version"] == "vhappy"

    ctx = {
        "tipo": "parada_prevista",
        "lineaId": "LINEA-LIN-C",
        "lineaCodigo": "LIN-C",
        "turno": "N",
        "eventos7d": 3,
        "eventos30d": 11,
        "desvioVelocidadPct": -4.2,
        "oeeActual": 71.3,
        "minutosDesdeCambio": 0,
    }
    pred = cliente.post("/predict", json=ctx)
    assert pred.status_code == 200
    cuerpo_pred = pred.json()
    assert 0 <= cuerpo_pred["probabilidad"] <= 100
    if cuerpo_pred["factores"]:
        suma = sum(f["contribucion"] for f in cuerpo_pred["factores"])
        assert suma == 100
        assert len(cuerpo_pred["factores"]) <= 3


def test_entrenar_http_con_campeon_puebla_campeon_reevaluado(cliente) -> None:
    campeon = {"version": "v-anterior", "algoritmo": "LightGBM 4.5", "hiperparametros": {}}
    payload = generar_request(semilla=5, n_dias=45, version="vcampeonhttp", campeon=campeon)
    resp = cliente.post("/entrenar", json=payload)
    assert resp.status_code == 200, resp.text

    binario = resp.json()["resultados"]["parada_imprevista"]
    assert binario["campeonReevaluado"] is not None
    assert binario["campeonReevaluado"]["version"] == "v-anterior"
    assert binario["campeonReevaluado"]["algoritmo"] == "LightGBM"
    assert "walkForward" in binario["campeonReevaluado"]


def test_entrenar_422_por_fuga_de_datos(cliente) -> None:
    payload = generar_request(semilla=2, n_dias=40, version="vfuga")
    # Se cuela una columna prohibida en una fila anticipada.
    for m in payload["muestras"]:
        if m["modo"] == "anticipado":
            m["features"]["oeeTotal"] = 88.0
            break
    resp = cliente.post("/entrenar", json=payload)
    assert resp.status_code == 422


def test_entrenar_422_por_snapshot_incorrecto(cliente) -> None:
    payload = generar_request(semilla=3, n_dias=40, version="vsha")
    payload["snapshot"]["sha256"] = "0" * 64
    resp = cliente.post("/entrenar", json=payload)
    assert resp.status_code == 422


def test_entrenar_409_si_ya_hay_uno_en_curso(cliente, monkeypatch) -> None:
    from prediccion.api import rutas_entrenar as modulo

    original = modulo._entrenar_todos

    def _lento(*args, **kwargs):
        time.sleep(1.0)
        return original(*args, **kwargs)

    monkeypatch.setattr(modulo, "_entrenar_todos", _lento)

    payload = generar_request(semilla=4, n_dias=40, version="vlento")
    codigos: dict[str, int] = {}

    def _llamar(clave: str) -> None:
        codigos[clave] = cliente.post("/entrenar", json=payload).status_code

    t1 = threading.Thread(target=_llamar, args=("primero",))
    t1.start()
    time.sleep(0.3)  # deja que el primero tome el candado
    t2 = threading.Thread(target=_llamar, args=("segundo",))
    t2.start()
    t1.join()
    t2.join()

    assert codigos["segundo"] == 409
    assert codigos["primero"] == 200
