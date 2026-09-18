"""Vector dorado de canonicalización del snapshot (docs/prediccion-python.md §3.1).

El mismo fichero lo asserta `apps/api/src/modules/analytics/modelado/snapshot-sha256.spec.ts`.
Si alguien cambia la canonicalización de un lado, falla el test del otro **antes**
de que el desajuste aparezca en producción como un 422 que rechaza todos los
entrenamientos. Es el acoplamiento más frágil del contrato entre TypeScript y Python.
"""

import json
from pathlib import Path

import pytest

from prediccion.dominio.validacion import ErrorValidacion, calcular_sha256_muestras, verificar_snapshot

VECTOR = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts" / "snapshot-vector-dorado.json").read_text(
        encoding="utf-8"
    )
)


def test_reproduce_el_vector_dorado_compartido_con_nest() -> None:
    assert calcular_sha256_muestras(VECTOR["muestras"]) == VECTOR["sha256Esperado"]


def test_es_estable_frente_al_orden_de_las_claves() -> None:
    reordenada = [dict(reversed(list(m.items()))) for m in VECTOR["muestras"]]
    assert calcular_sha256_muestras(reordenada) == VECTOR["sha256Esperado"]


def test_depende_del_orden_de_las_filas() -> None:
    """El contrato fija «en su mismo orden»: reordenar filas debe cambiar el hash."""
    assert calcular_sha256_muestras(list(reversed(VECTOR["muestras"]))) != VECTOR["sha256Esperado"]


def test_verificar_snapshot_acepta_el_vector_y_rechaza_uno_alterado() -> None:
    verificar_snapshot(VECTOR["muestras"], VECTOR["sha256Esperado"])
    with pytest.raises(ErrorValidacion):
        verificar_snapshot(VECTOR["muestras"], "0" * 64)
