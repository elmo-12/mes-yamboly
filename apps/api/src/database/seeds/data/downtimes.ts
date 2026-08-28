import type { DeteccionIoT, Parada } from '@mes/types';
import { causasEspecificas, maquinas, tipoDeCausa } from './catalogs';
import { maquinistaPorLinea } from './users';
import { ordenes } from './orders';
import { HOY, iso, minutosEntreIso, pad4, rng, sumarMinutos } from './seed';

/**
 * ~180 paradas deterministas. Las 4 de la OF-2026-0815 reproducen la spec 05.D
 * (42 min en total, 3 afectan OEE) y la de la L4 sigue abierta (spec 03.A).
 */

const ACCIONES: Record<string, string> = {
  'CPA-PM-01-01': 'Se reemplazó la faja y se verificó tensión de rodillos',
  'CPA-PM-01-03': 'Se reemplazó cadena y se reajustó tensión',
  'CPA-PM-01-02': 'Se retiró el material atascado y se limpió la mordaza',
  'CPA-PM-01-04': 'Se reajustaron los moldes y se verificó el alineamiento',
  'CPA-PM-01-05': 'Se desmontó y purgó la boquilla dosificadora',
  'CPA-PE-02-01': 'Se esperó restablecimiento de red y se reinició el tablero',
  'CPA-PE-02-02': 'Se estabilizó la tensión con el grupo electrógeno',
  'CPA-PE-02-03': 'Se reemplazó el variador de la envolvedora',
  'CPA-PE-02-04': 'Se recalibró el sensor fotoeléctrico de conteo',
  'CPA-PL-03-01': 'Se ejecutó el CIP de inicio de turno según procedimiento',
  'CPA-PL-03-02': 'Se ejecutó CIP entre sabores según programa',
  'CPA-PL-03-03': 'Se sanitizaron las tolvas y se registró el checklist',
  'CPA-PC-04-01': 'Se cambió el molde y se validó la primera muestra',
  'CPA-PC-04-02': 'Se montó bobina nueva y se ajustó el registro de impresión',
  'CPA-PC-04-03': 'Se purgó la mezcla anterior y se cargó el nuevo sabor',
  'CPA-PA-05-01': 'Se solicitó mezcla base a pasteurización y se repuso la tolva',
  'CPA-PA-05-02': 'Se repuso cobertura desde almacén de insumos',
  'CPA-PA-05-03': 'Se trasladó bobina desde almacén y se montó en la envolvedora',
  'CPA-PA-05-04': 'Se repusieron cajas desde el almacén de empaques',
  'CPA-PO-06-01': 'Se recalibró la balanza y se ajustó el peso de dosificación',
  'CPA-PO-06-02': 'Se ajustó el set point de temperatura del túnel',
  'CPA-PO-06-03': 'Se ajustó la temperatura y presión de la mordaza de sellado',
  'CPA-PS-07-01': 'Se reasignó operario desde la línea 5 para cubrir el puesto',
  'CPA-PS-07-02': 'Se reprogramó el refrigerio escalonado del turno',
};

function accion(causaId: string): string {
  return ACCIONES[causaId] ?? 'Se corrigió la condición y se reinició la línea';
}

function maquinasDeLinea(lineaId: string) {
  return maquinas.filter((m) => m.lineaId === lineaId);
}

