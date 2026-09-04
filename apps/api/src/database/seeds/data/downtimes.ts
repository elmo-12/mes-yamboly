import type { DeteccionIoT, Parada } from '@mes/types';
import { causasEspecificas, maquinas, tipoDeCausa } from './catalogs';
import { maquinistaPorLinea } from './users';
import { ordenes } from './orders';
import { HOY, iso, minutosEntreIso, pad4, rng, sumarMinutos } from './seed';

/**
 * ~190 paradas deterministas sobre el árbol de causas **real** (se registra
 * siempre una hoja `nivel: 'especifica'` y su raíz en `tipoCausaId`) y sobre
 * las máquinas-equipo de cada línea.
 *
 * Las 4 de la OF-2026-0815 reproducen la spec 05.D (42 min en total, 3 afectan
 * OEE) y la de la Moldeadora A3 sigue abierta (spec 03.A).
 */

/** Acción tomada típica de cada causa específica del maestro real. */
const ACCIONES: Record<string, string> = {
  'CPA-PN-02-01': 'Mantenimiento intervino el equipo y se validó el arranque en vacío',
  'CPA-PN-02-02': 'Se corrigió la condición operativa y se reinició la línea',
  'CPA-PN-02-03': 'Se ajustaron los parámetros del nuevo producto con Calidad',
  'CPA-PN-03-01': 'Se coordinó con el encargado de higiene y se liberó la línea',
  'CPA-PN-03-02': 'Se cerró la capacitación y se retomó el programa',
  'CPA-PN-03-03': 'Se acotó la limpieza al alcance del procedimiento',
  'CPA-PN-03-04': 'Se cerró la intervención de mantenimiento y se liberó la línea',
  'CPA-PN-03-05': 'Se levantó la demora y se registró el detalle en la bitácora',
  'CPA-PN-04-01': 'Se recalibró la dosificación y se validó la primera muestra',
  'CPA-PN-04-02': 'Se cambió el lote de insumo y se verificó la especificación',
  'CPA-PN-04-03': 'El operario corrigió la falla sin intervención de mantenimiento',
  'CPA-PN-04-04': 'Se restableció el suministro de agua y se purgó la línea',
  'CPA-PN-04-05': 'Se restableció el agua de torre y se estabilizó la temperatura',
  'CPA-PN-04-06': 'Se esperó el restablecimiento de red y se reinició el tablero',
  'CPA-PN-04-07': 'Se restableció el vapor del caldero y se retomó el proceso',
  'CPA-PN-04-08': 'Se habilitó andamio y se liberó el acceso a cámara',
  'CPA-PN-04-09': 'Se liberó espacio en cámara reubicando pallets',
  'CPA-PN-04-10': 'Se recuperó el producto en línea y se registró la merma',
  'CPA-PN-04-11': 'Se envió el producto a reproceso y se retomó la corrida',
  'CPA-PN-04-12': 'Se escaló la entrega con almacén y se repuso el material',
  'CPA-PN-04-13': 'Se coordinó la entrega en producción y se repuso el material',
  'CPA-PN-04-14': 'Se solicitó compra urgente y se sustituyó por material equivalente',
  'CPA-PN-04-15': 'Mantenimiento reparó el equipo de limpieza y se sanitizó la zona',
  'CPA-PN-04-16': 'Se repitió la limpieza siguiendo el procedimiento',
  'CPA-PN-04-17': 'Se levantó la condición y se registró el detalle en la bitácora',
  'CPA-PN-04-18': 'Se devolvió al personal apoyado y se recompuso la dotación',
  'CPA-PN-04-19': 'Se reinstruyó al operario y se retomó la corrida',
  'CPA-PN-04-20': 'Se reasignó personal desde otra línea para cubrir el puesto',
  'CPA-PP-01-01': 'Se retomó el arranque tras el refrigerio del turno',
  'CPA-PP-01-02': 'Se ejecutó el arranque de inicio de semana según procedimiento',
  'CPA-PP-01-03': 'Se dictó la capacitación programada y se firmó el registro',
  'CPA-PP-01-04': 'Se dictó la capacitación de Calidad y se firmó el registro',
  'CPA-PP-01-05': 'Se dictó la capacitación de Higiene y se firmó el registro',
  'CPA-PP-01-06': 'Se dictó la capacitación de Producción y se firmó el registro',
  'CPA-PP-01-07': 'Se dictó la capacitación de SSOMA y se firmó el registro',
  'CPA-PP-01-08': 'Se ejecutó la limpieza previa al refrigerio según programa',
  'CPA-PP-01-09': 'Se cambió el formato y se validó la primera muestra',
  'CPA-PP-01-10': 'Se purgó la tolva y se ejecutó la limpieza entre sabores',
  'CPA-PP-01-11': 'Se ejecutó el defrost del túnel y se verificó la temperatura',
  'CPA-PP-01-12': 'Se ejecutó la limpieza posterior al refrigerio',
  'CPA-PP-01-13': 'Se ejecutó la limpieza de fin de programa semanal',
  'CPA-PP-01-14': 'Se ejecutó la limpieza de fin de turno y se entregó la línea',
  'CPA-PP-01-15': 'Se ejecutó la limpieza de inicio de programa semanal',
  'CPA-PP-01-16': 'Se ejecutó la actividad rutinaria y se registró en la bitácora',
  'CPA-PS-05-01': 'Se apoyó a la otra línea y se retomó el programa propio',
  'CPA-PS-05-02': 'Se cerró el programa anticipadamente con base remanente en tinas',
  'CPA-PS-05-03': 'Se esperó reposición de base en tinas desde pasteurización',
  'CPA-PS-05-04': 'Se ejecutó la limpieza SMED con el equipo de cambio rápido',
  'CPA-PS-05-05': 'Se activó el supermercado de producto y se retomó la corrida',
  'CPA-PS-05-06': 'Se cubrió el refrigerio del turno según rol',
  'CPA-PS-05-07': 'Se cubrió el refrigerio con limpieza SMED simultánea',
  'CPA-PS-05-08': 'Se ejecutó el relevo por refrigerio sin detener la línea',
};

