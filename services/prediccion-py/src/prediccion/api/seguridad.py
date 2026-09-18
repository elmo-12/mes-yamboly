"""Protección de las mutaciones con `X-Internal-Token` (§4 del contrato).
`/predict` y las lecturas no exigen token: el puerto sólo se publica en
`127.0.0.1`."""

from __future__ import annotations

from fastapi import Header, HTTPException

from ..config import obtener_config


async def exigir_token_interno(x_internal_token: str | None = Header(default=None)) -> None:
    config = obtener_config()
    if not config.prediccion_token:
        return
    if x_internal_token != config.prediccion_token:
        raise HTTPException(status_code=401, detail="X-Internal-Token inválido o ausente")
