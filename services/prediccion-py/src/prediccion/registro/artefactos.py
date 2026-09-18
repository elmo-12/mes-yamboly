"""Persistencia de artefactos `.joblib` (§7 del contrato): escritura atómica
(tmp → rename), sha256, retención de 12 versiones, la activa nunca se borra.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import joblib


@dataclass
class ArtefactoGuardado:
    uri: str
    ruta: Path
    sha256: str
    bytes: int


def ruta_objetivo(modelos_dir: Path, objetivo: str) -> Path:
    ruta = modelos_dir / objetivo
    ruta.mkdir(parents=True, exist_ok=True)
    return ruta


def ruta_version(modelos_dir: Path, objetivo: str, version: str) -> Path:
    return ruta_objetivo(modelos_dir, objetivo) / f"{version}.joblib"


def guardar_modelo(modelos_dir: Path, objetivo: str, version: str, payload: object) -> ArtefactoGuardado:
    """Escritura atómica: se vuelca a un temporal en el mismo directorio y se
    renombra (`os.replace`), que en POSIX es atómico incluso si el proceso
    muere a mitad de camino."""
    destino = ruta_version(modelos_dir, objetivo, version)
    destino.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_nombre = tempfile.mkstemp(dir=destino.parent, prefix=f".{version}-", suffix=".tmp")
    os.close(fd)
    tmp_ruta = Path(tmp_nombre)
    try:
        joblib.dump(payload, tmp_ruta)
        os.replace(tmp_ruta, destino)
    except BaseException:
        tmp_ruta.unlink(missing_ok=True)
        raise

    contenido = destino.read_bytes()
    sha256 = hashlib.sha256(contenido).hexdigest()
    return ArtefactoGuardado(
        uri=f"modelos/{objetivo}/{version}.joblib",
        ruta=destino,
        sha256=sha256,
        bytes=len(contenido),
    )


def cargar_modelo(ruta: Path) -> object:
    return joblib.load(ruta)


def borrar_modelo(ruta: Path) -> None:
    ruta.unlink(missing_ok=True)


def sha256_de(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()
