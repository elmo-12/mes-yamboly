import type { NextConfig } from 'next';

/**
 * Origen del backend al que Next reenvía `/api/v1/*`. Sólo lo usa el servidor de
 * Next, nunca el navegador, así que apunta al puerto local aunque la aplicación
 * se esté sirviendo por un túnel.
 */
const API_INTERNA = process.env.API_PROXY_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@mes/ui', '@mes/types', '@mes/shared'],
  reactStrictMode: true,
  /* Permite levantar dos servidores de desarrollo sobre el mismo checkout sin
     que se pisen el directorio de build (`NEXT_DIST_DIR=.next-qa next dev`). */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /**
   * El frontend habla con la API a través del propio servidor de Next
   * (`NEXT_PUBLIC_API_URL=/api/v1`). Al salir la petición del mismo origen que
   * la página no hay petición entre dominios y, por tanto, no hay CORS que
   * ajustar: ni en local ni detrás de un túnel, donde el navegador ve el dominio
   * público y el backend sigue escuchando en localhost.
   */
  async rewrites() {
    return [{ source: '/api/v1/:ruta*', destination: `${API_INTERNA}/api/v1/:ruta*` }];
  },
};

export default nextConfig;
