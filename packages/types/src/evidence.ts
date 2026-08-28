import { z } from 'zod';
import type { Turno } from './common';
import { FORMATOS_EXPORT } from './reports';

export const KPIS_TESIS = ['TRI', 'TCI', 'TSP', 'CFS', 'EP'] as const;
export type KpiTesisId = (typeof KPIS_TESIS)[number];

export const ESTADOS_KPI = ['cumple', 'en_riesgo', 'no_cumple'] as const;
export type EstadoKpi = (typeof ESTADOS_KPI)[number];

export interface KpiTesis {
  id: KpiTesisId;
  nombre: string;
  /** Fórmula documentada en la tesis: `ΣTR / n`. */
  formula: string;
  valor: number;
  unidad: string;
  /** Texto de meta: `≥ 90 %`, `−40 % vs pretest`. */
  meta: string;
  metaValor: number;
  estado: EstadoKpi;
  /** Anexo del instrumento: `Anexo 02`. */
  anexo: string;
  detalle: string;
}

export interface EvidenciaResumen {
  /** `2026-08-24` */
  pretestDesde: string;
  pretestHasta: string;
  postestDesde: string;
  postestHasta: string;
  kpis: KpiTesis[];
  /** Barras pareadas pretest vs postest del TRI. */
  comparativaTri: { etapa: 'Pretest' | 'Postest'; minutos: number }[];
}

/* ------------------------------------------------------------------ */
/* TRI — Anexo 02                                                      */
/* ------------------------------------------------------------------ */

export const ETAPAS_MEDICION = ['pretest', 'postest'] as const;
export type EtapaMedicion = (typeof ETAPAS_MEDICION)[number];

export interface RegistroTRI {
  id: string;
  n: number;
  /** ISO `YYYY-MM-DD` */
  fecha: string;
  /** `Parada PM-01 · L2 Conos` */
  eventoRegistrado: string;
  /** `HH:mm:ss` */
  horaInicioRegistro: string;
  /** Minutos con un decimal. */
  tiempoMin: number;
  etapa: EtapaMedicion;
  observacion?: string;
}

export interface EvidenciaTRI {
  postest: RegistroTRI[];
  pretest: RegistroTRI[];
  promedioPostest: number;
  promedioPretest: number;
  /** Reducción porcentual respecto al pretest (negativa = mejora). */
  reduccionPct: number;
  meta: string;
  estado: EstadoKpi;
}

/* ------------------------------------------------------------------ */
/* TCI — Anexo 03                                                      */
/* ------------------------------------------------------------------ */

export interface EvaluacionTCI {
  id: string;
  n: number;
  fecha: string;
  turno: Turno;
  /** `Parada 07:42 · PL-03` */
  registro: string;
  completo: boolean;
  preciso: boolean;
  trazable: boolean;
  valido: boolean;
  observacion: string;
}

export interface EvidenciaTCI {
  registros: EvaluacionTCI[];
  registrosCorrectos: number;
  registrosTotales: number;
  /** RC / RT × 100. */
  porcentaje: number;
  meta: string;
  estado: EstadoKpi;
}

/* ------------------------------------------------------------------ */
/* TSP — Anexo 04                                                      */
/* ------------------------------------------------------------------ */

export interface ItemEncuesta {
  n: number;
  texto: string;
  /** Promedio Likert 1–5. */
  promedio: number;
  /** % de respuestas 4 o 5. */
  pctAcuerdo: number;
}

export interface EncuestaTSP {
  items: ItemEncuesta[];
  respuestas: number;
  invitados: number;
  promedio: number;
  /** PO / PT × 100. */
  pctAcuerdo: number;
  meta: string;
  estado: EstadoKpi;
  /** Enlace público de la encuesta. */
  enlace: string;
}

export interface EncuestaPublica {
  token: string;
  titulo: string;
  descripcion: string;
  items: { n: number; texto: string }[];
  /** `true` si el token ya fue usado. */
  respondida: boolean;
}

export const encuestaRespuestaSchema = z.object({
  token: z.string().min(6, 'Token inválido'),
  respuestas: z
    .array(z.coerce.number().int().min(1, 'Responde de 1 a 5').max(5, 'Responde de 1 a 5'))
    .length(8, 'Responde los 8 ítems'),
  comentario: z.string().max(500, 'Máximo 500 caracteres').optional(),
});
export type EncuestaRespuestaInput = z.infer<typeof encuestaRespuestaSchema>;
export type EncuestaRespuesta = EncuestaRespuestaInput;

/* ------------------------------------------------------------------ */
/* CFS — Anexo 05                                                      */
/* ------------------------------------------------------------------ */

export interface VerificacionCFS {
  id: string;
  n: number;
  /** `RF3` */
  rf: string;
  funcionalidad: string;
  cumple: boolean;
  observacion: string;
  /** Ruta de la pantalla que evidencia la funcionalidad. */
  ruta: string;
}

export interface EvidenciaCFS {
  items: VerificacionCFS[];
  cumplidas: number;
  totales: number;
  porcentaje: number;
  meta: string;
  estado: EstadoKpi;
}

export const verificacionCfsSchema = z.object({
  cumple: z.boolean(),
  observacion: z.string().max(300, 'Máximo 300 caracteres').default(''),
});
export type VerificacionCfsInput = z.infer<typeof verificacionCfsSchema>;

/* ------------------------------------------------------------------ */
/* EP — Anexo 06                                                       */
/* ------------------------------------------------------------------ */

export interface RegistroEP {
  id: string;
  n: number;
  fecha: string;
  /** `Parada prevista · L2 Conos` */
  tipoPrediccion: string;
  eventoReal: string;
  acierto: boolean;
  observacion: string;
  alertaId?: string;
}

export interface EvidenciaEP {
  registros: RegistroEP[];
  prediccionesCorrectas: number;
  prediccionesTotales: number;
  /** PCC / PTG × 100. */
  porcentaje: number;
  meta: string;
  estado: EstadoKpi;
}

/* ------------------------------------------------------------------ */
/* Exportación de evidencia                                            */
/* ------------------------------------------------------------------ */

export const exportEvidenciaSchema = z.object({
  kpis: z.array(z.enum(KPIS_TESIS)).min(1, 'Selecciona al menos un instrumento'),
  formato: z.enum(FORMATOS_EXPORT).default('xlsx'),
  /** `spss` genera un CSV plano con codificación numérica. */
  destino: z.enum(['spss', 'informe']).default('spss'),
});
export type ExportEvidenciaInput = z.infer<typeof exportEvidenciaSchema>;
export type ExportEvidencia = ExportEvidenciaInput;

export const cargarPretestSchema = z.object({
  registros: z
    .array(
      z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
        eventoRegistrado: z.string().min(3, 'Describe el evento'),
        horaInicioRegistro: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora inválida'),
        tiempoMin: z.coerce.number().positive('Debe ser mayor que 0'),
      })
    )
    .min(1, 'Carga al menos un registro'),
});
export type CargarPretestInput = z.infer<typeof cargarPretestSchema>;
