from __future__ import annotations

from pathlib import Path

from prediccion.registro import registro


def test_retencion_de_12_versiones_nunca_borra_la_activa(tmp_path: Path) -> None:
    objetivo = "parada_imprevista"
    borradas_totales: list[str] = []

    for i in range(1, 16):  # 15 versiones, retención 12
        version = f"v{i}"
        a_borrar = registro.registrar_version(
            tmp_path, objetivo, version, {"algoritmo": "X", "n": i}, retencion=12, activar=True
        )
        borradas_totales.extend(a_borrar)

    data = registro.leer(tmp_path)
    bloque = data[objetivo]
    assert len(bloque["orden"]) == 12
    assert bloque["activa"] == "v15"
    assert "v15" in bloque["versiones"]
    # Las primeras 3 (v1..v3) se podaron; nunca se pidió borrar la activa.
    assert set(borradas_totales) == {"v1", "v2", "v3"}
    assert "v15" not in borradas_totales


def test_retencion_no_borra_activa_aunque_sea_la_mas_vieja(tmp_path: Path) -> None:
    objetivo = "merma_sobre_estandar"
    for i in range(1, 13):
        registro.registrar_version(tmp_path, objetivo, f"v{i}", {"n": i}, retencion=12, activar=(i == 1))

    # v1 sigue activa (nunca se reactivó), y ahora hay 12 versiones: se
    # añade una 13ª sin activarla; la poda no debe tocar v1 aunque sea la
    # más antigua.
    a_borrar = registro.registrar_version(tmp_path, objetivo, "v13", {"n": 13}, retencion=12, activar=False)
    data = registro.leer(tmp_path)
    assert data[objetivo]["activa"] == "v1"
    assert "v1" in data[objetivo]["versiones"]
    assert "v1" not in a_borrar


def test_activar_y_desactivar(tmp_path: Path) -> None:
    objetivo = "parada_imprevista"
    registro.registrar_version(tmp_path, objetivo, "v1", {"n": 1}, retencion=12, activar=True)
    registro.registrar_version(tmp_path, objetivo, "v2", {"n": 2}, retencion=12, activar=False)

    assert registro.activar_version(tmp_path, objetivo, "v2") is True
    version, meta = registro.version_activa(tmp_path, objetivo)
    assert version == "v2"
    assert meta["n"] == 2

    assert registro.activar_version(tmp_path, objetivo, "v-no-existe") is False

    registro.desactivar(tmp_path, objetivo)
    version, meta = registro.version_activa(tmp_path, objetivo)
    assert version is None
    assert meta is None
