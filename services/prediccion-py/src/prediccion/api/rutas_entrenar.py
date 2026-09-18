"""`POST /entrenar` (§3 del contrato). Síncrono, protegido por
`X-Internal-Token` y por un `asyncio.Lock` que devuelve 409 si ya hay un
entrenamiento en curso. Valida guardarraíl anti-fuga y snapshot antes de
tocar un sólo modelo.
"""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import obtener_config
from ..dominio.entrenamiento import (
    ObjetivoNoEntrenable,
    TodosLosObjetivosFallaron,
    entrenar_binario,
    entrenar_multiclase,
    entrenar_regresion,
)
from ..dominio.validacion import ErrorValidacion, verificar_antifuga, verificar_minimos, verificar_snapshot
from ..estado import COLUMNA_TARGET, TIPO_OBJETIVO, obtener_estado
from ..registro import artefactos, registro
from ..common import ahora_iso
from .esquemas import EntrenarRequest
from .seguridad import exigir_token_interno

router = APIRouter()
logger = logging.getLogger("prediccion.entrenar")


@router.post("/entrenar", dependencies=[Depends(exigir_token_interno)])
async def entrenar(datos: EntrenarRequest, request: Request) -> dict:
    inicio = time.perf_counter()
    estado = obtener_estado()
    config = obtener_config()

    cuerpo_crudo = await request.json()
    muestras_crudas = cuerpo_crudo.get("muestras", [])

    try:
        verificar_snapshot(muestras_crudas, datos.snapshot.sha256)
        muestras_dict = [m.model_dump() for m in datos.muestras]
        verificar_antifuga(muestras_dict, datos.prohibidas)
        catalogo_dict = [c.model_dump() for c in datos.catalogo]
        for objetivo in datos.objetivos:
            columna = COLUMNA_TARGET.get(objetivo)
            tipo = TIPO_OBJETIVO.get(objetivo)
            binaria = columna if tipo == "binario" else None
            verificar_minimos(muestras_dict, catalogo_dict, objetivo_binario=binaria)
    except ErrorValidacion as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    lock = estado.lock_entrenamiento
    if lock.locked():
        raise HTTPException(status_code=409, detail="Ya hay un entrenamiento en curso")
    await lock.acquire()
    try:
        # CPU-bound (sklearn/LightGBM): se corre en un hilo aparte para no
        # bloquear el loop de eventos y así poder seguir sirviendo
        # `/predict` y `/salud` mientras el entrenamiento está en curso.
        resultados = await asyncio.to_thread(_entrenar_todos, datos, muestras_dict, catalogo_dict, config)
    except ErrorValidacion as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except TodosLosObjetivosFallaron as error:
        # Aislamiento por objetivo (§3 del contrato): 500 sólo cuando *ningún*
        # objetivo pedido pudo entrenarse. `error.resultados` trae el motivo
        # de cada uno para que Nest lo archive.
        logger.error("Todos los objetivos fallaron: %s", error.resultados)
        raise HTTPException(
            status_code=500,
            detail={"error": "Todos los objetivos fallaron", "resultados": error.resultados},
        ) from error
    except Exception as error:  # noqa: BLE001 - se traduce a 500 documentado por contrato
        logger.exception("Fallo de entrenamiento")
        raise HTTPException(status_code=500, detail=f"Fallo de entrenamiento: {error}") from error
    finally:
        lock.release()

    duracion_ms = round((time.perf_counter() - inicio) * 1000, 1)
    return {
        "runId": f"TRAIN-{datos.version}",
        "resultados": resultados,
        "duracionMs": duracion_ms,
    }


