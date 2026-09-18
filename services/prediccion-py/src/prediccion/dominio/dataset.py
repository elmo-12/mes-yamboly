"""Utilidades de partición temporal, portadas 1:1 desde
`apps/api/src/modules/analytics/modelado/evaluacion.service.ts:123-213`.

**Crítico**: `repartir()` debe producir exactamente los mismos bloques que el
TS para el mismo `dias` y `n`. Nest compara `pliegues[]` de la respuesta de
`/entrenar` contra su propio `repartir()` y rechaza la promoción si difieren
(§3 del contrato). Ver `tests/test_repartir.py` para los cortes calculados a
mano de 13, 30 y 181 días con `n=6` (`PLIEGUES + 1`).
"""

from __future__ import annotations

import math

PLIEGUES = 5
"""Igual que `PLIEGUES` en `evaluacion.service.ts`: 5 pliegues expansivos."""

FRACCION_PRUEBA = 0.3
"""Igual que `FRACCION_PRUEBA`: fracción final del corpus reservada a prueba."""


def repartir(dias: list[str], n: int) -> list[list[str]]:
    """Reparte `dias` (ya ordenados) en `n` bloques contiguos de tamaño lo más
    parejo posible. Port literal de `EvaluacionService.repartir`:

    ```ts
    private repartir(dias: string[], n: number): string[][] {
      const bloques: string[][] = Array.from({ length: n }, () => []);
      const tamano = dias.length / n;
      dias.forEach((dia, i) => {
        const indice = Math.min(n - 1, Math.floor(i / tamano));
        bloques[indice]!.push(dia);
      });
      return bloques;
    }
    ```
    """
    bloques: list[list[str]] = [[] for _ in range(n)]
    tamano = len(dias) / n
    for i, dia in enumerate(dias):
        indice = min(n - 1, math.floor(i / tamano))
        bloques[indice].append(dia)
    return bloques


def dias_unicos_ordenados(fechas: list[str]) -> list[str]:
    return sorted(set(fechas))


def corte_prueba_por_fraccion(dias: list[str]) -> tuple[str, str]:
    """Corte único 70/30 por días (`cortePrueba()` en el TS), usado sólo como
    referencia local; en producción Nest manda `evaluacion.pruebaDesde` y
    Python lo respeta en vez de recalcularlo (regla dura nº3 del contrato)."""
    if not dias:
        return "", ""
    corte = max(1, math.floor(len(dias) * (1 - FRACCION_PRUEBA)))
    hasta = dias[corte - 1]
    fin = dias[-1]
    return hasta, fin
