"""CLI de operación (`uv run prediccion ...`). Reutiliza exactamente la
misma tubería que `POST /entrenar` (`api/rutas_entrenar._entrenar_todos`)
para poder entrenar sin levantar el servidor — útil para el cron del
servicio `entrenador` y para pruebas manuales locales.
"""

from __future__ import annotations

import argparse
import json
import sys

from .config import obtener_config
from .dominio.validacion import ErrorValidacion, verificar_antifuga, verificar_minimos, verificar_snapshot
from .estado import COLUMNA_TARGET, TIPO_OBJETIVO


def _cmd_entrenar(args: argparse.Namespace) -> int:
    from .api.esquemas import EntrenarRequest
    from .api.rutas_entrenar import _entrenar_todos

    with open(args.fixture, encoding="utf-8") as f:
        data = json.load(f)

    try:
        datos = EntrenarRequest(**data)
        muestras_crudas = data.get("muestras", [])
        verificar_snapshot(muestras_crudas, datos.snapshot.sha256)
        muestras_dict = [m.model_dump() for m in datos.muestras]
        verificar_antifuga(muestras_dict, datos.prohibidas)
        catalogo_dict = [c.model_dump() for c in datos.catalogo]
        for objetivo in datos.objetivos:
            columna = COLUMNA_TARGET.get(objetivo)
            tipo = TIPO_OBJETIVO.get(objetivo)
            verificar_minimos(muestras_dict, catalogo_dict, objetivo_binario=columna if tipo == "binario" else None)
    except ErrorValidacion as error:
        print(f"422 {error}", file=sys.stderr)
        return 1

    config = obtener_config()
    resultados = _entrenar_todos(datos, muestras_dict, catalogo_dict, config)

    resumen = {
        objetivo: {
            k: v
            for k, v in r.items()
            if k in ("algoritmo", "muestras", "features", "walkForward", "metricas", "artefacto", "pliegues")
        }
        for objetivo, r in resultados.items()
    }
    print(json.dumps({"runId": f"TRAIN-{datos.version}", "resultados": resumen}, indent=2, default=str))
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(prog="prediccion", description="CLI del servicio de predicción")
    subparsers = parser.add_subparsers(dest="comando", required=True)

    entrenar_parser = subparsers.add_parser("entrenar", help="Entrena todos los objetivos desde un fixture JSON")
    entrenar_parser.add_argument("--fixture", required=True, help="Ruta a un JSON con la forma de POST /entrenar")
    entrenar_parser.set_defaults(func=_cmd_entrenar)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
