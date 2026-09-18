"""`POST /predict` (§2 del contrato). Sirve sólo `tipo == 'parada_prevista'`
(el único objetivo que consume el motor de alertas: `parada_imprevista`).
Sin modelo activo → 503. `tipo` distinto → 422. Sin autenticación: el
cliente TS no manda cabeceras (`python-http.provider.ts:41-52`).
"""

from __future__ import annotations

import time

import numpy as np
from fastapi import APIRouter, HTTPException

from ..dominio.contexto import vector_desde_contexto
from ..dominio.explicacion import calcular_factores, predecir_proba_binaria
from ..dominio.modelo import Candidato
from ..estado import obtener_estado
from .esquemas import ContextoPrediccion, Factor, RespuestaPredict

router = APIRouter()

TIPO_SOPORTADO = "parada_prevista"


@router.post("/predict", response_model=RespuestaPredict)
async def predict(ctx: ContextoPrediccion) -> RespuestaPredict:
    inicio = time.perf_counter()

    if ctx.tipo != TIPO_SOPORTADO:
        raise HTTPException(status_code=422, detail=f"tipo debe ser '{TIPO_SOPORTADO}'")

    estado = obtener_estado()
    bundle = estado.modelo_para_predict()
    if bundle is None:
        raise HTTPException(status_code=503, detail="Sin modelo activo para parada_imprevista")

    x = vector_desde_contexto(ctx.model_dump(), bundle.nombres)
    candidato = Candidato(algoritmo=bundle.algoritmo, estimador=bundle.estimador)

    p_crudo = predecir_proba_binaria(candidato, x)
    p_cal = bundle.calibrador.aplicar(np.array([p_crudo]))[0] if bundle.calibrador is not None else p_crudo
    probabilidad = round(float(p_cal) * 100, 1)

    factores_crudos = calcular_factores(
        candidato,
        x,
        bundle.nombres,
        np.array(bundle.medianas, dtype=float),
        etiquetas=bundle.etiquetas,
    )
    factores = [Factor(texto=f["texto"], contribucion=f["contribucion"]) for f in factores_crudos]

    return RespuestaPredict(
        probabilidad=probabilidad,
        factores=factores,
        version=bundle.version,
        proveedor="python-gbm",
        latenciaMs=round((time.perf_counter() - inicio) * 1000, 2),
    )