def _entrenar_todos(datos: EntrenarRequest, muestras_dict: list[dict], catalogo_dict: list[dict], config) -> dict:
    prohibidas_set = set(datos.prohibidas)
    nombres = [c["nombre"] for c in catalogo_dict if c["nombre"] not in prohibidas_set]
    nombres_retro = [c["nombre"] for c in catalogo_dict]
    etiquetas = {c["nombre"]: c["etiqueta"] for c in catalogo_dict}

    muestras_anticipado = [m for m in muestras_dict if m["modo"] == "anticipado"]
    muestras_retro = [m for m in muestras_dict if m["modo"] == "retro"]
    campeon = datos.campeon.model_dump() if datos.campeon is not None else None

    estado = obtener_estado()
    resultados: dict[str, dict] = {}
    exitosos = 0

    for objetivo in datos.objetivos:
        tipo = TIPO_OBJETIVO.get(objetivo)
        columna = COLUMNA_TARGET.get(objetivo)
        if tipo is None or columna is None:
            # No es un fallo de entrenamiento aislable: es una petición mal
            # formada (objetivo que no existe), así que sigue siendo 422
            # para toda la corrida.
            raise ErrorValidacion(f"Objetivo desconocido: {objetivo}")

        try:
            resultados[objetivo] = _entrenar_un_objetivo(
                objetivo=objetivo,
                tipo=tipo,
                columna=columna,
                datos=datos,
                config=config,
                estado=estado,
                muestras_anticipado=muestras_anticipado,
                muestras_retro=muestras_retro,
                nombres=nombres,
                nombres_retro=nombres_retro,
                etiquetas=etiquetas,
                campeon=campeon,
            )
            exitosos += 1
        except ObjetivoNoEntrenable as error:
            logger.warning("Objetivo %s no entrenable: %s", objetivo, error)
            resultados[objetivo] = {"error": str(error)}
        except Exception as error:  # noqa: BLE001 - aislamiento: un objetivo no se lleva a los demás
            logger.exception("Fallo inesperado entrenando %s", objetivo)
            resultados[objetivo] = {"error": f"fallo inesperado: {error}"}

    if exitosos == 0:
        raise TodosLosObjetivosFallaron(resultados)

    return resultados


def _entrenar_un_objetivo(
    *,
    objetivo: str,
    tipo: str,
    columna: str,
    datos: EntrenarRequest,
    config,
    estado,
    muestras_anticipado: list[dict],
    muestras_retro: list[dict],
    nombres: list[str],
    nombres_retro: list[str],
    etiquetas: dict[str, str],
    campeon: dict | None,
) -> dict:
    """Entrena, persiste y activa un único objetivo. Cualquier excepción que
    lance queda a cargo del llamador (`_entrenar_todos`), que la aísla del
    resto de objetivos de la misma corrida."""
    if tipo == "binario":
        resultado = entrenar_binario(
            objetivo=objetivo,
            version=datos.version,
            columna_target=columna,
            muestras_anticipado=muestras_anticipado,
            muestras_retro=muestras_retro,
            nombres=nombres,
            nombres_retro=nombres_retro,
            prueba_desde=datos.evaluacion.pruebaDesde,
            semilla=datos.semilla,
            etiquetas=etiquetas,
            campeon=campeon,
        )
    elif tipo == "regresion":
        resultado = entrenar_regresion(
            objetivo=objetivo,
            version=datos.version,
            columna_target=columna,
            muestras_anticipado=muestras_anticipado,
            nombres=nombres,
            prueba_desde=datos.evaluacion.pruebaDesde,
            semilla=datos.semilla,
        )
    else:
        resultado = entrenar_multiclase(
            objetivo=objetivo,
            version=datos.version,
            columna_target=columna,
            muestras_anticipado=muestras_anticipado,
            nombres=nombres,
            prueba_desde=datos.evaluacion.pruebaDesde,
            semilla=datos.semilla,
        )

    bundle = resultado.bundle
    bundle.entrenado_en = ahora_iso()

    artefacto = artefactos.guardar_modelo(config.modelos_dir, objetivo, datos.version, bundle)
    resultado.respuesta["artefacto"] = {
        "uri": artefacto.uri,
        "sha256": artefacto.sha256,
        "bytes": artefacto.bytes,
    }

    umbral_pct = round(bundle.umbral * 100, 2) if tipo == "binario" else 0.0
    metadata = {
        "objetivo": objetivo,
        "algoritmo": bundle.algoritmo,
        "hiperparametros": bundle.hiperparametros,
        "nombres": bundle.nombres,
        "entrenadoEn": bundle.entrenado_en,
        "artefactoSha256": artefacto.sha256,
        "umbralDecisionPct": umbral_pct,
    }
    # `activar=False` a propósito: `/entrenar` **persiste pero no promueve**.
    #
    # Quien decide qué modelo sirve es Nest, con su champion/challenger, y lo
    # comunica con `POST /modelo/{objetivo}/{version}/activar`. Activar aquí
    # anulaba esa decisión en silencio: Nest resolvía «conservo al incumbente»
    # y `/predict` ya estaba sirviendo al retador que acababa de rechazar, con
    # lo que la vigente de Postgres y la activa de Python divergían y la
    # reconciliación de arranque terminaba archivando la vigente buena.
    a_borrar = registro.registrar_version(
        config.modelos_dir, objetivo, datos.version, metadata, config.retencion_versiones, activar=False
    )
    for version_vieja in a_borrar:
        artefactos.borrar_modelo(artefactos.ruta_version(config.modelos_dir, objetivo, version_vieja))

    return resultado.respuesta
