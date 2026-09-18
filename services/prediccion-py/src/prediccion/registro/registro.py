"""`registro.json`: metadatos por objetivo/versión, protegido con
`fcntl.flock` (§7 del contrato) para que dos procesos `uvicorn` (o un
entrenamiento y una lectura concurrente) no se pisen.

Retención de 12 versiones por objetivo; la versión activa nunca se borra
aunque supere la retención.
"""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
import tempfile
from pathlib import Path
from typing import Any

NOMBRE_REGISTRO = "registro.json"
NOMBRE_LOCK = ".registro.lock"


def _ruta_registro(modelos_dir: Path) -> Path:
    return modelos_dir / NOMBRE_REGISTRO


@contextlib.contextmanager
def _bloqueo(modelos_dir: Path):
    modelos_dir.mkdir(parents=True, exist_ok=True)
    ruta_lock = modelos_dir / NOMBRE_LOCK
    fd = os.open(ruta_lock, os.O_CREAT | os.O_RDWR)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def _leer_sin_bloqueo(modelos_dir: Path) -> dict[str, Any]:
    ruta = _ruta_registro(modelos_dir)
    if not ruta.exists():
        return {}
    contenido = ruta.read_text(encoding="utf-8").strip()
    if not contenido:
        return {}
    return json.loads(contenido)


def _escribir_sin_bloqueo(modelos_dir: Path, data: dict[str, Any]) -> None:
    ruta = _ruta_registro(modelos_dir)
    fd, tmp_nombre = tempfile.mkstemp(dir=modelos_dir, prefix=".registro-", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
    os.replace(tmp_nombre, ruta)


def leer(modelos_dir: Path) -> dict[str, Any]:
    with _bloqueo(modelos_dir):
        return _leer_sin_bloqueo(modelos_dir)


def registrar_version(
    modelos_dir: Path,
    objetivo: str,
    version: str,
    metadata: dict[str, Any],
    retencion: int,
    activar: bool = True,
) -> list[str]:
    """Añade una versión, aplica retención y devuelve las versiones que
    quedaron fuera de retención (para que el llamador borre sus `.joblib`).
    Nunca incluye la versión activa entre las que hay que borrar.
    """
    with _bloqueo(modelos_dir):
        data = _leer_sin_bloqueo(modelos_dir)
        bloque = data.setdefault(objetivo, {"activa": None, "orden": [], "versiones": {}})
        bloque["versiones"][version] = metadata
        if version in bloque["orden"]:
            bloque["orden"].remove(version)
        bloque["orden"].append(version)
        if activar:
            bloque["activa"] = version

        a_borrar: list[str] = []
        while len(bloque["orden"]) > retencion:
            # Se borra siempre la más antigua que no sea la activa (regla
            # dura §7: la activa nunca se borra aunque exceda la retención).
            borrables = [v for v in bloque["orden"] if v != bloque["activa"]]
            if not borrables:
                break
            candidata = borrables[0]
            bloque["orden"].remove(candidata)
            del bloque["versiones"][candidata]
            a_borrar.append(candidata)

        _escribir_sin_bloqueo(modelos_dir, data)
        return a_borrar


def activar_version(modelos_dir: Path, objetivo: str, version: str) -> bool:
    """`True` si existía metadata para esa versión y quedó activa."""
    with _bloqueo(modelos_dir):
        data = _leer_sin_bloqueo(modelos_dir)
        bloque = data.get(objetivo)
        if not bloque or version not in bloque.get("versiones", {}):
            return False
        bloque["activa"] = version
        _escribir_sin_bloqueo(modelos_dir, data)
        return True


def desactivar(modelos_dir: Path, objetivo: str) -> None:
    with _bloqueo(modelos_dir):
        data = _leer_sin_bloqueo(modelos_dir)
        bloque = data.get(objetivo)
        if bloque:
            bloque["activa"] = None
            _escribir_sin_bloqueo(modelos_dir, data)


def version_activa(modelos_dir: Path, objetivo: str) -> tuple[str | None, dict[str, Any] | None]:
    data = leer(modelos_dir)
    bloque = data.get(objetivo)
    if not bloque or not bloque.get("activa"):
        return None, None
    version = bloque["activa"]
    return version, bloque["versiones"].get(version)
