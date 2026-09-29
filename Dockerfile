# Imagen única del MES Yamboly para ejecutarla desde Docker Desktop: web (Next,
# puerto 3000) + API (Nest, 4000 interno) + predicción (Python, 8000 interno) en
# un mismo contenedor, sobre SQLite que se siembra sola en el primer arranque.
# Sólo hay que publicar el 3000: el navegador habla con Next y Next reenvía
# `/api/v1/*` a la API; la API es la única que habla con Python.
#
#   docker build -t mes-yamboly .
#   docker run -p 3000:3000 mes-yamboly      → http://localhost:3000
#
# PostgreSQL sigue siendo opcional: `DATABASE_URL` se puede pasar al contenedor.
#
# Base inicial: si existe `docker/semilla/mes.sqlite` (recorte de datos reales,
# `pnpm --filter @mes/api exportar:demo`) el primer arranque parte de ella y
# entrena el modelo; si no, la API siembra los datos de demostración.

# --- Python: mismo build que services/prediccion-py/Dockerfile --------------
FROM python:3.12-slim-bookworm AS build-py

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /usr/local/bin/

WORKDIR /app/prediccion

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY services/prediccion-py/pyproject.toml services/prediccion-py/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY services/prediccion-py/src ./src
COPY services/prediccion-py/README.md ./
RUN uv sync --frozen --no-dev

# Aligera el venv: los tests, stubs de tipos y cabeceras C de numpy/scipy/sklearn
# no se usan en ejecución (≈100 MB). Los `.pyc` se conservan: el usuario `mes` no
# puede escribir en el venv y sin ellos cada arranque recompilaría scipy/sklearn.
RUN cd .venv/lib/python3.12/site-packages \
    && find . -type d -name tests -prune -exec rm -rf {} + \
    && find . -type f \( -name '*.pyi' -o -name '*.pxd' -o -name '*.pyx' -o -name '*.c' -o -name '*.h' -o -name '*.cpp' \) -delete \
    && rm -rf numpy/_core/include pip* setuptools* \
    && /app/prediccion/.venv/bin/python -c "import numpy, scipy.sparse, sklearn.ensemble, sklearn.linear_model, fastapi, uvicorn"

# --- Node: web + API ---------------------------------------------------------
FROM node:22-bookworm-slim AS build

# Toolchain de respaldo por si `sqlite3` no encuentra binario precompilado.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /repo

# Descarga las dependencias sólo con el lockfile: la capa no se invalida al
# cambiar el código y el store de pnpm persiste entre builds (y entre
# arquitecturas) en una caché de BuildKit. Pocas conexiones y reintentos porque
# la red de Docker Desktop corta sockets con la concurrencia por defecto.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm fetch --frozen-lockfile --store-dir=/pnpm/store \
      --network-concurrency=4 --fetch-retries=6 --fetch-timeout=120000

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prefer-offline --store-dir=/pnpm/store \
      --network-concurrency=4 --fetch-retries=6 --fetch-timeout=120000

# Variables `NEXT_PUBLIC_*` y rewrites se congelan en el build de Next.
ENV NEXT_PUBLIC_DATA_SOURCE=api \
    NEXT_PUBLIC_API_URL=/api/v1 \
    API_PROXY_URL=http://127.0.0.1:4000 \
    NEXT_OUTPUT=standalone
RUN pnpm turbo run build --filter=@mes/api --filter=@mes/web

# API con sólo sus dependencias de producción (workspace incluido).
RUN pnpm --filter @mes/api deploy --prod --legacy /out/api

