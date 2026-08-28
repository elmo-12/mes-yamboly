/**
 * Datasets del seed — copia literal de `apps/web/src/mocks/data/*` para que el
 * backend reproduzca exactamente los mismos datos que consumen los mocks msw
 * (OF-2026-0815, L1…L5 + PT-01, causas PM-01…PS-07, MR-01…MR-04).
 * Se copian en lugar de importarse para no acoplar `apps/api` con `apps/web`.
 */
export * from './seed';
export * from './catalogs';
export * from './users';
export * from './orders';
export * from './downtimes';
export * from './scrap';
