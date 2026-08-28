import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@mes/ui', '@mes/types', '@mes/shared'],
  reactStrictMode: true,
  /* Permite levantar dos servidores de desarrollo sobre el mismo checkout sin
     que se pisen el directorio de build (`NEXT_DIST_DIR=.next-qa next dev`). */
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
