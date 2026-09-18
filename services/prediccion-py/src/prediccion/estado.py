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

OBJETIVOS = ["parada_imprevista", "merma_sobre_estandar", "minutos_imprevistos", "causa_dominante"]

COLUMNA_TARGET = {
    "parada_imprevista": "huboParadaImprevista",
    "merma_sobre_estandar": "mermaSobreEstandar",
    "minutos_imprevistos": "minutosImprevistos",
    "causa_dominante": "tipoCausaDominante",
}

TIPO_OBJETIVO = {
    "parada_imprevista": "binario",
    "merma_sobre_estandar": "binario",
    "minutos_imprevistos": "regresion",
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

    def modelo_para_predict(self) -> BundleModelo | None:
        return self.modelos.get("parada_imprevista")


_estado: EstadoServicio | None = None


def obtener_estado() -> EstadoServicio:
    global _estado
    if _estado is None:
        _estado = EstadoServicio()
    return _estado


def resetear_estado_para_pruebas() -> None:
    global _estado
    _estado = EstadoServicio()
