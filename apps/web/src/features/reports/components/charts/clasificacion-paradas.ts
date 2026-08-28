import { chartColors } from '@/components/charts';

/**
 * Clasificación de una causa de parada por su prefijo codificado. Es la misma
 * partición que usa el donut "Clasificación de paradas" (Figma 2165:13836), de
 * modo que el color de una barra del Pareto y el de su segmento coinciden.
 */
export type ClaseParada = 'fallas' | 'rutinarias' | 'organizativas';

const PREFIJO_CLASE: Record<string, ClaseParada> = {
  /* Fallas de equipo */
  PM: 'fallas',
  PE: 'fallas',
  /* Paradas rutinarias / programadas */
  PL: 'rutinarias',
  PC: 'rutinarias',
  /* Organizativas o imprevistas */
  PA: 'organizativas',
  PO: 'organizativas',
  PS: 'organizativas',
};

export const CLASE_PARADA_COLOR: Record<ClaseParada, string> = {
  fallas: chartColors.danger,
  rutinarias: chartColors.primary,
  organizativas: chartColors.warning,
};

export const CLASE_PARADA_LABEL: Record<ClaseParada, string> = {
  fallas: 'Fallas de equipo',
  rutinarias: 'Rutinarias',
  organizativas: 'Organizativas / imprevistas',
};

export function clasePorCodigo(codigo: string): ClaseParada {
  return PREFIJO_CLASE[codigo.slice(0, 2).toUpperCase()] ?? 'organizativas';
}

export function colorPorCausa(codigo: string): string {
  return CLASE_PARADA_COLOR[clasePorCodigo(codigo)];
}

/** Color del segmento del donut a partir de su clave (`rutinarias`, `fallas`…). */
export function colorPorClave(clave: string): string {
  const normalizada = clave.toLowerCase();
  if (normalizada.startsWith('fall')) return CLASE_PARADA_COLOR.fallas;
  if (normalizada.startsWith('rutin')) return CLASE_PARADA_COLOR.rutinarias;
  return CLASE_PARADA_COLOR.organizativas;
}
