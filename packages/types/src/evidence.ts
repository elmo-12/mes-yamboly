import { z } from 'zod';
import type { PaginationMeta, PaginationQuery, Turno } from './common';
import { FORMATOS_EXPORT } from './reports';

export const KPIS_TESIS = ['TRI', 'TCI', 'TSP', 'CFS', 'EP'] as const;
export type KpiTesisId = (typeof KPIS_TESIS)[number];

/**
 * Estados de un KPI de la tesis.
 * `sin_datos` es el estado inicial del postest: el instrumento todavía no tiene
 * muestras (ninguna captura real, ninguna encuesta respondida, ninguna alerta
 * confirmada) y por eso su `valor` es `null` — no `0`.
 */
export const ESTADOS_KPI = ['cumple', 'en_riesgo', 'no_cumple', 'sin_datos'] as const;
export type EstadoKpi = (typeof ESTADOS_KPI)[number];

export interface KpiTesis {
  id: KpiTesisId;
  nombre: string;
  /** Fórmula documentada en la tesis: `ΣTR / n`. */
  formula: string;
  /** `null` mientras el instrumento no tiene muestras (`estado: 'sin_datos'`). */
  valor: number | null;
  unidad: string;
  /** Texto de meta: `≥ 90 %`, `−40 % vs pretest`. */
  meta: string;
  metaValor: number;
  estado: EstadoKpi;
  /** Anexo del instrumento: `Anexo 02`. */
  anexo: string;
  /** Explica el valor o, si no hay muestras, cómo se llenará el instrumento. */
  detalle: string;
}

export interface EvidenciaResumen {
  /** `2026-08-24` */
  pretestDesde: string;
  pretestHasta: string;
  postestDesde: string;
  postestHasta: string;
  kpis: KpiTesis[];
  /** Barras pareadas pretest vs postest del TRI; `minutos: null` = sin muestras. */
  comparativaTri: { etapa: 'Pretest' | 'Postest'; minutos: number | null }[];
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
  /** Filas creadas automáticamente por cada captura real del sistema. */
  postest: RegistroTRI[];
  /** Línea base medida a mano y cargada desde la web (10 filas, 2,9 min). */
  pretest: RegistroTRI[];
  /** `null` mientras no exista ninguna captura del postest. */
  promedioPostest: number | null;
  promedioPretest: number;
  /** Reducción porcentual respecto al pretest (negativa = mejora); `null` sin postest. */
  reduccionPct: number | null;
  meta: string;
  estado: EstadoKpi;
}

/* ------------------------------------------------------------------ */
/* TCI — Anexo 03 · validación contra fuentes externas                 */
/* ------------------------------------------------------------------ */

/** Registros operativos que la ficha del Anexo 03 evalúa. */
export const TIPOS_REGISTRO_TCI = ['parada', 'merma', 'velocidad'] as const;
export type TipoRegistroTci = (typeof TIPOS_REGISTRO_TCI)[number];

export const TIPO_REGISTRO_TCI_LABEL: Record<TipoRegistroTci, string> = {
  parada: 'Parada',
  merma: 'Merma',
  velocidad: 'Velocidad',
};

/**
 * Criterios de calidad evaluados por tipo de registro:
 * - `parada` → `completo`, `sensor`, `solicitud`
 * - `merma` → `completo`, `sap`, `solicitud`
 * - `velocidad` → `completo`, `sensor`
 */
export const CLAVES_CRITERIO_TCI = ['completo', 'sensor', 'solicitud', 'sap'] as const;
export type ClaveCriterioTci = (typeof CLAVES_CRITERIO_TCI)[number];

export const CRITERIO_TCI_LABEL: Record<ClaveCriterioTci, string> = {
  completo: 'Campos completos',
  sensor: 'Coherencia con sensores',
  solicitud: 'N.º de solicitud',
  sap: 'Transferencia SAP',
};

export interface CriterioTCI {
  clave: ClaveCriterioTci;
  /** Etiqueta legible: `Coherencia con sensores`. */
  label: string;
  /** Resultado efectivo del criterio (ya con el override aplicado). */
  cumple: boolean;
  /**
   * Explicación legible del resultado.
   * @example 'Sensor: parada detectada 10:42–10:58, registro 10:44–10:57 (Δ inicio 2 min)'
   */
  detalle: string;
  /** Valor forzado a mano desde 09.C; `null`/ausente = manda la regla. */
  override?: boolean | null;
}

export interface EvaluacionTCI {
  id: string;
  n: number;
  /** `YYYY-MM-DD` del registro evaluado. */
  fecha: string;
  turno: Turno;
  tipoRegistro: TipoRegistroTci;
  /** Id del registro operativo evaluado (`PAR-0815-03`, `MER-0815-01`, `VEL-0815-01`). */
  registroId: string;
  lineaId: string;
  lineaCodigo: string;
  /** Resumen del registro: `07:42 · PP-01-10 · 14 min`, `EP 3,2 kg · MP-01-01`. */
  referencia: string;
  criterios: CriterioTCI[];
  /** `true` si todos los criterios del tipo se cumplen. */
  valido: boolean;
  observacion?: string;
  /** ISO-8601 de la última validación que produjo esta fila. */
  validadoEn: string;
  /** Overrides vigentes por clave de criterio. */
  overrides?: Partial<Record<ClaveCriterioTci, boolean>>;
}

