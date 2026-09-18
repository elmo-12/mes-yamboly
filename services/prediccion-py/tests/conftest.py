from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pytest

from prediccion.config import resetear_config_para_pruebas
from prediccion.estado import resetear_estado_para_pruebas


@pytest.fixture(autouse=True)
def _entorno_aislado(tmp_path, monkeypatch):
    """Cada prueba tiene su propio `MODELOS_DIR` y estado en memoria limpio:
    nada se comparte entre pruebas ni con un `registro.json` real."""
    monkeypatch.setenv("MODELOS_DIR", str(tmp_path / "modelos"))
    monkeypatch.setenv("PREDICCION_TOKEN", "")
    resetear_config_para_pruebas()
    resetear_estado_para_pruebas()
    yield
    resetear_config_para_pruebas()
    resetear_estado_para_pruebas()


@pytest.fixture
def cliente():
    from fastapi.testclient import TestClient

    from prediccion.main import crear_app

    app = crear_app()
    with TestClient(app) as client:
        yield client