/** Paradas de la OF-2026-0815 (spec 05.D: 42 min, 4 paradas, 3 afectan OEE). */
export const PARADAS_REFERENCIA: Parada[] = [
  {
    id: 'PAR-0815-01',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-02',
    maquinaId: 'MAQ-05',
    causaId: 'CPA-PL-03-02',
    tipoCausaId: 'CPA-PL-03',
    inicio: iso(HOY, '07:42'),
    fin: iso(HOY, '07:56'),
    duracionMin: 14,
    accionTomada: 'Se ejecutó CIP entre sabores según programa',
    afectaOee: false,
    responsableId: 'USR-02',
    origen: 'manual',
    tiempoRegistroSeg: 74,
  },
  {
    id: 'PAR-0815-02',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-02',
    maquinaId: 'MAQ-03',
    causaId: 'CPA-PO-06-01',
    tipoCausaId: 'CPA-PO-06',
    inicio: iso(HOY, '09:24'),
    fin: iso(HOY, '09:31'),
    duracionMin: 7,
    accionTomada: 'Se recalibró la balanza y se ajustó el peso de dosificación',
    afectaOee: true,
    responsableId: 'USR-02',
    origen: 'manual',
    tiempoRegistroSeg: 92,
  },
  {
    id: 'PAR-0815-03',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-02',
    maquinaId: 'MAQ-04',
    causaId: 'CPA-PM-01-03',
    tipoCausaId: 'CPA-PM-01',
    inicio: iso(HOY, '11:18'),
    fin: iso(HOY, '11:27'),
    duracionMin: 9,
    accionTomada: 'Se reemplazó cadena y se reajustó tensión',
    numeroSolicitud: 'SM-2026-0421',
    evidenciaUrl: '/mock/evidencias/par-0815-03.jpg',
    afectaOee: true,
    responsableId: 'USR-02',
    origen: 'iot',
    deteccionId: 'IOT-0815-01',
    tiempoRegistroSeg: 68,
  },
  {
    id: 'PAR-0815-04',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-02',
    maquinaId: 'MAQ-04',
    causaId: 'CPA-PA-05-03',
    tipoCausaId: 'CPA-PA-05',
    inicio: iso(HOY, '12:40'),
    fin: iso(HOY, '12:52'),
    duracionMin: 12,
    accionTomada: 'Se trasladó bobina desde almacén y se montó en la envolvedora',
    afectaOee: true,
    responsableId: 'USR-02',
    origen: 'manual',
    tiempoRegistroSeg: 81,
  },
];

/** Parada abierta de la L4 Sándwich: PM-01 · 18 min (spec 02.C y 03.A). */
export const PARADA_L4_ABIERTA: Parada = {
  id: 'PAR-0812-01',
  ordenId: 'ORD-0812',
  lineaId: 'LIN-04',
  maquinaId: 'MAQ-09',
  causaId: 'CPA-PM-01-04',
  tipoCausaId: 'CPA-PM-01',
  inicio: iso(HOY, '13:47'),
  fin: null,
  duracionMin: 18,
  accionTomada: 'Se está reajustando el alineamiento de moldes de la ensambladora',
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
      const duracionMin = Math.max(3, causa.tiempoEstandarMin + r.int(-5, 9));
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
        afectaOee: causa.afectaOee,
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
  PARADA_L4_ABIERTA,
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
    id: 'IOT-L3-01',
    lineaId: 'LIN-03',
    lineaCodigo: 'L3',
    maquinaId: 'MAQ-06',
    detectadaEn: iso(HOY, '14:02'),
    minutos: 3,
    estado: 'sugerida',
    texto: 'El sensor de L3 no registra movimiento desde las 14:02 (3 min)',
  },
  {
    id: 'IOT-0815-01',
    lineaId: 'LIN-02',
    lineaCodigo: 'L2',
    maquinaId: 'MAQ-04',
    detectadaEn: iso(HOY, '11:18'),
    minutos: 9,
    estado: 'confirmada',
    paradaId: 'PAR-0815-03',
    texto: 'El sensor de L2 no registró movimiento entre las 11:18 y las 11:27 (9 min)',
  },
  {
    id: 'IOT-L4-01',
    lineaId: 'LIN-04',
    lineaCodigo: 'L4',
    maquinaId: 'MAQ-09',
    detectadaEn: iso(HOY, '13:47'),
    minutos: 18,
    estado: 'confirmada',
    paradaId: 'PAR-0812-01',
    texto: 'El sensor de L4 no registra movimiento desde las 13:47 (18 min)',
  },
  {
    id: 'IOT-L1-01',
    lineaId: 'LIN-01',
    lineaCodigo: 'L1',
    maquinaId: 'MAQ-01',
    detectadaEn: iso(HOY, '10:26'),
    minutos: 4,
    estado: 'descartada',
    texto: 'El sensor de L1 no registró movimiento a las 10:26 (4 min)',
  },
];
