/** Origen de datos de la app: `mock` (msw) o `api` (NestJS). */
export type DataSource = 'mock' | 'api';

export function getDataSource(): DataSource {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'mock';
}

export function isMock(): boolean {
  return getDataSource() === 'mock';
}

/** Base de todas las llamadas REST. En modo mock msw intercepta esta misma URL. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
