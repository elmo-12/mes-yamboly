"""Guardarraíles de `/entrenar` (§3 del contrato). Cualquier fallo aquí es
un 422: nunca se entrena con datos filtrados ni con un snapshot que no
coincide con lo que Nest cree haber mandado.
"""

from __future__ import annotations

import hashlib
import json


class ErrorValidacion(Exception):
    """Se traduce a HTTP 422 en la capa de rutas."""


MINIMO_FILAS_ANTICIPADO = 200


def calcular_sha256_muestras(muestras: list[dict]) -> str:
    """Hash canónico de `muestras`: JSON compacto con claves ordenadas.

    Nota de coordinación con el bloque B (Nest): el hash sólo es comparable
    si `EntrenamientoContinuoService` serializa con el mismo criterio
    (`JSON.stringify` de un objeto con las claves ordenadas y sin espacios).
    Se documenta aquí porque es el punto de acoplamiento más frágil del
    contrato entre lenguajes.
    """
    canonico = json.dumps(muestras, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def verificar_snapshot(muestras: list[dict], sha256_declarado: str) -> None:
    recalculado = calcular_sha256_muestras(muestras)
    if recalculado != sha256_declarado:
        raise ErrorValidacion(
            f"snapshot.sha256 no coincide con el recalculado sobre `muestras` "
            f"(declarado={sha256_declarado}, recalculado={recalculado})"
        )


def verificar_antifuga(muestras: list[dict], prohibidas: list[str]) -> None:
    """Ninguna fila `modo='anticipado'` puede traer una columna de
    `prohibidas` en su diccionario `features` (regla dura §3)."""
    prohibidas_set = set(prohibidas)
    if not prohibidas_set:
        return
    for m in muestras:
        if m.get("modo") != "anticipado":
            continue
        features = m.get("features") or {}
        encontradas = prohibidas_set.intersection(features.keys())
        if encontradas:
            raise ErrorValidacion(
                "Fuga de datos: la fila anticipada "
                f"{m.get('lineaCodigo')}/{m.get('fecha')}/{m.get('turno')} trae columnas "
                f"prohibidas {sorted(encontradas)}"
            )


def verificar_minimos(muestras: list[dict], catalogo: list[dict], objetivo_binario: str | None = None) -> None:
    if not catalogo:
        raise ErrorValidacion("`catalogo` no puede estar vacío")

    anticipadas = [m for m in muestras if m.get("modo") == "anticipado"]
    if len(anticipadas) < MINIMO_FILAS_ANTICIPADO:
        raise ErrorValidacion(
            f"Se requieren al menos {MINIMO_FILAS_ANTICIPADO} filas `anticipado`; "
            f"llegaron {len(anticipadas)}"
        )

    if objetivo_binario:
        clases = {m.get(objetivo_binario) for m in anticipadas if m.get(objetivo_binario) is not None}
        if len(clases) < 2:
            raise ErrorValidacion(f"`{objetivo_binario}` tiene una sola clase en las filas anticipadas")
