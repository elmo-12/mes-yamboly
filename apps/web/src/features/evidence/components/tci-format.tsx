import { Icon, Tooltip, type BadgeColor, type IconName } from '@mes/ui';
import {
  COLUMNAS_FUENTE,
  type CriterioTCI,
  type MapeoImportacion,
  type TipoFuenteExterna,
  type TipoRegistroTci,
} from '@mes/types';

/** Color del Badge de tipo de registro en la tabla de evaluaciones. */
export const TIPO_REGISTRO_BADGE: Record<TipoRegistroTci, BadgeColor> = {
  parada: 'informational',
  merma: 'accent',
  velocidad: 'neutral',
};

/** Descripción de cada fuente externa en su tarjeta (qué aporta a la validación). */
export const FUENTE_DESCRIPCION: Record<TipoFuenteExterna, string> = {
  sensores:
    'Estados PRODUCIENDO / PARADA y velocidad por línea. Validan los tiempos de parada y las velocidades registradas.',
  solicitudes:
    'Solicitudes de mantenimiento y de merma. Validan el n.º de solicitud de las causas que lo exigen.',
  sap_mermas:
    'Transferencias de merma de SAP. Validan la cantidad en kg y la fecha de cada merma registrada.',
};

/** Título del modal de importación (el label en minúsculas rompería «SAP»). */
export const FUENTE_TITULO_IMPORTAR: Record<TipoFuenteExterna, string> = {
  sensores: 'Importar lecturas de sensor',
  solicitudes: 'Importar solicitudes de mantenimiento',
  sap_mermas: 'Importar transferencias de merma SAP',
};

/** Nombre del archivo de plantilla que ofrece la API por fuente. */
export const FUENTE_PLANTILLA: Record<TipoFuenteExterna, string> = {
  sensores: 'plantilla-sensores.xlsx',
  solicitudes: 'plantilla-solicitudes.xlsx',
  sap_mermas: 'plantilla-transferencias-sap.xlsx',
};

/** Icono de la tarjeta de cada fuente externa. */
export const FUENTE_ICONO: Record<TipoFuenteExterna, IconName> = {
  sensores: 'activity',
  solicitudes: 'task-list',
  sap_mermas: 'database',
};

/**
 * Cabecera normalizada para el mapeo automático: sin tildes, sin mayúsculas y
 * con los separadores unificados en `_` (`Fecha / Hora` → `fecha_hora`).
 */
export function normalizarCabecera(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Palabras de una cabecera ya normalizada: `Fecha y hora` → `['fecha','y','hora']`. */
function palabras(texto: string): string[] {
  return normalizarCabecera(texto).split('_').filter(Boolean);
}

/** Solapamiento mínimo de palabras para aceptar un emparejamiento aproximado. */
const UMBRAL_PARECIDO = 0.5;

/**
 * Empareja cada columna esperada de la plantilla con una cabecera del archivo.
 * Primero resuelve las coincidencias exactas normalizadas y luego, entre las
 * cabeceras libres, elige la de mayor solapamiento de palabras: así
 * `Fecha y hora` cae en `fecha_hora` y `Cantidad (kg)` en `cantidad_kg` sin que
 * `fecha` se quede con una cabecera que pertenece a otra columna.
 */
export function mapeoAutomatico(
  tipo: TipoFuenteExterna,
  cabeceras: readonly string[],
): MapeoImportacion {
  const candidatos = cabeceras.map((c) => ({
    original: c,
    normal: normalizarCabecera(c),
    palabras: palabras(c),
  }));
  const mapeo: MapeoImportacion = {};
  const usadas = new Set<string>();

  for (const columna of COLUMNAS_FUENTE[tipo]) {
    const exacta = candidatos.find((c) => c.normal === columna && !usadas.has(c.original));
    if (exacta) {
      mapeo[columna] = exacta.original;
      usadas.add(exacta.original);
    }
  }

  for (const columna of COLUMNAS_FUENTE[tipo]) {
    if (mapeo[columna]) continue;
    const esperadas = columna.split('_').filter(Boolean);
    let mejor: (typeof candidatos)[number] | undefined;
    let mejorPuntaje = 0;
    for (const candidato of candidatos) {
      if (usadas.has(candidato.original)) continue;
      const comunes = esperadas.filter((p) => candidato.palabras.includes(p)).length;
      if (comunes === 0) continue;
      const puntaje = comunes / Math.max(esperadas.length, candidato.palabras.length);
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = candidato;
      }
    }
    if (mejor && mejorPuntaje >= UMBRAL_PARECIDO) {
      mapeo[columna] = mejor.original;
      usadas.add(mejor.original);
    }
  }

  return mapeo;
}

/** Columnas obligatorias por fuente (el resto puede quedar sin mapear). */
export const COLUMNAS_OPCIONALES: Record<TipoFuenteExterna, readonly string[]> = {
  sensores: ['velocidad_unid_min'],
  solicitudes: ['linea', 'descripcion'],
  sap_mermas: ['tipo_merma', 'motivo'],
};

/**
 * Icono check / cruz de un criterio en la tabla de evaluaciones, con el detalle
 * de la regla en un Tooltip y una marca cuando el valor viene de un override.
 */
export function CriterioIcono({ criterio, contexto }: { criterio: CriterioTCI; contexto: string }) {
  const forzado = criterio.override === true || criterio.override === false;
  return (
    <Tooltip
      content={`${criterio.label}: ${criterio.cumple ? 'cumple' : 'no cumple'}`}
      supporting={forzado ? `${criterio.detalle} · Revisado a mano` : criterio.detalle}
    >
      <span
        className="inline-flex items-center justify-center"
        tabIndex={0}
        aria-label={`${contexto} · ${criterio.label}: ${criterio.cumple ? 'cumple' : 'no cumple'}`}
      >
        <Icon
          name={criterio.cumple ? 'check-circle' : 'x-mark-circle'}
          size={18}
          className={criterio.cumple ? 'text-success-text' : 'text-error-text'}
        />
        {forzado && <span className="ml-0.5 text-caption text-text-secondary">*</span>}
      </span>
    </Tooltip>
  );
}
