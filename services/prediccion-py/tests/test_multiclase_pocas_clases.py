"""`causa_dominante` sobre un recorte de datos (semilla de la imagen Docker):
los primeros pliegues walk-forward solo ven 2 clases en entrenamiento. Con
`objective="multiclass"` forzado, LightGBM fallaba ("Number of classes should
be specified and greater than 1"); sin forzarlo elige `binary` con 2 clases y
el objetivo debe entrenar igual que con 3."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from prediccion.dominio.entrenamiento import ObjetivoNoEntrenable, entrenar_multiclase

NOMBRES = ["x1", "x2"]


def _muestras(secuencia_clases_por_dia: list[list[str]]) -> list[dict]:
    inicio = date(2026, 7, 22)
    filas = []
    for i, clases in enumerate(secuencia_clases_por_dia):
        fecha = (inicio + timedelta(days=i)).isoformat()
        for j, clase in enumerate(clases):
            sesgo = {"A": 0.0, "B": 1.0, "C": 2.0}[clase]
            filas.append(
                {
                    "fecha": fecha,
                    "turno": j,
                    "causa": clase,
                    "features": {"x1": sesgo + 0.1 * j, "x2": float(i % 5)},
                }
            )
    return filas


def _entrenar(muestras: list[dict], prueba_desde: str):
    return entrenar_multiclase(
        objetivo="causa_dominante",
        version="vtest",
        columna_target="causa",
        muestras_anticipado=muestras,
        nombres=NOMBRES,
        prueba_desde=prueba_desde,
        semilla=42,
    )


def test_pliegues_iniciales_con_dos_clases_no_rompen() -> None:
    # Días 0-29: solo A y B (2 clases). La clase C aparece recién desde el día 30,
    # así que los primeros pliegues entrenan con 2 clases y los últimos con 3.
    dias = [["A", "B", "A", "B"] for _ in range(30)] + [["A", "B", "C", "C"] for _ in range(30)]
    muestras = _muestras(dias)
    resultado = _entrenar(muestras, prueba_desde="2026-09-10")
    assert resultado.respuesta["pliegues"]
    assert set(resultado.bundle.clases) == {"A", "B", "C"}
    assert 0.0 <= resultado.respuesta["metricas"]["f1Macro"] <= 1.0


def test_solo_dos_clases_en_todo_el_conjunto_entrena() -> None:
    muestras = _muestras([["A", "B", "A", "B"] for _ in range(40)])
    resultado = _entrenar(muestras, prueba_desde="2026-08-25")
    assert set(resultado.bundle.clases) == {"A", "B"}
    assert resultado.respuesta["pliegues"]


def test_validacion_con_clase_no_vista_en_entrenamiento_no_rompe_metricas() -> None:
    # C solo existe al final: puede estar en validación sin estar en el fit.
    dias = [["A", "B", "A", "B"] for _ in range(45)] + [["C", "A", "C", "B"] for _ in range(5)]
    resultado = _entrenar(_muestras(dias), prueba_desde="2026-09-05")
    assert 0.0 <= resultado.respuesta["metricas"]["accuracy"] <= 1.0


def test_una_sola_clase_es_no_entrenable_con_motivo() -> None:
    muestras = _muestras([["A", "A", "A", "A"] for _ in range(40)])
    with pytest.raises(ObjetivoNoEntrenable, match="clases"):
        _entrenar(muestras, prueba_desde="2026-08-25")