function accion(causaId: string): string {
  return ACCIONES[causaId] ?? 'Se corrigió la condición y se reinició la línea';
}

/**
 * Rango de duración por tipo raíz. El maestro real trae `tiempoEstandarMin: 0`
 * en todas las causas, así que la duración se modela por familia de parada.
 */
const DURACION_POR_TIPO: Record<string, [number, number]> = {
  'CPA-PP-01': [10, 30],
  'CPA-PN-02': [12, 40],
  'CPA-PN-03': [8, 25],
  'CPA-PN-04': [10, 35],
  'CPA-PS-05': [15, 45],
};

function maquinasDeLinea(lineaId: string) {
  return maquinas.filter((m) => m.lineaId === lineaId);
}

/** Paradas de la OF-2026-0815 (spec 05.D: 42 min, 4 paradas, 3 afectan OEE). */
export const PARADAS_REFERENCIA: Parada[] = [
  {
    id: 'PAR-0815-01',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-LLEN-A1',
    maquinaId: 'MAQ-08',
    causaId: 'CPA-PP-01-10',
    tipoCausaId: 'CPA-PP-01',
    inicio: iso(HOY, '07:42'),
    fin: iso(HOY, '07:56'),
    duracionMin: 14,
    accionTomada: 'Se purgó la tolva y se ejecutó la limpieza entre sabores',
    /* Paro rutinario planificado: no descuenta disponibilidad. */
    afectaOee: false,
    responsableId: 'USR-07',
    origen: 'manual',
    tiempoRegistroSeg: 74,
  },
  {
    id: 'PAR-0815-02',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-LLEN-A1',
    maquinaId: 'MAQ-08',
    causaId: 'CPA-PN-04-01',
    tipoCausaId: 'CPA-PN-04',
    inicio: iso(HOY, '09:24'),
    fin: iso(HOY, '09:31'),
    duracionMin: 7,
    accionTomada: 'Se recalibró la dosificación y se validó la primera muestra',
    afectaOee: true,
    responsableId: 'USR-07',
    origen: 'manual',
    tiempoRegistroSeg: 92,
  },
  {
    id: 'PAR-0815-03',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-LLEN-A1',
    maquinaId: 'MAQ-10',
    causaId: 'CPA-PN-02-01',
    tipoCausaId: 'CPA-PN-02',
    inicio: iso(HOY, '11:18'),
    fin: iso(HOY, '11:27'),
    duracionMin: 9,
    accionTomada: 'Mantenimiento cambió el retén de la tapadora y validó el arranque',
    numeroSolicitud: 'SM-2026-0421',
    evidenciaUrl: '/mock/evidencias/par-0815-03.jpg',
    afectaOee: true,
    responsableId: 'USR-07',
    origen: 'iot',
    deteccionId: 'IOT-0815-01',
    tiempoRegistroSeg: 68,
  },
  {
    id: 'PAR-0815-04',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-LLEN-A1',
    maquinaId: 'MAQ-10',
    causaId: 'CPA-PN-04-14',
    tipoCausaId: 'CPA-PN-04',
    inicio: iso(HOY, '12:40'),
    fin: iso(HOY, '12:52'),
    duracionMin: 12,
    accionTomada: 'Se trasladaron tapas desde el almacén de empaques y se repuso la tapadora',
    afectaOee: true,
    responsableId: 'USR-07',
    origen: 'manual',
    tiempoRegistroSeg: 81,
  },
];

/** Parada abierta de la Moldeadora A3: PN-02 · 18 min (spec 02.C y 03.A). */
export const PARADA_ABIERTA: Parada = {
  id: 'PAR-0812-01',
  ordenId: 'ORD-0812',
  lineaId: 'LIN-MOLD-A3',
  maquinaId: 'MAQ-28',
  causaId: 'CPA-PN-02-02',
  tipoCausaId: 'CPA-PN-02',
  inicio: iso(HOY, '13:47'),
  fin: null,
  duracionMin: 18,
  accionTomada: 'Se está reajustando el sincronismo de las pinzas extractoras',
  afectaOee: true,
  responsableId: 'USR-09',
  origen: 'manual',
  tiempoRegistroSeg: 88,
};

