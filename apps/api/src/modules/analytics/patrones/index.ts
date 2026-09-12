/**
 * Motor de patrones de `/analitica` (CU-3 y CU-4 del plan de analítica).
 * Punto único de importación para `analytics.module.ts` y `analytics.service.ts`.
 */
export { PatronesService } from './patrones.service';
export {
  generarReglas,
  minarItemsets,
  OPCIONES_APRIORI,
  type Cesta,
  type Item,
  type ItemsetFrecuente,
  type OpcionesApriori,
  type ReglaAsociativa,
} from './apriori';
