#!/bin/bash
# Arranca predicción (Python), API y web en el mismo contenedor. Python va
# primero porque la API entrena el modelo al sembrar una base vacía y necesita
# `GET /salud` respondiendo. Si cualquiera de los tres cae, el contenedor
# termina (y Docker lo reinicia si tiene política de reinicio).
set -euo pipefail

# Primer arranque: si la imagen trae el recorte de datos reales y el volumen aún
# no tiene base, se parte de él y se entrena el modelo inicial más abajo. Sin
# recorte, la API siembra los datos de demostración como siempre.
entrenar_inicial=0
if [ -z "${DATABASE_URL:-}" ] && [ -f /app/semilla/mes.sqlite ] && [ ! -f /app/api/data/mes.sqlite ]; then
  cp /app/semilla/mes.sqlite /app/api/data/mes.sqlite
  entrenar_inicial=1
fi

cd /app/prediccion
uvicorn prediccion.main:app --host 127.0.0.1 --port 8000 &

for _ in $(seq 1 60); do
  python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/salud', timeout=2)" 2>/dev/null && break
  sleep 1
done

cd /app/api
if [ "$entrenar_inicial" = 1 ]; then
  node entrenar-inicial.js || echo "Aviso: el modelo inicial no se entrenó; Analítica IA quedará sin modelo hasta reentrenar"
fi
PORT=4000 node dist/main.js &

cd /app/web/apps/web
PORT="${PORT_WEB:-3000}" node server.js &

wait -n
exit $?