function generarParadas(): Parada[] {
  const r = rng(202);
  const out: Parada[] = [];
  const conParadas = ordenes.filter(
    (o) => o.paradasCount > 0 && o.id !== 'ORD-0815' && o.id !== 'ORD-0812'
  );

  for (const orden of conParadas) {
    const maquinasLinea = maquinasDeLinea(orden.lineaId);
    const causasLinea = causasEspecificas.filter(
      (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(orden.lineaId)
    );
    let cursor = sumarMinutos(orden.inicio, 35);

    for (let i = 0; i < orden.paradasCount; i += 1) {
      const causa = causasLinea[r.int(0, causasLinea.length - 1)]!;
      const tipo = tipoDeCausa(causa.id);
      const maquina = maquinasLinea[r.int(0, Math.max(0, maquinasLinea.length - 1))] ?? maquinas[0]!;
      const [minimo, maximo] = DURACION_POR_TIPO[tipo?.id ?? ''] ?? [10, 30];
      const duracionMin = r.int(minimo, maximo);
      const inicio = cursor;
      const fin = sumarMinutos(inicio, duracionMin);
      out.push({
        id: `PAR-${orden.id.slice(4)}-${pad4(i + 1).slice(2)}`,
        ordenId: orden.id,
        lineaId: orden.lineaId,
        maquinaId: maquina.id,
        causaId: causa.id,
        tipoCausaId: tipo?.id ?? causa.id,
        inicio,
        fin,
        duracionMin,
        accionTomada: accion(causa.id),
        numeroSolicitud: causa.requiereSolicitud ? `SM-2026-${pad4(r.int(200, 599))}` : undefined,
        evidenciaUrl: causa.requiereEvidencia ? `/mock/evidencias/${orden.id}-${i + 1}.jpg` : undefined,
        /* Los paros rutinarios planificados (PP-01) no descuentan disponibilidad. */
        afectaOee: causa.clasificacion === 'imprevista',
        responsableId: maquinistaPorLinea[orden.lineaId] ?? 'USR-07',
        origen: r.bool(0.18) ? 'iot' : 'manual',
        tiempoRegistroSeg: r.int(52, 128),
      });
      cursor = sumarMinutos(fin, r.int(25, 70));
    }
  }
  return out;
}

export const paradas: Parada[] = [
  ...PARADAS_REFERENCIA,
  PARADA_ABIERTA,
  ...generarParadas(),
];

export const paradaPorId = new Map(paradas.map((p) => [p.id, p]));

/** Minutos de parada agregados de una orden. */
export function minutosParadaOrden(ordenId: string): number {
  return paradas
    .filter((p) => p.ordenId === ordenId)
    .reduce((acc, p) => acc + (p.fin ? p.duracionMin : minutosEntreIso(p.inicio, iso(HOY, '14:05'))), 0);
}

/* ------------------------------------------------------------------ */
/* Detecciones IoT                                                     */
/* ------------------------------------------------------------------ */

export const detecciones: DeteccionIoT[] = [
  {
    id: 'IOT-EXTR2-01',
    lineaId: 'LIN-EXTR-2',
    lineaCodigo: 'EXTR-2',
    maquinaId: 'MAQ-01',
    detectadaEn: iso(HOY, '14:02'),
    minutos: 3,
    estado: 'sugerida',
    texto: 'El sensor de la Extrusora 2 no registra movimiento desde las 14:02 (3 min)',
  },
  {
    id: 'IOT-0815-01',
    lineaId: 'LIN-LLEN-A1',
    lineaCodigo: 'LLEN-A1',
    maquinaId: 'MAQ-10',
    detectadaEn: iso(HOY, '11:18'),
    minutos: 9,
    estado: 'confirmada',
    paradaId: 'PAR-0815-03',
    texto: 'El sensor de la Llenadora A1 no registró movimiento entre las 11:18 y las 11:27 (9 min)',
  },
  {
    id: 'IOT-MOLDA3-01',
    lineaId: 'LIN-MOLD-A3',
    lineaCodigo: 'MOLD-A3',
    maquinaId: 'MAQ-28',
    detectadaEn: iso(HOY, '13:47'),
    minutos: 18,
    estado: 'confirmada',
    paradaId: 'PAR-0812-01',
    texto: 'El sensor de la Moldeadora A3 no registra movimiento desde las 13:47 (18 min)',
  },
  {
    id: 'IOT-LLENM2-01',
    lineaId: 'LIN-LLEN-M2',
    lineaCodigo: 'LLEN-M2',
    maquinaId: 'MAQ-19',
    detectadaEn: iso(HOY, '10:26'),
    minutos: 4,
    estado: 'descartada',
    texto: 'El sensor de la Llenadora M2 no registró movimiento a las 10:26 (4 min)',
  },
];
