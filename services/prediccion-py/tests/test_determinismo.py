"""Semilla fija (§8 del contrato): dos corridas con el mismo input deben dar
exactamente las mismas métricas. Se llama al dominio directamente (sin pasar
por HTTP ni por disco) para que la prueba sea rápida y no dependa de I/O.
"""

from __future__ import annotations

from fixtures import generar_muestras, CATALOGO, PROHIBIDAS

from prediccion.dominio.entrenamiento import entrenar_binario


def _entrenar(semilla_datos: int, semilla_modelo: int):
    muestras = generar_muestras(semilla=semilla_datos, n_dias=40)
    nombres = [c["nombre"] for c in CATALOGO if c["nombre"] not in set(PROHIBIDAS)]
    nombres_retro = [c["nombre"] for c in CATALOGO]
    etiquetas = {c["nombre"]: c["etiqueta"] for c in CATALOGO}
    anticipado = [m for m in muestras if m["modo"] == "anticipado"]
    retro = [m for m in muestras if m["modo"] == "retro"]
    dias = sorted({m["fecha"] for m in anticipado})
    prueba_desde = dias[int(len(dias) * 0.8)]

    return entrenar_binario(
        objetivo="parada_imprevista",
        version="vdet",
        columna_target="huboParadaImprevista",
        muestras_anticipado=anticipado,
        muestras_retro=retro,
        nombres=nombres,
        nombres_retro=nombres_retro,
        prueba_desde=prueba_desde,
        semilla=semilla_modelo,
        etiquetas=etiquetas,
    )


def test_dos_corridas_identicas_dan_las_mismas_metricas() -> None:
    r1 = _entrenar(semilla_datos=7, semilla_modelo=42)
    r2 = _entrenar(semilla_datos=7, semilla_modelo=42)

    assert r1.respuesta["algoritmo"] == r2.respuesta["algoritmo"]
    assert r1.respuesta["walkForward"] == r2.respuesta["walkForward"]
    assert r1.respuesta["aucPrueba"] == r2.respuesta["aucPrueba"]
    assert r1.respuesta["aucRetro"] == r2.respuesta["aucRetro"]
    assert r1.respuesta["liftTop3"] == r2.respuesta["liftTop3"]
    assert r1.respuesta["pliegues"] == r2.respuesta["pliegues"]
    assert r1.respuesta["fuera"] == r2.respuesta["fuera"]
    assert r1.respuesta["importancias"] == r2.respuesta["importancias"]
