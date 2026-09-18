"""Configuración del servicio, leída de variables de entorno (§4 del contrato).

Sin dependencias de Nest ni de PostgreSQL: Python nunca toca la base (regla
dura nº1 de ``docs/prediccion-python.md``).
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    # Directorio donde se guardan los `.joblib` y `registro.json` por objetivo.
    modelos_dir: Path = Path("./modelos")

    # Token compartido con Nest para las mutaciones (§4 del contrato). Vacío =
    # sin autenticación (desarrollo local, puerto sólo en 127.0.0.1).
    prediccion_token: str = ""

    # Cuántas versiones por objetivo se conservan; la activa nunca se borra.
    retencion_versiones: int = 12

    # Semilla por defecto si `/entrenar` no manda una explícita.
    semilla_defecto: int = 42

    # Número de pliegues expansivos del walk-forward (igual que
    # `PLIEGUES` en `evaluacion.service.ts`).
    pliegues: int = 5

    zona_horaria: str = "America/Lima"


_config: Config | None = None


def obtener_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
        _config.modelos_dir.mkdir(parents=True, exist_ok=True)
    return _config


def resetear_config_para_pruebas() -> None:
    """Sólo para pytest: fuerza releer las variables de entorno."""
    global _config
    _config = None