export interface ResumenPorTipoTCI {
  correctos: number;
  totales: number;
}

/** Última corrida del motor de validación. */
export interface UltimaValidacionTCI {
  /** ISO-8601 en que se ejecutó. */
  fecha: string;
  /** `YYYY-MM-DD` del rango validado. */
  desde: string;
  hasta: string;
  evaluados: number;
}

export interface EvidenciaTCI {
  registros: EvaluacionTCI[];
  registrosCorrectos: number;
  registrosTotales: number;
  /** RC / RT × 100; `null` mientras no haya registros evaluados. */
  porcentaje: number | null;
  meta: string;
  estado: EstadoKpi;
  porTipo: Record<TipoRegistroTci, ResumenPorTipoTCI>;
  ultimaValidacion?: UltimaValidacionTCI;
  /** Estado de las 3 fuentes externas importadas. */
  fuentes: FuenteExternaResumen[];
}

/** Cabecera del TCI sin el detalle fila a fila (la lista va paginada aparte). */
export type ResumenTCI = Omit<EvidenciaTCI, 'registros'>;

/** Respuesta de `GET /evidencia/tci`: página de evaluaciones + cabecera. */
export interface ListadoTCI {
  data: EvaluacionTCI[];
  meta: PaginationMeta;
  resumen: ResumenTCI;
}

