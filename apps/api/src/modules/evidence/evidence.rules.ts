import { esRegistroValidoTci } from '@mes/shared';
import { CRITERIO_TCI_LABEL } from '@mes/types';
import type {
  ClaveCriterioTci,
  CriterioTCI,
  EstadoLecturaSensor,
  TipoRegistroTci,
  Turno,
} from '@mes/types';
import { fechaCorta } from './tabla.util';

/**
 * Reglas puras del Anexo 03 (TCI). No tocan la base de datos: reciben el
 * registro operativo y las fuentes externas ya cargadas y devuelven el criterio
 * con su detalle legible, listo para pintar en la ficha 09.C.
 *
 * Criterios por tipo de registro:
 * - **parada** → `completo` · `sensor` · `solicitud`
 * - **merma** → `completo` · `sap` · `solicitud`
 * - **velocidad** → `completo` · `sensor`
 */

/** Tolerancias configurables en Configuración › Umbrales › Validación de calidad. */
export interface ToleranciasTci {
  /** Minutos de holgura al comparar horas con las lecturas de sensor. */
  minutos: number;
  /** Porcentaje de holgura en cantidades (kg) y velocidades (u/min). */
  pct: number;
  /** Días de holgura entre la merma y su transferencia SAP. */
  diasSap: number;
}

export const TOLERANCIAS_POR_DEFECTO: ToleranciasTci = { minutos: 5, pct: 5, diasSap: 1 };

/** Tramo continuo de una línea en un mismo estado, derivado de las lecturas. */
export interface TramoSensor {
  estado: EstadoLecturaSensor;
  /** ISO-8601 de la lectura que abre el tramo. */
  desde: string;
  /** ISO-8601 de la lectura siguiente; igual a `desde` en el último tramo. */
  hasta: string;
  /** `true` cuando no hay lectura posterior: el fin del tramo se desconoce. */
  abierto: boolean;
}

export interface LecturaSensorPlana {
  fechaHora: string;
  estado: EstadoLecturaSensor;
  velocidadUnidMin: number | null;
}

/* ------------------------------------------------------------------ */
/* Utilidades de tiempo y formato                                      */
/* ------------------------------------------------------------------ */

