from __future__ import annotations

import pytest

from prediccion.dominio.validacion import (
    ErrorValidacion,
    calcular_sha256_muestras,
    verificar_antifuga,
    verificar_minimos,
    verificar_snapshot,
)


def test_antifuga_rechaza_columna_prohibida_en_fila_anticipada() -> None:
    muestras = [
        {"modo": "anticipado", "lineaCodigo": "L1", "fecha": "2026-01-01", "turno": "D", "features": {"oeeTotal": 80}},
    ]
    with pytest.raises(ErrorValidacion):
        verificar_antifuga(muestras, ["oeeTotal"])


def test_antifuga_permite_columna_prohibida_en_fila_retro() -> None:
    muestras = [
        {"modo": "retro", "lineaCodigo": "L1", "fecha": "2026-01-01", "turno": "D", "features": {"oeeTotal": 80}},
    ]
    verificar_antifuga(muestras, ["oeeTotal"])  # no lanza


def test_antifuga_sin_columnas_prohibidas_no_hace_nada() -> None:
    muestras = [{"modo": "anticipado", "features": {"oeeTotal": 80}}]
    verificar_antifuga(muestras, [])


def test_snapshot_sha256_debe_coincidir() -> None:
    muestras = [{"a": 1}, {"b": 2}]
    correcto = calcular_sha256_muestras(muestras)
    verificar_snapshot(muestras, correcto)  # no lanza
    with pytest.raises(ErrorValidacion):
        verificar_snapshot(muestras, "sha-invalido")


def test_snapshot_sha256_es_sensible_al_orden_de_filas() -> None:
    a = [{"a": 1}, {"b": 2}]
    b = [{"b": 2}, {"a": 1}]
    assert calcular_sha256_muestras(a) != calcular_sha256_muestras(b)


def test_minimo_200_filas_anticipado() -> None:
    catalogo = [{"nombre": "x", "grupo": "g", "etiqueta": "X"}]
    muestras = [{"modo": "anticipado", "huboParadaImprevista": i % 2} for i in range(199)]
    with pytest.raises(ErrorValidacion):
        verificar_minimos(muestras, catalogo, objetivo_binario="huboParadaImprevista")

    muestras_ok = [{"modo": "anticipado", "huboParadaImprevista": i % 2} for i in range(200)]
    verificar_minimos(muestras_ok, catalogo, objetivo_binario="huboParadaImprevista")  # no lanza


def test_una_sola_clase_falla() -> None:
    catalogo = [{"nombre": "x", "grupo": "g", "etiqueta": "X"}]
    muestras = [{"modo": "anticipado", "huboParadaImprevista": 1} for _ in range(200)]
    with pytest.raises(ErrorValidacion):
        verificar_minimos(muestras, catalogo, objetivo_binario="huboParadaImprevista")


def test_catalogo_vacio_falla() -> None:
    muestras = [{"modo": "anticipado", "huboParadaImprevista": i % 2} for i in range(200)]
    with pytest.raises(ErrorValidacion):
        verificar_minimos(muestras, [])
