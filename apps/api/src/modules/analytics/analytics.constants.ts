import type { InsightCard, RiesgoLinea, Recurrencia, VariableEntrada } from '@mes/types';

/**
 * Salidas cualitativas del modelo v3.2 (spec 08). No se derivan de la BD:
 * son el resultado del análisis CRISP-DM documentado en la tesis.
 */

export const INSIGHTS: InsightCard[] = [
  {
    id: 'INS-01',
    tono: 'warning',
    texto: 'L2 Conos concentra 34 % de paradas mecánicas en turno Tarde',
    soporte: '48 de 142 eventos PM-01 de los últimos 30 días',
  },
  {
    id: 'INS-02',
    tono: 'info',
    texto: 'Cambios PC-04 después de las 12:00 duran 40 % más',
    soporte: 'Media 42 min frente a 30 min del estándar',
  },
  {
    id: 'INS-03',
    tono: 'warning',
    texto: 'Merma EP sube 1,8 pp en arranques con Sabor Lúcuma',
    soporte: '19 arranques analizados en L3 Vasos',
  },
];

/** Riesgo 0–100 estimado por el modelo para el próximo turno. */
export const RIESGO_POR_LINEA: Omit<RiesgoLinea, 'turnoObjetivo'>[] = [
  { lineaId: 'LIN-02', lineaCodigo: 'L2', lineaNombre: 'Conos', riesgo: 78, causaProbable: 'PM-01 Falla mecánica · Envolvedora L2' },
  { lineaId: 'LIN-04', lineaCodigo: 'L4', lineaNombre: 'Sándwich', riesgo: 71, causaProbable: 'PM-01 Desalineación de moldes' },
  { lineaId: 'LIN-03', lineaCodigo: 'L3', lineaNombre: 'Vasos', riesgo: 64, causaProbable: 'PE-02 Falla de variador' },
  { lineaId: 'LIN-01', lineaCodigo: 'L1', lineaNombre: 'Paletas', riesgo: 46, causaProbable: 'PO-06 Ajuste de temperatura' },
  { lineaId: 'LIN-05', lineaCodigo: 'L5', lineaNombre: 'Bombones', riesgo: 38, causaProbable: 'PA-05 Falta de cobertura' },
];

export const RECURRENCIAS: Recurrencia[] = [
  { id: 'REC-01', patron: 'PM-01 en Envolvedora L2 tras cambio de producto', frecuencia: 9, impactoMin: 118, lineas: ['L2'], confianza: 88 },
  { id: 'REC-02', patron: 'PC-04 después de las 12:00 excede el tiempo estándar', frecuencia: 12, impactoMin: 96, lineas: ['L1', 'L2', 'L4'], confianza: 84 },
  { id: 'REC-03', patron: 'Merma EP alta en arranque con sabor Lúcuma', frecuencia: 7, impactoMin: 0, lineas: ['L3'], confianza: 81 },
  { id: 'REC-04', patron: 'PE-02 en Selladora L3 en turno Tarde', frecuencia: 5, impactoMin: 74, lineas: ['L3'], confianza: 76 },
  { id: 'REC-05', patron: 'PS-07 en turno Noche por refrigerio no cubierto', frecuencia: 4, impactoMin: 48, lineas: ['L4', 'L5'], confianza: 72 },
  { id: 'REC-06', patron: 'PA-05 falta de bobina al final del turno Mañana', frecuencia: 6, impactoMin: 62, lineas: ['L2', 'L5'], confianza: 69 },
];

export const VARIABLES_ENTRADA: VariableEntrada[] = [
  { id: 'VAR-01', nombre: 'Línea', importancia: 92 },
  { id: 'VAR-02', nombre: 'Turno', importancia: 84 },
  { id: 'VAR-03', nombre: 'Producto', importancia: 71 },
  { id: 'VAR-04', nombre: 'Máquina', importancia: 88 },
  { id: 'VAR-05', nombre: 'Causa', importancia: 79 },
  { id: 'VAR-06', nombre: 'Tiempo de operación', importancia: 66 },
  { id: 'VAR-07', nombre: 'Velocidad', importancia: 74 },
  { id: 'VAR-08', nombre: 'Eventos históricos 7 d', importancia: 81 },
  { id: 'VAR-09', nombre: 'Eventos históricos 30 d', importancia: 77 },
];

/**
 * Eventos productivos migrados antes del postest; el resto se cuenta en vivo.
 * Con los 10 registros del Anexo 02 sembrados la planta parte de 2 140 eventos,
 * el mismo volumen que declara la spec 08 (modelo v3.2 vigente y prediciendo).
 */
export const EVENTOS_MIGRADOS = 2130;

/** Eventos registrados por día usados para estimar cuándo se llega al mínimo. */
export const RITMO_DIARIO_EVENTOS = 63;

/** Volumen mínimo para reentrenar con garantías (spec 08.E). */
export const EVENTOS_REQUERIDOS = 2000;

/** Excedente que se muestra al forzar `?estado=suficiente` en `/analitica/estado-datos`. */
export const EXCEDENTE_DEMO = 140;

/** Volumen que se reporta al forzar `?estado=insuficiente` (spec 08.E, estado vacío). */
export const EVENTOS_DEMO_INSUFICIENTES = 1250;

/** Descripciones de las 6 fases CRISP-DM (spec 08.D). */
export const FASES_DESCRIPCION = [
  {
    id: 'comprension_negocio' as const,
    nombre: 'Comprensión del negocio',
    descripcion: 'Objetivo: anticipar paradas y mermas para reducir el tiempo perdido en las 5 líneas.',
    metricas: [{ label: 'Objetivos', valor: '3' }, { label: 'RF cubiertos', valor: 'RF8, RF9' }],
  },
  {
    id: 'comprension_datos' as const,
    nombre: 'Comprensión de los datos',
    descripcion: 'Órdenes, paradas, mermas y velocidades registradas desde el MES.',
    metricas: null,
  },
  {
    id: 'preparacion' as const,
    nombre: 'Preparación de los datos',
    descripcion: 'Limpieza, codificación de causas y construcción de ventanas temporales.',
    metricas: null,
  },
  {
    id: 'modelado' as const,
    nombre: 'Modelado',
    descripcion: 'Gradient Boosting con validación cruzada estratificada de 5 pliegues.',
    metricas: null,
  },
  {
    id: 'evaluacion' as const,
    nombre: 'Evaluación',
    descripcion: 'Métricas sobre el conjunto de prueba y contraste con el registro real (Anexo 06).',
    metricas: null,
  },
  {
    id: 'despliegue' as const,
    nombre: 'Despliegue',
    descripcion: 'Servicio de inferencia en Python conectado al motor de alertas y a n8n.',
    metricas: null,
  },
];
