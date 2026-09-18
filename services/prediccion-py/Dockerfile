# Servicio de predicción en Python (bloque A, docs/prediccion-python.md).
# Multi-stage con uv: resuelve/instala en un stage con toolchain de build,
# copia sólo el venv resultante a la imagen final (sin compiladores).

FROM python:3.12-slim AS build

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /usr/local/bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Capa de dependencias separada del código para aprovechar la caché de
# Docker: cambiar `src/` no reinstala LightGBM/scikit-learn/scipy.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY src ./src
COPY README.md ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS runtime

# LightGBM enlaza contra libgomp (OpenMP) en tiempo de ejecución; no viene en
# la imagen `slim`.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system prediccion && useradd --system --gid prediccion --create-home prediccion

WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY --from=build /app/src /app/src

ENV PATH="/app/.venv/bin:$PATH" \
    MODELOS_DIR=/modelos \
    PYTHONUNBUFFERED=1 \
    TZ=America/Lima

RUN mkdir -p /modelos && chown -R prediccion:prediccion /modelos
USER prediccion

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/salud', timeout=3).status == 200 else 1)"

CMD ["uvicorn", "prediccion.main:app", "--host", "0.0.0.0", "--port", "8000"]
