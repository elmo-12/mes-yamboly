"""Generador de un dataset sintético determinista para las pruebas.

Incluye un **patrón plantado**: la línea `LIN-C` en turno Noche siempre es
positiva para `parada_imprevista`. El pipeline debe redescubrirlo en el
top-3 de importancias (ver `test_entrenamiento.py::test_patron_plantado`).
"""

from __future__ import annotations

import random
from datetime import date, timedelta

from prediccion.dominio.validacion import calcular_sha256_muestras

LINEAS = ["LIN-A", "LIN-B", "LIN-C"]
TURNOS = ["D", "N"]

PROHIBIDAS = [
    "oeeTotal",
    "oeeDisponibilidad",
    "oeeRendimiento",
    "oeeCalidad",
    "velocidadRealUnidMin",
    "desvioVelocidadPct",
    "mermaKgTurno",
]

CATALOGO = [
    {"nombre": "diaSemana", "grupo": "calendario", "etiqueta": "Día de la semana"},
    {"nombre": "esFinDeSemana", "grupo": "calendario", "etiqueta": "Fin de semana"},
    {"nombre": "turnoEsNoche", "grupo": "calendario", "etiqueta": "Turno Noche"},
    {"nombre": "paradasImprev7d", "grupo": "historico7d", "etiqueta": "Paradas imprevistas 7 d"},
    {"nombre": "paradasImprev30d", "grupo": "historico30d", "etiqueta": "Paradas imprevistas 30 d"},
    {"nombre": "oeeTurnoPrevio", "grupo": "turno_previo", "etiqueta": "OEE del turno anterior"},
    {"nombre": "desvioVelocidadTurnoPrevio", "grupo": "turno_previo", "etiqueta": "Desvío de velocidad anterior"},
    {"nombre": "linea_LIN_A", "grupo": "linea", "etiqueta": "Línea LIN-A"},
    {"nombre": "linea_LIN_B", "grupo": "linea", "etiqueta": "Línea LIN-B"},
    {"nombre": "linea_LIN_C", "grupo": "linea", "etiqueta": "Línea LIN-C"},
    {"nombre": "oeeTotal", "grupo": "turno_actual", "etiqueta": "OEE del turno"},
    {"nombre": "oeeDisponibilidad", "grupo": "turno_actual", "etiqueta": "Disponibilidad"},
    {"nombre": "oeeRendimiento", "grupo": "turno_actual", "etiqueta": "Rendimiento"},
    {"nombre": "oeeCalidad", "grupo": "turno_actual", "etiqueta": "Calidad"},
    {"nombre": "velocidadRealUnidMin", "grupo": "turno_actual", "etiqueta": "Velocidad real"},
    {"nombre": "desvioVelocidadPct", "grupo": "turno_actual", "etiqueta": "Desvío de velocidad"},
    {"nombre": "mermaKgTurno", "grupo": "turno_actual", "etiqueta": "Merma del turno"},
]

CAUSAS = ["CPA-PN-02", "CPA-PN-03", "CPA-PN-04", "CPA-PS-99"]


def _linea_feature(codigo: str) -> str:
    return "linea_" + codigo.replace("-", "_")


def generar_muestras(semilla: int = 42, n_dias: int = 90) -> list[dict]:
    rng = random.Random(semilla)
    inicio = date(2026, 1, 5)
    muestras: list[dict] = []

    for d in range(n_dias):
        fecha = inicio + timedelta(days=d)
        fecha_str = fecha.isoformat()
        for linea in LINEAS:
            for turno in TURNOS:
                plantado = linea == "LIN-C" and turno == "N"
                hubo_parada = 1 if plantado else (1 if rng.random() < 0.2 else 0)
                merma = 1 if rng.random() < 0.25 else 0
                minutos = round(rng.gauss(45, 12), 1) if hubo_parada else round(max(0.0, rng.gauss(4, 3)), 1)
                minutos = max(minutos, 0.0)
                causa = rng.choice(CAUSAS) if hubo_parada else None

                features_anticipadas = {
                    "diaSemana": fecha.weekday(),
                    "esFinDeSemana": 1 if fecha.weekday() >= 5 else 0,
                    "turnoEsNoche": 1 if turno == "N" else 0,
                    "paradasImprev7d": rng.randint(0, 5),
                    "paradasImprev30d": rng.randint(0, 15),
                    "oeeTurnoPrevio": round(rng.uniform(55, 85), 1),
                    "desvioVelocidadTurnoPrevio": round(rng.uniform(-8, 2), 1),
                    _linea_feature(linea): 1,
                }

                base = {
                    "lineaId": f"LINEA-{linea}",
                    "lineaCodigo": linea,
                    "fecha": fecha_str,
                    "turno": turno,
                    "inicioTurno": f"{fecha_str}T{'06' if turno == 'D' else '18'}:00:00",
                    "huboParadaImprevista": hubo_parada,
                    "mermaSobreEstandar": merma,
                    "minutosImprevistos": minutos,
                    "tipoCausaDominante": causa,
                }

                muestras.append({**base, "modo": "anticipado", "features": features_anticipadas})

                features_retro = {
                    **features_anticipadas,
                    "oeeTotal": round(rng.uniform(50, 90), 1),
                    "oeeDisponibilidad": round(rng.uniform(70, 99), 1),
                    "oeeRendimiento": round(rng.uniform(70, 99), 1),
                    "oeeCalidad": round(rng.uniform(90, 100), 1),
                    "velocidadRealUnidMin": round(rng.uniform(80, 140), 1),
                    "desvioVelocidadPct": round(rng.uniform(-10, 5), 1),
                    "mermaKgTurno": round(rng.uniform(0, 40), 1),
                }
                muestras.append({**base, "modo": "retro", "features": features_retro})

    return muestras


def generar_request(
    semilla: int = 42, n_dias: int = 90, version: str = "vtest-1", campeon: dict | None = None
) -> dict:
    muestras = generar_muestras(semilla=semilla, n_dias=n_dias)
    dias = sorted({m["fecha"] for m in muestras})
    prueba_desde = dias[int(len(dias) * 0.8)]

    return {
        "version": version,
        "objetivos": ["parada_imprevista", "merma_sobre_estandar", "minutos_imprevistos", "causa_dominante"],
        "snapshot": {
            "sha256": calcular_sha256_muestras(muestras),
            "filas": len(muestras),
            "desde": dias[0],
            "hasta": dias[-1],
        },
        "catalogo": CATALOGO,
        "prohibidas": PROHIBIDAS,
        "evaluacion": {"pruebaDesde": prueba_desde, "pliegues": []},
        "muestras": muestras,
        "campeon": campeon,
        "semilla": semilla,
    }
