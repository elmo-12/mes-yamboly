/**
 * Datasets del seed — copia literal de `apps/web/src/mocks/data/*` (incluidos
 * los maestros reales de `./real/*.json`) para que el backend reproduzca
 * exactamente los mismos datos que consumen los mocks msw: OF-2026-0815,
 * las 9 líneas reales, causas de parada `PP-01`…`PS-05` y de merma `MP-01`…`MP-05`.
 * Se copian en lugar de importarse para no acoplar `apps/api` con `apps/web`.
 */
export * from './seed';
export * from './catalogs';
export * from './users';
export * from './orders';
export * from './downtimes';
export * from './scrap';
