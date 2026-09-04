import type { InsightCard, RiesgoLinea, Recurrencia, VariableEntrada } from '@mes/types';

/**
 * Salidas cualitativas del modelo v3.2 (spec 08). No se derivan de la BD:
 * son el resultado del análisis CRISP-DM documentado en la tesis.
 */

export const INSIGHTS: InsightCard[] = [
  {
    id: 'INS-01',
    tono: 'warning',
    texto: 'LLEN-M2 concentra 34 % de las paradas por falla de mantto en turno Noche',
    soporte: '48 de 142 eventos PN-02-01 de los últimos 30 días',
  },
  {
    id: 'INS-02',
    tono: 'info',
    texto: 'Las limpiezas PP-01-C después de las 12:00 duran 40 % más',
    soporte: 'Media 42 min frente a 30 min del estándar',
  },
  {
    id: 'INS-03',
    tono: 'warning',
    texto: 'La merma EP sube 1,8 pp en los arranques de las extrusoras',
    soporte: '19 arranques analizados en EXTR-2 y EXTR-3',
  },
];

/** Riesgo 0–100 estimado por el modelo para el próximo turno. */
export const RIESGO_POR_LINEA: Omit<RiesgoLinea, 'turnoObjetivo'>[] = [
  { lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2', riesgo: 78, causaProbable: 'PN-02-01 Falla mantto · Envolvedora' },
  { lineaId: 'LIN-MOLD-A4', lineaCodigo: 'MOLD-A4', lineaNombre: 'Moldeadora A4', riesgo: 71, causaProbable: 'PN-04-15 Falla de equipo · Descargador' },
  { lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2', riesgo: 64, causaProbable: 'PN-02-02 Falla operacional · Túnel de frío' },
  { lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1', riesgo: 46, causaProbable: 'PN-04-02 Insumo / MP · Dosificadora' },
  { lineaId: 'LIN-MOLD-A2', lineaCodigo: 'MOLD-A2', lineaNombre: 'Moldeadora A2', riesgo: 38, causaProbable: 'PN-04-16 Falla operativa · Pinzas' },
];

export const RECURRENCIAS: Recurrencia[] = [
  { id: 'REC-01', patron: 'PN-02-01 en la envolvedora de LLEN-M2 tras cambio de producto', frecuencia: 9, impactoMin: 118, lineas: ['LLEN-M2'], confianza: 88 },
  { id: 'REC-02', patron: 'PP-01-C limpieza después de las 12:00 excede el tiempo estándar', frecuencia: 12, impactoMin: 96, lineas: ['LLEN-M1', 'LLEN-M2', 'MOLD-A4'], confianza: 84 },
  { id: 'REC-03', patron: 'Merma EP alta en el arranque de las extrusoras', frecuencia: 7, impactoMin: 0, lineas: ['EXTR-2', 'EXTR-3'], confianza: 81 },
  { id: 'REC-04', patron: 'PN-02-02 en el túnel de frío de EXTR-2 en turno Noche', frecuencia: 5, impactoMin: 74, lineas: ['EXTR-2'], confianza: 76 },
  { id: 'REC-05', patron: 'PS-05-E refrigerio no cubierto en turno Noche', frecuencia: 4, impactoMin: 48, lineas: ['MOLD-A3', 'MOLD-A4'], confianza: 72 },
  { id: 'REC-06', patron: 'PN-04-02 falta de insumo al final del turno Día', frecuencia: 6, impactoMin: 62, lineas: ['LLEN-A1', 'LLEN-A2'], confianza: 69 },
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
    descripcion: 'Objetivo: anticipar paradas y mermas para reducir el tiempo perdido en las 9 líneas.',
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