export interface EvaluacionTciQuery extends PaginationQuery {
  tipo?: TipoRegistroTci | TipoRegistroTci[];
  /** `valido` / `invalido`. */
  resultado?: 'valido' | 'invalido';
  desde?: string;
  hasta?: string;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rango y tipos que recorre el motor de validación.
 * Sin `desde`/`hasta` la API usa la primera y la última captura del postest.
 */
export const validarTciSchema = z.object({
  desde: z.string().regex(FECHA_ISO, 'Fecha inválida').optional(),
  hasta: z.string().regex(FECHA_ISO, 'Fecha inválida').optional(),
  tipos: z.array(z.enum(TIPOS_REGISTRO_TCI)).min(1, 'Selecciona al menos un tipo').optional(),
});
export type ValidarTciInput = z.infer<typeof validarTciSchema>;

/** Override manual de criterios de una evaluación (vista 09.C). */
export const overrideTciSchema = z.object({
  /** `true`/`false` fuerzan el criterio; `null` devuelve el control a la regla. */
  overrides: z.record(z.enum(CLAVES_CRITERIO_TCI), z.boolean().nullable()),
  observacion: z.string().max(300, 'Máximo 300 caracteres').optional(),
});
export type OverrideTciInput = z.infer<typeof overrideTciSchema>;

/* ------------------------------------------------------------------ */
/* Fuentes externas (sensores · solicitudes · transferencias SAP)      */
/* ------------------------------------------------------------------ */

/**
 * Las 3 fuentes externas que se importan como XLSX/CSV (no hay integración en
 * vivo): lecturas de sensor, solicitudes de mantenimiento y transferencias de
 * merma de SAP.
 */
export const TIPOS_FUENTE_EXTERNA = ['sensores', 'solicitudes', 'sap_mermas'] as const;
export type TipoFuenteExterna = (typeof TIPOS_FUENTE_EXTERNA)[number];

export const TIPO_FUENTE_EXTERNA_LABEL: Record<TipoFuenteExterna, string> = {
  sensores: 'Lecturas de sensor',
  solicitudes: 'Solicitudes de mantenimiento',
  sap_mermas: 'Transferencias de merma SAP',
};

/** Estados que reporta una lectura de sensor. */
export const ESTADOS_LECTURA_SENSOR = ['PRODUCIENDO', 'PARADA'] as const;
export type EstadoLecturaSensor = (typeof ESTADOS_LECTURA_SENSOR)[number];

export interface ImportacionResumen {
  id: string;
  /** Nombre del archivo subido. */
  archivo: string;
  /** ISO-8601 de la importación. */
  fecha: string;
  /** Nombre del usuario que importó. */
  usuario: string;
  filasOk: number;
  filasRechazadas: number;
}

export interface FuenteExternaResumen {
  tipo: TipoFuenteExterna;
  label: string;
  /** Filas acumuladas de esa fuente. */
  filas: number;
  ultimaImportacion?: ImportacionResumen;
  /** Periodo cubierto por los datos acumulados (`YYYY-MM-DD`). */
  periodo?: { desde: string; hasta: string };
}

export interface RechazoFila {
  /** Número de fila del archivo (1 = cabecera). */
  fila: number;
  motivo: string;
}

export interface ImportacionResultado {
  id: string;
  tipo: TipoFuenteExterna;
  archivo: string;
  filasOk: number;
  filasRechazadas: number;
  /** Filas idénticas a algo ya importado; se ignoran sin ser un error. */
  filasDuplicadas: number;
  rechazos: RechazoFila[];
  /** Periodo cubierto por las filas aceptadas. */
  periodo?: { desde: string; hasta: string };
}

/** Cabeceras esperadas de cada plantilla, en orden. */
export const COLUMNAS_FUENTE: Record<TipoFuenteExterna, readonly string[]> = {
  sensores: ['linea', 'fecha_hora', 'estado', 'velocidad_unid_min'],
  solicitudes: ['numero_solicitud', 'fecha', 'linea', 'tipo', 'estado', 'descripcion'],
  sap_mermas: ['documento', 'fecha', 'linea', 'codigo_producto', 'cantidad_kg', 'tipo_merma', 'motivo'],
} as const;

/**
 * Columnas de {@link COLUMNAS_FUENTE} que pueden faltar en el archivo sin
 * invalidar la importación; el resto son obligatorias y su ausencia es un 422.
 */
export const COLUMNAS_OPCIONALES_FUENTE: Record<TipoFuenteExterna, readonly string[]> = {
  sensores: ['velocidad_unid_min'],
  solicitudes: ['linea', 'descripcion'],
  sap_mermas: ['tipo_merma', 'motivo'],
} as const;

/**
 * Mapeo opcional al importar: `{ columnaEsperada: cabeceraDelArchivo }`.
 * @example { fecha_hora: 'Timestamp', linea: 'Máquina' }
 */
export const mapeoImportacionSchema = z.record(z.string(), z.string());
export type MapeoImportacion = z.infer<typeof mapeoImportacionSchema>;

/* ------------------------------------------------------------------ */
/* TSP — Anexo 04                                                      */
/* ------------------------------------------------------------------ */

export interface ItemEncuesta {
  n: number;
  texto: string;
  /** Promedio Likert 1–5; `null` sin respuestas. */
  promedio: number | null;
  /** % de respuestas 4 o 5; `null` sin respuestas. */
  pctAcuerdo: number | null;
}

/** Invitación nominal a la encuesta: un token de un solo uso por persona. */
export interface InvitacionTSP {
  /** `tsp-2026-01` */
  token: string;
  invitado: string;
  /** Rol declarado del invitado: `Maquinista`, `Supervisor`, … */
  rol?: string;
  /** Enlace público completo: `http://localhost:3000/encuesta/tsp-2026-01`. */
  url: string;
  respondida: boolean;
  /** `YYYY-MM-DD` en que respondió. */
  respondidaEn?: string;
  /** ISO-8601 de creación de la invitación. */
  creadaEn: string;
}

export interface EvidenciaTSP {
  items: ItemEncuesta[];
  /** Invitaciones emitidas, respondidas y pendientes. */
  invitaciones: InvitacionTSP[];
  respuestas: number;
  invitados: number;
  /** Promedio Likert global; `null` sin respuestas. */
  promedio: number | null;
  /** PO / PT × 100; `null` sin respuestas. */
  pctAcuerdo: number | null;
  meta: string;
  estado: EstadoKpi;
  /** Enlace público de la última invitación creada, si existe. */
  enlace: string;
}

/**
 * @deprecated Usa {@link EvidenciaTSP}; el alias se mantiene mientras la web migra.
 */
export type EncuestaTSP = EvidenciaTSP;

export const crearInvitacionSchema = z.object({
  invitado: z.string().min(3, 'Escribe el nombre del invitado').max(80, 'Máximo 80 caracteres'),
  rol: z.string().max(60, 'Máximo 60 caracteres').optional(),
});
export type CrearInvitacionInput = z.infer<typeof crearInvitacionSchema>;

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
  /**
   * ISO-8601 de la última verificación del investigador; `null` mientras la
   * funcionalidad no se haya revisado. Distingue «verificada y no cumple»
   * (`cumple: false` con fecha) de «sin verificar» (`cumple: false` sin fecha),
   * que es lo que deja el CFS en «sin datos».
   */
  verificadaEn?: string | null;
}

export interface EvidenciaCFS {
  items: VerificacionCFS[];
  cumplidas: number;
  totales: number;
  /** Funcionalidades ya revisadas (con `verificadaEn`), cumplan o no. */
  verificadas: number;
  /** `null` mientras no se haya verificado ninguna funcionalidad. */
  porcentaje: number | null;
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
  /** PCC / PTG × 100; `null` mientras no se confirme ninguna alerta. */
  porcentaje: number | null;
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
        fecha: z.string().regex(FECHA_ISO, 'Fecha inválida'),
        eventoRegistrado: z.string().min(3, 'Describe el evento'),
        horaInicioRegistro: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora inválida'),
        tiempoMin: z.coerce.number().positive('Debe ser mayor que 0'),
      })
    )
    .min(1, 'Carga al menos un registro'),
});
export type CargarPretestInput = z.infer<typeof cargarPretestSchema>;
