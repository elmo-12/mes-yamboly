"""Aislamiento por objetivo (§3 del contrato, ampliado): un objetivo que no
se puede entrenar (típicamente `causa_dominante`, cuando la mayoría de los
turnos no tuvo parada imprevista y el target queda `null`) no debe tumbar la
corrida completa. Reproduce el bug real: corpus de 30 días, 225 muestras
`anticipado`, `tipoCausaDominante` mayoritariamente `null` → LightGBM
reventaba con "Number of classes should be ... greater than 1" y Nest perdía
hasta `parada_imprevista`, que sí se había entrenado bien.
"""

from __future__ import annotations

import random

import fixtures as fx
from fixtures import CATALOGO, PROHIBIDAS, generar_muestras
from prediccion.dominio.validacion import calcular_sha256_muestras


def _construir_request(muestras: list[dict], version: str) -> dict:
    """Igual que `fixtures.generar_request`, pero a partir de una lista de
    `muestras` ya preparada/mutada por el test (para poder forzar el target
    `null` sin tocar `fixtures.py`)."""
    dias = sorted({m["fecha"] for m in muestras})
    prueba_desde = dias[int(len(dias) * 0.8)] if dias else ""
    return {
        "version": version,
        "objetivos": ["parada_imprevista", "merma_sobre_estandar", "minutos_imprevistos", "causa_dominante"],
        "snapshot": {
            "sha256": calcular_sha256_muestras(muestras),
            "filas": len(muestras),
            "desde": dias[0] if dias else "",
            "hasta": dias[-1] if dias else "",
        },
        "catalogo": CATALOGO,
        "prohibidas": PROHIBIDAS,
        "evaluacion": {"pruebaDesde": prueba_desde, "pliegues": []},
        "muestras": muestras,
        "campeon": None,
        "semilla": 42,
    }


def test_multiclase_con_una_sola_clase_no_rompe_los_demas(cliente) -> None:
    muestras = generar_muestras(semilla=13, n_dias=45)
    # Fuerza una sola clase de `tipoCausaDominante` en todas las filas que la
    # tenían (el resto ya es `None` por diseño del generador).
    for m in muestras:
        if m.get("tipoCausaDominante"):
            m["tipoCausaDominante"] = "CPA-PN-02"

    payload = _construir_request(muestras, version="vmulticlase1clase")
    resp = cliente.post("/entrenar", json=payload)
    assert resp.status_code == 200, resp.text

    resultados = resp.json()["resultados"]
    assert "error" in resultados["causa_dominante"]
    assert "clase" in resultados["causa_dominante"]["error"]

    for objetivo in ("parada_imprevista", "merma_sobre_estandar", "minutos_imprevistos"):
        assert "error" not in resultados[objetivo], resultados[objetivo]
    assert "algoritmo" in resultados["parada_imprevista"]
    assert "algoritmo" in resultados["merma_sobre_estandar"]
    assert "metricas" in resultados["minutos_imprevistos"]

    # `/entrenar` persiste pero no activa: ningún objetivo queda sirviendo por
    # el mero hecho de haberse entrenado (la promoción la decide Nest).
    assert cliente.get("/modelo/actual", params={"objetivo": "parada_imprevista"}).status_code == 404

    # Pero el artefacto de los que sí entrenaron existe y se puede activar.
    activada = cliente.post("/modelo/parada_imprevista/vmulticlase1clase/activar")
    assert activada.status_code == 200, activada.text
    actual = cliente.get("/modelo/actual", params={"objetivo": "parada_imprevista"})
    assert actual.status_code == 200
    assert actual.json()["version"] == "vmulticlase1clase"

    # El objetivo fallido no persistió artefacto: no hay nada que activar.
    assert cliente.post("/modelo/causa_dominante/vmulticlase1clase/activar").status_code == 404
    assert cliente.get("/modelo/actual", params={"objetivo": "causa_dominante"}).status_code == 404


def test_causa_dominante_mayoritariamente_nula_caso_real(cliente) -> None:
    """El caso real que rompió producción: corpus con `tipoCausaDominante`
    `null` en casi todos los turnos (la mayoría no tuvo parada imprevista
    accionable). No debe devolver 500 ni arrastrar a los demás objetivos."""
    muestras = generar_muestras(semilla=77, n_dias=45)
    anticipadas_con_causa = [
        m for m in muestras if m["modo"] == "anticipado" and m.get("tipoCausaDominante")
    ]
    rng = random.Random(99)
    rng.shuffle(anticipadas_con_causa)
    # Deja como mucho 4 filas con causa no nula de todo el corpus (imita
    # "225 muestras anticipado, la mayoría sin parada imprevista accionable").
    conservar = {id(m) for m in anticipadas_con_causa[:4]}
    for m in muestras:
        if m["modo"] == "anticipado" and m.get("tipoCausaDominante") and id(m) not in conservar:
            m["tipoCausaDominante"] = None
        elif m["modo"] == "retro":
            # Las filas `retro` comparten target con su anticipada; no se
            # usan para `causa_dominante` pero se mantienen coherentes.
            pass

    payload = _construir_request(muestras, version="vcausanula")
    resp = cliente.post("/entrenar", json=payload)
    assert resp.status_code == 200, resp.text

    resultados = resp.json()["resultados"]
    # `causa_dominante` puede o no lograr entrenar según cuántas clases
    # distintas hayan quedado entre esas 4 filas — lo que nunca puede pasar
    # es que la corrida entera truene o que arrastre a los demás objetivos.
    if "error" in resultados["causa_dominante"]:
        assert isinstance(resultados["causa_dominante"]["error"], str)
    else:
        assert "metricas" in resultados["causa_dominante"]

    for objetivo in ("parada_imprevista", "merma_sobre_estandar", "minutos_imprevistos"):
        assert "error" not in resultados[objetivo], resultados[objetivo]


def test_entrenar_todos_los_objetivos_fallan_da_500(cliente, monkeypatch) -> None:
    # Menos días que pliegues (`PLIEGUES + 1 = 6`) hace que
    # `_entrenar_walkforward` no tenga ningún pliegue utilizable para
    # *ningún* objetivo, independientemente de las clases — así se prueba el
    # "fallan todos" sin depender del azar de una clase concreta. Se inflan
    # las líneas para no chocar con el mínimo global de 200 filas
    # `anticipado`.
    monkeypatch.setattr(fx, "LINEAS", fx.LINEAS + [f"LIN-X{i}" for i in range(40)])
    payload = fx.generar_request(semilla=5, n_dias=5, version="vtodosfallan")
    assert payload["snapshot"]["filas"] >= 200 * 2  # anticipado + retro

    resp = cliente.post("/entrenar", json=payload)
    assert resp.status_code == 500

    detail = resp.json()["detail"]
    assert detail["error"] == "Todos los objetivos fallaron"
    assert set(detail["resultados"].keys()) == {
        "parada_imprevista",
        "merma_sobre_estandar",
        "minutos_imprevistos",
        "causa_dominante",
    }
    for objetivo, info in detail["resultados"].items():
        assert "error" in info, f"{objetivo} debería haber fallado: {info}"

    # Nada quedó activo: ningún objetivo llegó a persistir un artefacto.
    for objetivo in detail["resultados"]:
        assert cliente.get("/modelo/actual", params={"objetivo": objetivo}).status_code == 404
