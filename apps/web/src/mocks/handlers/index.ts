import { alertsHandlers } from './alerts';
import { analyticsHandlers } from './analytics';
import { authHandlers } from './auth';
import { catalogsHandlers } from './catalogs';
import { downtimesHandlers } from './downtimes';
import { evidenceHandlers } from './evidence';
import { ordersHandlers } from './orders';
import { realtimeHandlers } from './realtime';
import { reportsHandlers } from './reports';
import { scrapHandlers } from './scrap';
import { speedsHandlers } from './speeds';

/** Todos los endpoints de `docs/api-contracts.md`. El orden importa: las rutas
 *  más específicas (`/ordenes/resumen`) van antes que las paramétricas. */
export const handlers = [
  ...authHandlers,
  ...catalogsHandlers,
  ...realtimeHandlers,
  ...reportsHandlers,
  ...alertsHandlers,
  ...analyticsHandlers,
  ...evidenceHandlers,
  ...ordersHandlers,
  ...downtimesHandlers,
  ...scrapHandlers,
  ...speedsHandlers,
];

export {
  alertsHandlers,
  analyticsHandlers,
  authHandlers,
  catalogsHandlers,
  downtimesHandlers,
  evidenceHandlers,
  ordersHandlers,
  realtimeHandlers,
  reportsHandlers,
  scrapHandlers,
  speedsHandlers,
};
