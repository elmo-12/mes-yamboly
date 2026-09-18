"""Punto de entrada FastAPI (§1 del contrato). Python nunca escribe en
PostgreSQL ni reconstruye features: sólo sirve `/predict` con el modelo
activo en memoria y ejecuta `/entrenar` cuando Nest se lo pide."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import rutas_entrenar, rutas_modelo, rutas_predict, rutas_salud
from .config import obtener_config
from .estado import OBJETIVOS, obtener_estado
from .registro import artefactos, registro

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prediccion")


def _cargar_modelos_activos() -> None:
    """Al arrancar, carga el modelo activo de cada objetivo si existe. Si
    falla uno, sigue con los demás: el servicio arranca `degradado`, nunca
    se cae por falta de artefactos (regla dura §1.4)."""
    config = obtener_config()
    estado = obtener_estado()
    for objetivo in OBJETIVOS:
        try:
            version, metadata = registro.version_activa(config.modelos_dir, objetivo)
            if not version:
                continue
            ruta = artefactos.ruta_version(config.modelos_dir, objetivo, version)
            if not ruta.exists():
                logger.warning("Artefacto activo %s/%s no existe en disco", objetivo, version)
                continue
            estado.modelos[objetivo] = artefactos.cargar_modelo(ruta)
            logger.info("Modelo cargado: %s/%s", objetivo, version)
        except Exception:  # noqa: BLE001
            logger.exception("No se pudo cargar el modelo activo de %s", objetivo)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _cargar_modelos_activos()
    yield


def crear_app() -> FastAPI:
    app = FastAPI(
        title="prediccion-py",
        description="Servicio de predicción del MES yamboly (bloque A del contrato)",
        lifespan=lifespan,
    )
    app.include_router(rutas_salud.router)
    app.include_router(rutas_predict.router)
    app.include_router(rutas_entrenar.router)
    app.include_router(rutas_modelo.router)
    return app


app = crear_app()
