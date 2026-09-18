"""Pipeline completo contra el patrón plantado: `LIN-C` + turno Noche es
siempre positivo. El modelo debe descubrirlo (top-3 de importancias) y el
walk-forward debe separar bien las clases (AUC alto)."""

from __future__ import annotations

from fixtures import CATALOGO, PROHIBIDAS, generar_muestras

from prediccion.dominio.entrenamiento import entrenar_binario


def test_patron_plantado_aparece_en_top3_importancias() -> None:
    muestras = generar_muestras(semilla=11, n_dias=60)
    nombres = [c["nombre"] for c in CATALOGO if c["nombre"] not in set(PROHIBIDAS)]
    nombres_retro = [c["nombre"] for c in CATALOGO]
    etiquetas = {c["nombre"]: c["etiqueta"] for c in CATALOGO}
    anticipado = [m for m in muestras if m["modo"] == "anticipado"]
    retro = [m for m in muestras if m["modo"] == "retro"]
    dias = sorted({m["fecha"] for m in anticipado})
    prueba_desde = dias[int(len(dias) * 0.8)]

    resultado = entrenar_binario(
        objetivo="parada_imprevista",
        version="vplantado",
        columna_target="huboParadaImprevista",
        muestras_anticipado=anticipado,
        muestras_retro=retro,
        nombres=nombres,
        nombres_retro=nombres_retro,
        prueba_desde=prueba_desde,
        semilla=42,
        etiquetas=etiquetas,
    )

    top3 = {i["nombre"] for i in resultado.respuesta["importancias"][:3]}
    assert top3 & {"linea_LIN_C", "turnoEsNoche"}, f"top3={top3}"

    # Con una señal tan fuerte plantada, el walk-forward debe separar bien.
    assert resultado.respuesta["walkForward"]["aucRoc"] >= 0.75


def test_prediccion_de_linea_c_noche_da_probabilidad_alta() -> None:
    muestras = generar_muestras(semilla=11, n_dias=60)
    nombres = [c["nombre"] for c in CATALOGO if c["nombre"] not in set(PROHIBIDAS)]
    nombres_retro = [c["nombre"] for c in CATALOGO]
    etiquetas = {c["nombre"]: c["etiqueta"] for c in CATALOGO}
    anticipado = [m for m in muestras if m["modo"] == "anticipado"]
    retro = [m for m in muestras if m["modo"] == "retro"]
    dias = sorted({m["fecha"] for m in anticipado})
    prueba_desde = dias[int(len(dias) * 0.8)]

    resultado = entrenar_binario(
        objetivo="parada_imprevista",
        version="vplantado2",
        columna_target="huboParadaImprevista",
        muestras_anticipado=anticipado,
        muestras_retro=retro,
        nombres=nombres,
        nombres_retro=nombres_retro,
        prueba_desde=prueba_desde,
        semilla=42,
        etiquetas=etiquetas,
    )

    import numpy as np

    from prediccion.dominio.contexto import features_desde_contexto_estrecho, vectorizar_por_nombre
    from prediccion.dominio.explicacion import predecir_proba_binaria
    from prediccion.dominio.modelo import Candidato

    ctx = {
        "eventos7d": 2,
        "eventos30d": 8,
        "desvioVelocidadPct": -2.0,
        "oeeActual": 70.0,
        "turno": "N",
        "lineaCodigo": "LIN-C",
    }
    x = vectorizar_por_nombre(features_desde_contexto_estrecho(ctx), nombres)
    candidato = Candidato(algoritmo=resultado.bundle.algoritmo, estimador=resultado.bundle.estimador)
    p_crudo = predecir_proba_binaria(candidato, x)
    p_cal = float(resultado.bundle.calibrador.aplicar(np.array([p_crudo]))[0])
    assert p_cal >= 0.6