# Aligera lo desplegado: TypeScript, typings, ts-node, sharp (no se usa
# `next/image`), fuentes de compilación de sqlite3, mapas y documentación. Las
# licencias se conservan.
RUN for dir in /out/api/node_modules/.pnpm /repo/apps/web/.next/standalone/node_modules/.pnpm; do \
      cd "$dir" \
      && rm -rf typescript@* ts-node@* @types+* @img+sharp-* sharp@* node-gyp@* \
      && find . -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o -name 'README*' -o -name 'CHANGELOG*' -o -name 'HISTORY*' \) -delete \
      && find . -xtype l -delete; \
    done \
    && cd /out/api/node_modules/.pnpm \
    && find . -type d \( -name docs -o -name example -o -name examples -o -name test -o -name tests -o -name __tests__ -o -name .github \) -prune -exec rm -rf {} + \
    && rm -rf sqlite3@*/node_modules/sqlite3/deps sqlite3@*/node_modules/sqlite3/src \
       sqlite3@*/node_modules/sqlite3/build/Release/obj* sqlite3@*/node_modules/sqlite3/build/Release/.deps \
    && cd /out/api \
    && node -e "require('reflect-metadata'); for (const m of ['sqlite3', 'typeorm', 'pg', 'exceljs', '@nestjs/core', '@nestjs/swagger', '@nestjs/typeorm', '@nestjs/schedule']) require(m)"

# El runtime parte de Python (el venv enlaza contra /usr/local/bin/python3.12)
# y trae el binario de Node de la misma distribución (bookworm), que es lo único
# que necesitan Next standalone y la API ya desplegada.
FROM node:22-bookworm-slim AS node

# Sin símbolos de depuración el binario pasa de ~117 MB a ~99 MB.
RUN apt-get update && apt-get install -y --no-install-recommends binutils \
    && strip /usr/local/bin/node && node --version

FROM python:3.12-slim-bookworm AS runtime

# Vincula el paquete de ghcr.io con el repositorio de GitHub.
LABEL org.opencontainers.image.source="https://github.com/elmo-12/mes-yamboly" \
      org.opencontainers.image.title="MES Yamboly" \
      org.opencontainers.image.description="MES Yamboly: web + API + predicción en un solo contenedor"

# LightGBM enlaza contra libgomp (OpenMP) en tiempo de ejecución.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system mes && useradd --system --gid mes --create-home mes

COPY --from=node /usr/local/bin/node /usr/local/bin/node

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=America/Lima \
    HOSTNAME=0.0.0.0 \
    PORT_WEB=3000 \
    JWT_SECRET=mes-yamboly-docker-demo \
    DB_PATH=./data/mes.sqlite \
    CORS_ORIGIN=http://localhost:3000 \
    PREDICTION_SERVICE_URL=http://127.0.0.1:8000 \
    ENTRENAMIENTO_ACTIVO=true \
    MODELOS_DIR=/app/api/data/modelos \
    RETENCION_VERSIONES=12 \
    PYTHONUNBUFFERED=1 \
    PATH=/app/prediccion/.venv/bin:$PATH

WORKDIR /app

COPY --from=build-py /app/prediccion/.venv ./prediccion/.venv
COPY --from=build-py /app/prediccion/src ./prediccion/src
COPY --from=build --chown=mes:mes /out/api ./api
COPY --from=build --chown=mes:mes /repo/apps/web/.next/standalone ./web
COPY --from=build --chown=mes:mes /repo/apps/web/.next/static ./web/apps/web/.next/static
COPY --from=build --chown=mes:mes /repo/apps/web/public ./web/apps/web/public
COPY --chmod=755 docker/iniciar.sh /usr/local/bin/iniciar.sh
COPY docker/entrenar-inicial.js ./api/entrenar-inicial.js
# Recorte de datos reales (`pnpm --filter @mes/api exportar:demo`); si la
# carpeta sólo trae `.gitkeep`, el contenedor siembra los datos de demostración.
COPY docker/semilla/ ./semilla/

RUN mkdir -p /app/api/data/exports /app/api/data/evidencias /app/api/data/modelos \
    && chown -R mes:mes /app/api/data
USER mes

# Base SQLite, modelos entrenados, evidencias y exportaciones: montar un
# volumen aquí los conserva.
VOLUME /app/api/data

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["iniciar.sh"]
