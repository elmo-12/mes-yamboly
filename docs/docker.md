# Guía de Docker · MES Yamboly

La imagen `ghcr.io/elmo-12/mes-yamboly` empaqueta **web (Next) + API (Nest) + servicio de predicción (Python)** en un solo contenedor sobre SQLite. Sólo se publica el puerto **3000**: Next reenvía `/api/v1/*` a la API interna (4000) y la API es la única que habla con Python (8000).

Se publica para `linux/amd64` y `linux/arm64`, así que funciona igual en Mac Apple Silicon, Mac Intel, Windows y Linux.

| Etiqueta | Contenido |
|---|---|
| `latest` | Último build publicado |
| `1.1.0` | Imagen aligerada (≈190 MB comprimida por arquitectura) |

---

## 1. Instalar la imagen publicada

### Requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) o Docker Engine ≥ 24 (Linux).
- Si el paquete es **privado** en GitHub, una cuenta con acceso al repositorio `elmo-12/mes-yamboly`.

### 1.1 Iniciar sesión en ghcr.io (sólo si el paquete es privado)
Crear un *Personal access token (classic)* en GitHub → **Settings → Developer settings → Personal access tokens** con el permiso `read:packages`, y luego:

```bash
echo <TOKEN> | docker login ghcr.io -u <usuario-github> --password-stdin
```

Con la CLI de GitHub instalada también sirve:
```bash
gh auth refresh -h github.com -s read:packages
gh auth token | docker login ghcr.io -u <usuario-github> --password-stdin
```

### 1.2 Descargar y ejecutar
```bash
docker pull ghcr.io/elmo-12/mes-yamboly:latest
docker run -d --name mes-yamboly -p 3000:3000 \
  -v mes_datos:/app/api/data \
  --restart unless-stopped \
  ghcr.io/elmo-12/mes-yamboly:latest
```

Abrir http://localhost:3000 y entrar con cualquier usuario de la tabla de credenciales del README (contraseña `Yamboly2026`).

El primer arranque tarda 1–2 minutos: copia la base inicial, entrena el modelo de Analítica IA y levanta los tres servicios. El estado se ve con:
```bash
docker ps                      # la columna STATUS pasa de "health: starting" a "healthy"
docker logs -f mes-yamboly
```

### 1.3 Desde Docker Desktop (sin terminal)
1. Si el paquete es privado, hacer el `docker login ghcr.io` del paso 1.1 una vez.
2. En la barra de búsqueda de Docker Desktop no aparecen imágenes de ghcr.io, así que la descarga se hace con `docker pull ghcr.io/elmo-12/mes-yamboly:latest` (o desde la terminal integrada de Docker Desktop).
3. En **Images**, sobre `ghcr.io/elmo-12/mes-yamboly`, pulsar **Run** → **Optional settings**.
4. **Host port** `3000` · **Volumes**: *Host path* `mes_datos`, *Container path* `/app/api/data`.
5. Pulsar **Run** y abrir http://localhost:3000.

### 1.4 Variables de entorno opcionales
| Variable | Por defecto | Uso |
|---|---|---|
| `JWT_SECRET` | `mes-yamboly-docker-demo` | **Cambiarla** fuera de una demo (`-e JWT_SECRET=$(openssl rand -hex 32)`). |
| `DATABASE_URL` | *(vacía → SQLite)* | `postgres://usuario:clave@host:5432/mes` para usar PostgreSQL. |
| `ENTRENAMIENTO_ACTIVO` | `true` | Reentrenamiento semanal del modelo (lunes 03:00). |
| `TZ` | `America/Lima` | Zona horaria del contenedor. |
| `CORS_ORIGIN` | `http://localhost:3000` | Sólo si se llama a la API desde otro origen. |

### 1.5 Datos y actualización
Todo lo que cambia (base SQLite, modelos entrenados, evidencias, exportaciones) vive en `/app/api/data`. Con el volumen `mes_datos` montado, actualizar la imagen no borra nada:

```bash
docker pull ghcr.io/elmo-12/mes-yamboly:latest
docker rm -f mes-yamboly
docker run -d --name mes-yamboly -p 3000:3000 -v mes_datos:/app/api/data \
  --restart unless-stopped ghcr.io/elmo-12/mes-yamboly:latest
```

Para empezar de cero con la base inicial: `docker rm -f mes-yamboly && docker volume rm mes_datos`.

Respaldo del volumen:
```bash
docker run --rm -v mes_datos:/datos -v "$PWD":/respaldo busybox \
  tar czf /respaldo/mes_datos-$(date +%F).tar.gz -C /datos .
```

---

## 2. Compilar la imagen desde cero con el Dockerfile

