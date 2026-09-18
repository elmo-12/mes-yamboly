#!/bin/sh
# Dispara el reentrenamiento continuo de analítica en Nest (bloque C/D del
# plan). Este contenedor no toca PostgreSQL ni el volumen de modelos: sólo
# hace el POST; todo el trabajo real ocurre en la API y en `prediccion`.
set -eu

: "${API_URL:?Falta API_URL (p. ej. http://host.docker.internal:4000)}"

url="${API_URL%/}/api/v1/analitica/reentrenar/continuo"
echo "$(date -Iseconds) POST ${url}"

curl -fsS -X POST "${url}" \
  ${PREDICCION_TOKEN:+-H "X-Internal-Token: ${PREDICCION_TOKEN}"} \
  -o /dev/null -w 'reentrenar.continuo -> HTTP %{http_code} (%{time_total}s)\n'