/** `2026-08-28T07:42:00` → `07:42`. */
export function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/** Minutos entre dos ISO (con signo: positivo si `b` es posterior a `a`). */
export function minutosEntre(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

/** Días completos entre dos fechas `YYYY-MM-DD` (con signo). */
export function diasEntre(a: string, b: string): number {
  const ms = new Date(`${b.slice(0, 10)}T00:00:00`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00`).getTime();
  return Math.round(ms / 86400000);
}

/** Número con coma decimal, sin separador de miles: `3.2` → `3,2`. */
export function num(valor: number, decimales = 1): string {
  return valor.toFixed(decimales).replace('.', ',');
}

/**
 * Turno real de una marca de tiempo: `D` (06:00–17:59) y `N` (18:00–05:59).
 */
export function turnoDe(iso: string): Turno {
  const hora = Number(iso.slice(11, 13));
  return hora >= 6 && hora < 18 ? 'D' : 'N';
}

/* ------------------------------------------------------------------ */
/* Tramos de sensor                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convierte las lecturas puntuales de una línea en tramos continuos:
 * cada tramo va desde una lectura hasta la siguiente y las lecturas
 * consecutivas con el mismo estado se fusionan.
 */
export function construirTramos(lecturas: LecturaSensorPlana[]): TramoSensor[] {
  const ordenadas = [...lecturas].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
  const tramos: TramoSensor[] = [];
  for (let i = 0; i < ordenadas.length; i += 1) {
    const actual = ordenadas[i]!;
    const anterior = tramos[tramos.length - 1];
    if (anterior && anterior.estado === actual.estado) {
      anterior.hasta = actual.fechaHora;
      anterior.abierto = true;
      continue;
    }
    if (anterior) {
      anterior.hasta = actual.fechaHora;
      anterior.abierto = false;
    }
    tramos.push({
      estado: actual.estado,
      desde: actual.fechaHora,
      hasta: actual.fechaHora,
      abierto: true,
    });
  }
  return tramos;
}

function criterio(
  clave: ClaveCriterioTci,
  cumple: boolean,
  detalle: string,
): CriterioTCI {
  return { clave, label: CRITERIO_TCI_LABEL[clave], cumple, detalle };
}

/* ------------------------------------------------------------------ */
/* Criterio «completo»                                                 */
/* ------------------------------------------------------------------ */

/**
 * Campos obligatorios presentes. Recibe pares `[etiqueta, presente]` para que
 * el detalle nombre exactamente lo que falta.
 */
export function criterioCompleto(campos: [string, boolean][]): CriterioTCI {
  const faltantes = campos.filter(([, presente]) => !presente).map(([etiqueta]) => etiqueta);
  return criterio(
    'completo',
    faltantes.length === 0,
    faltantes.length === 0
      ? `Los ${campos.length} campos obligatorios están completos`
      : `Faltan ${faltantes.length} campos obligatorios: ${faltantes.join(', ')}`,
  );
}

/* ------------------------------------------------------------------ */
/* Criterio «sensor» — paradas                                         */
/* ------------------------------------------------------------------ */

export interface ParadaValidable {
  inicio: string;
  fin: string | null;
  lineaCodigo: string;
}

/**
 * Los tiempos de la parada coinciden con un tramo PARADA del sensor de la línea
 * dentro de ±`tolerancia.minutos`.
 *
 * @example 'Sensor: parada detectada 10:42–10:58, registro 10:44–10:57 (Δ inicio 2 min)'
 */
export function criterioSensorParada(
  parada: ParadaValidable,
  tramos: TramoSensor[],
  tolerancia: ToleranciasTci,
): CriterioTCI {
  const candidatos = tramos.filter((t) => t.estado === 'PARADA');
  if (candidatos.length === 0) {
    return criterio(
      'sensor',
      false,
      `Sin lecturas de sensor de ${parada.lineaCodigo} para el ${fechaCorta(parada.inicio)}`,
    );
  }

  const mejor = candidatos.reduce((a, b) =>
    Math.abs(minutosEntre(a.desde, parada.inicio)) <= Math.abs(minutosEntre(b.desde, parada.inicio)) ? a : b,
  );
  const deltaInicio = minutosEntre(mejor.desde, parada.inicio);
  const rangoSensor = mejor.abierto ? `${hhmm(mejor.desde)}–…` : `${hhmm(mejor.desde)}–${hhmm(mejor.hasta)}`;
  const rangoRegistro = parada.fin ? `${hhmm(parada.inicio)}–${hhmm(parada.fin)}` : `${hhmm(parada.inicio)}–…`;

  if (Math.abs(deltaInicio) > tolerancia.minutos) {
    return criterio(
      'sensor',
      false,
      `Sensor: parada detectada ${rangoSensor}, registro ${rangoRegistro} (Δ inicio ${num(Math.abs(deltaInicio), 0)} min > ${num(tolerancia.minutos, 0)} min)`,
    );
  }

  if (parada.fin && !mejor.abierto) {
    const deltaFin = minutosEntre(mejor.hasta, parada.fin);
    if (Math.abs(deltaFin) > tolerancia.minutos) {
      return criterio(
        'sensor',
        false,
        `Sensor: parada detectada ${rangoSensor}, registro ${rangoRegistro} (Δ fin ${num(Math.abs(deltaFin), 0)} min > ${num(tolerancia.minutos, 0)} min)`,
      );
    }
  }

  return criterio(
    'sensor',
    true,
    `Sensor: parada detectada ${rangoSensor}, registro ${rangoRegistro} (Δ inicio ${num(Math.abs(deltaInicio), 0)} min)`,
  );
}

/* ------------------------------------------------------------------ */
/* Criterio «sensor» — velocidades                                     */
/* ------------------------------------------------------------------ */

/**
 * La velocidad registrada difiere ≤ `tolerancia.pct` de la lectura de sensor
 * más cercana (±`tolerancia.minutos`) de esa línea.
 */
export function criterioSensorVelocidad(
  registro: { registradaEn: string; velocidadReal: number; lineaCodigo: string },
  lecturas: LecturaSensorPlana[],
  tolerancia: ToleranciasTci,
): CriterioTCI {
  const conVelocidad = lecturas.filter(
    (l) =>
      l.velocidadUnidMin !== null &&
      l.velocidadUnidMin > 0 &&
      Math.abs(minutosEntre(l.fechaHora, registro.registradaEn)) <= tolerancia.minutos,
  );
  if (conVelocidad.length === 0) {
    return criterio(
      'sensor',
      false,
      `Sin lecturas de velocidad de ${registro.lineaCodigo} entre las ${hhmm(registro.registradaEn)} ± ${num(tolerancia.minutos, 0)} min`,
    );
  }

  const cercana = conVelocidad.reduce((a, b) =>
    Math.abs(minutosEntre(a.fechaHora, registro.registradaEn)) <=
    Math.abs(minutosEntre(b.fechaHora, registro.registradaEn))
      ? a
      : b,
  );
  const sensor = cercana.velocidadUnidMin!;
  const desvioPct = Math.abs((registro.velocidadReal - sensor) / sensor) * 100;
  const base = `Sensor ${hhmm(cercana.fechaHora)}: ${num(sensor)} u/min vs ${num(registro.velocidadReal)} u/min registradas (Δ ${num(desvioPct)} %)`;
  return desvioPct <= tolerancia.pct
    ? criterio('sensor', true, base)
    : criterio('sensor', false, `${base} — supera el ${num(tolerancia.pct, 0)} %`);
}

/* ------------------------------------------------------------------ */
/* Criterio «solicitud»                                                */
/* ------------------------------------------------------------------ */

export interface SolicitudEncontrada {
  numero: string;
  fecha: string;
}

/**
 * Si la causa exige n.º de solicitud, ese número debe existir en la
 * importación de solicitudes. Si no lo exige pero el registro trae uno, el
 * número se verifica igual: un dato anotado a mano también debe ser trazable.
 * Sólo cuando la causa no lo exige y el registro no lo trae se da por cumplido.
 *
 * @example 'Solicitud SM-4471 no encontrada en la importación del 02/09'
 */
export function criterioSolicitud(
  requiere: boolean,
  causaCodigo: string,
  numero: string | null,
  encontrada: SolicitudEncontrada | null,
  fechaUltimaImportacion: string | null,
): CriterioTCI {
  if (!requiere && !numero) {
    return criterio('solicitud', true, `La causa ${causaCodigo} no exige n.º de solicitud`);
  }
  if (!numero) {
    return criterio('solicitud', false, `La causa ${causaCodigo} exige n.º de solicitud y el registro no lo tiene`);
  }
  if (!encontrada) {
    const donde = fechaUltimaImportacion
      ? `en la importación del ${fechaCorta(fechaUltimaImportacion)}`
      : 'porque aún no se importó ninguna solicitud';
    return criterio('solicitud', false, `Solicitud ${numero} no encontrada ${donde}`);
  }
  /* Un número anotado sin que la causa lo exija sigue siendo trazable: se
     verifica igual, pero el detalle debe decir por qué se comprobó. */
  return criterio(
    'solicitud',
    true,
    requiere
      ? `Solicitud ${encontrada.numero} registrada el ${fechaCorta(encontrada.fecha)}`
      : `Solicitud ${encontrada.numero} verificada aunque la causa ${causaCodigo} no la exige (registrada el ${fechaCorta(encontrada.fecha)})`,
  );
}

/* ------------------------------------------------------------------ */
/* Criterio «sap» — mermas                                             */
/* ------------------------------------------------------------------ */

export interface TransferenciaSapPlana {
  documento: string;
  fecha: string;
  productoCodigo: string;
  cantidadKg: number;
}

/**
 * Existe una transferencia SAP de la misma línea y producto, con fecha dentro
 * de ±`tolerancia.diasSap` y kilos dentro de ±`tolerancia.pct`.
 *
 * @example 'SAP: doc 4900012345 12,4 kg (Δ 3,2 %)'
 */
export function criterioSapMerma(
  merma: { fecha: string; cantidadKg: number; lineaCodigo: string },
  productoCodigo: string | null,
  candidatas: TransferenciaSapPlana[],
  tolerancia: ToleranciasTci,
): CriterioTCI {
  if (!productoCodigo) {
    return criterio('sap', false, 'La orden de la merma no tiene producto con código SAP');
  }

  const delProducto = candidatas.filter(
    (t) => t.productoCodigo === productoCodigo && Math.abs(diasEntre(t.fecha, merma.fecha)) <= tolerancia.diasSap,
  );
  if (delProducto.length === 0) {
    return criterio(
      'sap',
      false,
      `Sin transferencia SAP del producto ${productoCodigo} en ${merma.lineaCodigo} para el ${fechaCorta(merma.fecha)} (± ${tolerancia.diasSap} día${tolerancia.diasSap === 1 ? '' : 's'})`,
    );
  }

  const desvio = (t: TransferenciaSapPlana): number =>
    merma.cantidadKg > 0 ? Math.abs((t.cantidadKg - merma.cantidadKg) / merma.cantidadKg) * 100 : 100;
  const mejor = delProducto.reduce((a, b) => (desvio(a) <= desvio(b) ? a : b));
  const delta = desvio(mejor);

  return delta <= tolerancia.pct
    ? criterio('sap', true, `SAP: doc ${mejor.documento} ${num(mejor.cantidadKg)} kg (Δ ${num(delta)} %)`)
    : criterio(
        'sap',
        false,
        `SAP: doc ${mejor.documento} ${num(mejor.cantidadKg)} kg vs ${num(merma.cantidadKg)} kg registrados (Δ ${num(delta)} % > ${num(tolerancia.pct, 0)} %)`,
      );
}

/* ------------------------------------------------------------------ */
/* Overrides y resultado                                               */
/* ------------------------------------------------------------------ */

/**
 * Aplica los valores forzados a mano desde 09.C. El detalle de la regla se
 * conserva y se antepone la marca del override para que la ficha lo explique.
 */
export function aplicarOverrides(
  criterios: CriterioTCI[],
  overrides: Partial<Record<ClaveCriterioTci, boolean>> | null,
): CriterioTCI[] {
  if (!overrides) return criterios;
  return criterios.map((c) => {
    const forzado = overrides[c.clave];
    if (forzado === undefined) return c;
    return {
      ...c,
      cumple: forzado,
      override: forzado,
      detalle: `Override manual (${forzado ? 'válido' : 'inválido'}) · ${c.detalle}`,
    };
  });
}

/** Un registro es válido si todos los criterios de su tipo se cumplen. */
export function esValido(criterios: CriterioTCI[]): boolean {
  return esRegistroValidoTci(criterios);
}

/** Criterios que evalúa cada tipo de registro, en el orden de la ficha. */
export const CRITERIOS_POR_TIPO: Record<TipoRegistroTci, ClaveCriterioTci[]> = {
  parada: ['completo', 'sensor', 'solicitud'],
  merma: ['completo', 'sap', 'solicitud'],
  velocidad: ['completo', 'sensor'],
};
