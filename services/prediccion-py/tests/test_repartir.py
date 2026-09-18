"""`repartir()` debe producir exactamente los mismos bloques que
`EvaluacionService.repartir` (`evaluacion.service.ts:205-213`). Nest compara
`pliegues[]` contra su propio cálculo y rechaza la promoción si difieren
(§3 del contrato) — un off-by-one aquí sería silencioso hasta producción.

Cortes calculados a mano con la fórmula del TS
(`indice = min(n-1, floor(i / (len(dias)/n)))`) para `n=6` (`PLIEGUES+1`,
con `PLIEGUES=5`):

- 13 días: tamaño = 13/6 = 2.1667 → floor(i/2.1667) para i=0..12 da
  [0,0,0,1,1,2,2,3,3,4,4,5,5] → tamaños de bloque [3,2,2,2,2,2].
- 30 días: tamaño = 30/6 = 5.0 exacto → floor(i/5) da bloques de 5 en 5,
  tamaños [5,5,5,5,5,5].
- 181 días: tamaño = 181/6 = 30.1667 → los cortes de índice caen en
  i=31,61,91,121,151 → tamaños de bloque [31,30,30,30,30,30].
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from prediccion.dominio.dataset import repartir


def _dias(n: int) -> list[str]:
    inicio = date(2026, 1, 1)
    return [(inicio + timedelta(days=i)).isoformat() for i in range(n)]


@pytest.mark.parametrize(
    "n_dias,tamanos_esperados",
    [
        (13, [3, 2, 2, 2, 2, 2]),
        (30, [5, 5, 5, 5, 5, 5]),
        (181, [31, 30, 30, 30, 30, 30]),
    ],
)
def test_repartir_tamanos_de_bloque(n_dias: int, tamanos_esperados: list[int]) -> None:
    dias = _dias(n_dias)
    bloques = repartir(dias, 6)

    assert [len(b) for b in bloques] == tamanos_esperados
    assert sum(len(b) for b in bloques) == n_dias
    # Los bloques son contiguos y cubren todos los días, en orden, sin huecos
    # ni repeticiones.
    reconstruido = [d for b in bloques for d in b]
    assert reconstruido == dias


def test_repartir_181_dias_cortes_por_indice() -> None:
    dias = _dias(181)
    bloques = repartir(dias, 6)
    # Primer día de cada bloque, calculado a mano (índices 0, 31, 61, 91, 121, 151).
    assert [b[0] for b in bloques] == [dias[0], dias[31], dias[61], dias[91], dias[121], dias[151]]
    assert [b[-1] for b in bloques] == [dias[30], dias[60], dias[90], dias[120], dias[150], dias[180]]


def test_repartir_bloque_vacio_si_menos_dias_que_n() -> None:
    dias = _dias(3)
    bloques = repartir(dias, 6)
    assert len(bloques) == 6
    assert sum(len(b) for b in bloques) == 3
