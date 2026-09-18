"""`GET /modelo/actual`, `GET /modelo/versiones`, `POST /modelo/{objetivo}/{version}/activar`
y `POST /modelo/{objetivo}/desactivar` (§4 del contrato).

El contrato no dice qué objetivo devuelve `/modelo/actual` cuando hay varios
entrenados a la vez (sólo `/predict` está atado a `parada_imprevista`); se
resuelve con un parámetro de consulta opcional `objetivo`, por defecto
`parada_imprevista` — es el único que consume el motor de alertas y el caso
de uso que documenta el ejemplo del contrato.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..config import obtener_config
from ..estado import obtener_estado
from ..registro import artefactos, registro
from .esquemas import RespuestaModeloActual
from .seguridad import exigir_token_interno

router = APIRouter()


@router.get("/modelo/actual", response_model=RespuestaModeloActual)
async def modelo_actual(objetivo: str = "parada_imprevista") -> RespuestaModeloActual:
    config = obtener_config()
    version, metadata = registro.version_activa(config.modelos_dir, objetivo)
    if not version or not metadata:
        raise HTTPException(status_code=404, detail=f"Sin modelo activo para {objetivo}")
    return RespuestaModeloActual(
        version=version,
        objetivo=objetivo,
        algoritmo=metadata["algoritmo"],
        hiperparametros=metadata["hiperparametros"],
        nombres=metadata["nombres"],
        entrenadoEn=metadata["entrenadoEn"],
        artefactoSha256=metadata["artefactoSha256"],
        umbralDecisionPct=metadata["umbralDecisionPct"],
    )


@router.get("/modelo/versiones")
async def modelo_versiones() -> dict:
    config = obtener_config()
    return registro.leer(config.modelos_dir)


@router.post("/modelo/{objetivo}/{version}/activar", dependencies=[Depends(exigir_token_interno)])
async def activar_modelo(objetivo: str, version: str) -> dict:
    config = obtener_config()
    ruta = artefactos.ruta_version(config.modelos_dir, objetivo, version)
    if not ruta.exists():
        raise HTTPException(status_code=404, detail=f"No existe el artefacto {objetivo}/{version}")

    ok = registro.activar_version(config.modelos_dir, objetivo, version)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Sin metadata registrada para {objetivo}/{version}")

    bundle = artefactos.cargar_modelo(ruta)
    estado = obtener_estado()
    # Hot-swap atómico: se reemplaza la referencia completa, nunca se muta
    # el bundle ya servido a una petición en curso.
    estado.modelos[objetivo] = bundle
    return {"objetivo": objetivo, "version": version, "activo": True}


@router.post("/modelo/{objetivo}/desactivar", dependencies=[Depends(exigir_token_interno)])
async def desactivar_modelo(objetivo: str) -> dict:
    config = obtener_config()
    registro.desactivar(config.modelos_dir, objetivo)
    estado = obtener_estado()
    estado.modelos[objetivo] = None
    return {"objetivo": objetivo, "activo": False}
