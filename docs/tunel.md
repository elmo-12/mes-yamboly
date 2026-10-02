# Exponer el MES por un túnel con dominio propio

El front se publica con un túnel de Cloudflare (`cloudflared`) sobre el dominio
`yamboly.lat`. Hay dos túneles, que **no deben compartir conector**:

| Túnel | Hostname | Dónde corre | Config |
|---|---|---|---|
| `mes-yamboly` | `mes.yamboly.lat` | Servidor (82.197.65.136) | `~/.cloudflared/mes-yamboly.yml` |
| `mes-yamboly-dev` | `mes-dev.yamboly.lat` | Mac de desarrollo (build de producción en :3300) | `~/.cloudflared/mes-yamboly-dev.yml` |

Si se arranca un túnel en dos máquinas a la vez, Cloudflare reparte el tráfico
entre ambas y cada visita cae en una al azar.

## Arrancar (desarrollo)

```bash
DATABASE_URL=postgres://mes:mes_dev@localhost:5435/mes_yamboly \
  pnpm exec turbo run dev --parallel --env-mode=loose   # API :4000 (+ web dev :3000 para trabajar en local)
pnpm tunel:web                                         # build de producción de la web en :3300
pnpm tunel                                             # https://mes-dev.yamboly.lat → :3300
```

**No exponer `next dev` por el túnel.** El servidor de desarrollo envía ~22 MB de
JavaScript sin minificar en cada carga: en local tarda 0,7 s, pero por el túnel
tarda 9 s o más y, si el túnel se reconecta a mitad de la descarga, la página se
queda en el esqueleto de carga. El build de producción pesa ~1 MB y carga en ~2 s.
`pnpm tunel:web` reconstruye y sirve ese build; hay que volver a lanzarlo para ver
cambios de código. (`next build` con un `distDir` distinto de `.next` añade líneas
a `apps/web/tsconfig.json`; el script lo restaura).

`pnpm tunel` usa `~/.cloudflared/mes-yamboly-dev.yml`. Para otro túnel se puede
pasar `TUNEL_CONFIG=/ruta/config.yml pnpm tunel`.

## Por qué no hay problema de CORS

- El navegador solo habla con el dominio del túnel: la web llama a la API por la
  ruta relativa `NEXT_PUBLIC_API_URL=/api/v1`, y Next la reenvía al backend en
  `localhost:4000` (`rewrites` de `apps/web/next.config.ts`, con
  `API_PROXY_URL`). Es el mismo origen, así que no hay petición entre dominios.
- Aun así, `CORS_ORIGIN` de la API incluye los dominios públicos
  (`https://mes.yamboly.lat`, `https://mes-dev.yamboly.lat`) por si algo llama a
  la API directamente desde el navegador (p. ej. Swagger).
- El stream SSE de Tiempo real (`/api/v1/tiempo-real/stream`) pasa por el mismo
  proxy y por el túnel sin cambios.

## Variables necesarias

`apps/api/.env`:

```
TRUST_PROXY_HOPS=1          # Next es el único proxy de confianza delante de la API
CORS_ORIGIN=http://localhost:3000,https://mes.yamboly.lat,https://mes-dev.yamboly.lat
```

`apps/web/.env.local`:

```
WEB_TRUST_PROXY_HOPS=1                                   # Cloudflare delante de Next
NEXT_ALLOWED_DEV_ORIGINS=mes-dev.yamboly.lat,mes.yamboly.lat
```

- `WEB_TRUST_PROXY_HOPS` + `TRUST_PROXY_HOPS`: el middleware de Next deja en
  `X-Forwarded-For` solo la IP real del cliente (la que añade Cloudflare), y la
  API la usa para el límite de intentos de login. Sin ellas, el límite por IP
  queda desactivado y rige solo el de cuenta (ver `docs/api-contracts.md`, auth).
- `NEXT_ALLOWED_DEV_ORIGINS`: `next dev` rechaza los recursos `/_next/*` y el
  HMR pedidos desde un host distinto de localhost. Con el build de producción
  (`next start` o la imagen Docker) no hace falta.

## Crear un túnel nuevo

```bash
cloudflared tunnel create <nombre>
# OJO: `route dns` toma el `tunnel:` de ~/.cloudflared/config.yml si existe;
# pasar siempre --config con el archivo del túnel correcto.
cloudflared --config ~/.cloudflared/<nombre>.yml tunnel route dns <nombre> <host>.yamboly.lat
```

Después hay que añadir el host a `CORS_ORIGIN` y a `NEXT_ALLOWED_DEV_ORIGINS`.
