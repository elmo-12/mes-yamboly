from __future__ import annotations


def test_salud_degradado_sin_modelo(cliente) -> None:
    resp = cliente.get("/salud")
    assert resp.status_code == 200
    cuerpo = resp.json()
    assert cuerpo["estado"] == "degradado"
    assert cuerpo["modeloCargado"] is False
    assert "sklearn" in cuerpo
    assert "uptimeS" in cuerpo


def _contexto_estrecho(tipo: str = "parada_prevista") -> dict:
    return {
        "tipo": tipo,
        "lineaId": "LINEA-LIN-A",
        "lineaCodigo": "LIN-A",
        "turno": "D",
        "eventos7d": 3,
        "eventos30d": 11,
        "desvioVelocidadPct": -4.2,
        "oeeActual": 71.3,
        "minutosDesdeCambio": 0,
    }


def test_predict_503_sin_modelo(cliente) -> None:
    resp = cliente.post("/predict", json=_contexto_estrecho())
    assert resp.status_code == 503


def test_predict_422_tipo_no_soportado(cliente) -> None:
    resp = cliente.post("/predict", json=_contexto_estrecho(tipo="merma_prevista"))
    assert resp.status_code == 422


def test_modelo_actual_404_sin_modelo(cliente) -> None:
    resp = cliente.get("/modelo/actual")
    assert resp.status_code == 404


def test_modelo_versiones_vacio(cliente) -> None:
    resp = cliente.get("/modelo/versiones")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_activar_404_si_falta_artefacto(cliente) -> None:
    resp = cliente.post("/modelo/parada_imprevista/v-inexistente/activar")
    assert resp.status_code == 404
