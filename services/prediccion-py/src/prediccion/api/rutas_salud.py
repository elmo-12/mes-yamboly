"""`GET /salud` (§4 del contrato). Siempre 200 si el proceso vive:
`degradado` sólo significa «sin modelo», nunca tumba el contenedor —
apagar Python no puede romper ninguna pantalla (regla dura §1.4)."""

from __future__ import annotations

import sklearn
from fastapi import APIRouter

from ..estado import obtener_estado
from .esquemas import RespuestaSalud

router = APIRouter()


@router.get("/salud", response_model=RespuestaSalud)
async def salud() -> RespuestaSalud:
    estado = obtener_estado()
    bundle = estado.modelo_para_predict()
    return RespuestaSalud(
        estado="ok" if bundle is not None else "degradado",
        modeloCargado=bundle is not None,
        version=bundle.version if bundle is not None else None,
        sklearn=sklearn.__version__,
        uptimeS=round(estado.uptime_s(), 1),
    )
