"""Estado en memoria del proceso: modelos activos por objetivo, candado de
entrenamiento (§7: `asyncio.Lock` → 409 si ocupado) y arranque para
`uptimeS`. Vive en un único objeto para poder hacer hot-swap atómico: la
referencia al bundle se reemplaza entera, nunca se muta in-place.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from .dominio.entrenamiento import BundleModelo

OBJETIVOS = ["parada_imprevista", "merma_sobre_estandar", "parada_larga", "causa_dominante"]

COLUMNA_TARGET = {
    "parada_imprevista": "huboParadaImprevista",
    "merma_sobre_estandar": "mermaSobreEstandar",
    # Turno con 30 min o más de parada imprevista. Reemplaza a la regresión
    # `minutos_imprevistos`: la duración no es predecible antes del turno
    # (R² ≈ 0), pero que el turno acumule una parada larga sí lo es.
    "parada_larga": "paradaLarga",
    "causa_dominante": "tipoCausaDominante",
}

# Tipo de alerta que pide `/predict` → objetivo cuyo modelo la responde.
OBJETIVO_POR_TIPO_ALERTA = {
    "parada_prevista": "parada_imprevista",
    "parada_larga": "parada_larga",
}

TIPO_OBJETIVO = {
    "parada_imprevista": "binario",
    "merma_sobre_estandar": "binario",
    "parada_larga": "binario",
    "causa_dominante": "multiclase",
}


@dataclass
class EstadoServicio:
    inicio: float = field(default_factory=time.monotonic)
    modelos: dict[str, BundleModelo | None] = field(default_factory=lambda: dict.fromkeys(OBJETIVOS))
    artefacto_sha256: dict[str, str] = field(default_factory=dict)
    lock_entrenamiento: asyncio.Lock = field(default_factory=asyncio.Lock)
    entrenando: bool = False

    def uptime_s(self) -> float:
        return time.monotonic() - self.inicio

    def modelo_para_predict(self, objetivo: str = "parada_imprevista") -> BundleModelo | None:
        return self.modelos.get(objetivo)


_estado: EstadoServicio | None = None


def obtener_estado() -> EstadoServicio:
    global _estado
    if _estado is None:
        _estado = EstadoServicio()
    return _estado


def resetear_estado_para_pruebas() -> None:
    global _estado
    _estado = EstadoServicio()