### Requisitos
- Docker ≥ 24 con BuildKit (Docker Desktop ya lo trae).
- ~6 GB libres para las capas intermedias (la imagen final es mucho menor).
- Clon del repositorio: `git clone https://github.com/elmo-12/mes-yamboly.git && cd mes-yamboly`.

No hace falta instalar Node, pnpm ni Python en la máquina: todo se compila dentro de Docker.

### 2.1 (Opcional) Base inicial con datos reales
Si antes del build existe `docker/semilla/mes.sqlite`, el primer arranque parte de ella y entrena el modelo con esos datos. Si no existe, la API siembra los datos de demostración (con ellos Analítica IA queda en «datos insuficientes»). El archivo está en `.gitignore`; se genera desde PostgreSQL con los datos ya sincronizados:

```bash
pnpm install
pnpm --filter @mes/api exportar:demo                     # desde 2026-07-22 ≈ 400 muestras
pnpm --filter @mes/api exportar:demo -- --desde=2026-06-01 --url=postgres://…
```

> **Atención:** ese recorte contiene órdenes reales y nombres de usuarios, y queda **dentro de la imagen**. No publicar una imagen construida con él en un registro público.

### 2.2 Compilar para la máquina local
```bash
docker build -t mes-yamboly:local .
docker run --rm -p 3000:3000 mes-yamboly:local      # → http://localhost:3000
```
El primer build tarda ~10 min (dependencias de Node y Python + build de Next); los siguientes reutilizan la caché.

### 2.3 Qué hace el Dockerfile
Es un build multi-etapa; sólo la última etapa llega a la imagen final:

| Etapa | Base | Qué produce |
|---|---|---|
| `build-py` | `python:3.12-slim-bookworm` + `uv` | venv del servicio de predicción, sin tests, stubs ni cabeceras C. |
| `build` | `node:22-bookworm-slim` + pnpm | `pnpm install`, build de API y web (Next *standalone*), `pnpm deploy --prod` de la API, y poda de TypeScript, `@types`, sharp, mapas y fuentes de sqlite3. |
| `node` | `node:22-bookworm-slim` | Binario de Node sin símbolos de depuración (−18 MB). |
| `runtime` | `python:3.12-slim-bookworm` | Python + Node + `libgomp1` (LightGBM), usuario sin privilegios `mes`, healthcheck y `docker/iniciar.sh` como proceso principal. |

`docker/iniciar.sh` arranca Python, espera a `/salud`, entrena el modelo inicial si hace falta y levanta la API y la web; si cualquiera de los tres cae, el contenedor termina y Docker lo reinicia.

### 2.4 Comprobar el tamaño
```bash
docker images mes-yamboly
docker history mes-yamboly:local        # peso de cada capa
```

---

## 3. Publicar en el repositorio (ghcr.io)

La imagen se publica como paquete del repositorio de GitHub; la etiqueta `org.opencontainers.image.source` del Dockerfile lo vincula a `elmo-12/mes-yamboly`.

### 3.1 Permisos
El token necesita `write:packages`:
```bash
gh auth refresh -h github.com -s write:packages
gh auth token | docker login ghcr.io -u elmo-12 --password-stdin
```

### 3.2 Build multi-arquitectura y push
```bash
docker buildx create --name mes-builder --use 2>/dev/null || docker buildx use mes-builder
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/elmo-12/mes-yamboly:1.1.0 \
  -t ghcr.io/elmo-12/mes-yamboly:latest \
  --push .
```
La arquitectura que no es la de la máquina se compila por emulación (QEMU) y tarda bastante más; es normal.

### 3.3 Visibilidad
Los paquetes nuevos de ghcr.io nacen **privados**. Para hacerlo público: GitHub → perfil → **Packages** → `mes-yamboly` → **Package settings** → **Change visibility**. Antes de hacerlo, revisar la advertencia del paso 2.1 sobre los datos reales.

---

## 4. Problemas frecuentes
| Síntoma | Causa / solución |
|---|---|
| `denied` o `unauthorized` al hacer pull | El paquete es privado: `docker login ghcr.io` (paso 1.1). |
| `no matching manifest for linux/…` | Se publicó para una sola arquitectura: repetir el paso 3.2 con `--platform linux/amd64,linux/arm64`. |
| `port is already allocated` | Otro proceso usa el 3000: `-p 8080:3000` y abrir http://localhost:8080. |
| Queda en `health: starting` más de 3 min | Ver `docker logs mes-yamboly`; el entrenamiento inicial puede tardar en máquinas lentas. |
| Analítica IA en «datos insuficientes» | La imagen se construyó sin `docker/semilla/mes.sqlite` (paso 2.1). |
| Cambios de entidades no aparecen | La base del volumen es anterior: `docker volume rm mes_datos` (se pierden los datos). |
