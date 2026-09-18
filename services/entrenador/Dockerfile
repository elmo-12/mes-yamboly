# Cron minimalista (alpine + crond) que dispara el reentrenamiento continuo
# de Nest los domingos 03:00 hora de Lima (docker-compose.yml, servicio
# `entrenador`). No toca PostgreSQL ni el volumen de modelos: sólo hace un
# POST HTTP contra la API.

FROM alpine:3.20

RUN apk add --no-cache curl tzdata

COPY crontab /etc/crontabs/root
COPY reentrenar.sh /usr/local/bin/reentrenar.sh
RUN chmod +x /usr/local/bin/reentrenar.sh && \
    touch /var/log/entrenador.log

CMD ["sh", "-c", "crond -f -l 2 -L /var/log/entrenador.log"]
