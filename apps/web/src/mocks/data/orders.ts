import type { AuditEvent, OrdenFabricacion, Turno } from '@mes/types';
import { lineas, velocidadesPorLinea } from './catalogs';
import { colaboradoresBase, maquinistaPorLinea, supervisorPorTurno } from './users';
import { HOY, fechaMas, fechaMenos, iso, pad4, redondear, rng } from './seed';

/**
 * 60 órdenes deterministas: OF-2026-0815 … OF-2026-0756, repartidas entre las
 * 9 líneas reales y los 2 turnos (`D` 06:00–18:00 · `N` 18:00–06:00).
 *
 * Cada orden usa un producto que **tiene par activo en su línea**
 * (`VelocidadEstandar`): `velocidadEstandar` es el `velocidadUnidMin` del par
 * congelado al iniciar y `velocidadEstandarId` apunta al par de origen.
 *
 * La OF-2026-0815 (Llenadora A1 · Cornello Vainilla) es la orden de referencia
 * de Figma y QA: 4 paradas · 42 min · 2 mermas.
 */

/** Total histórico mostrado en el header y en la summary card "Todas" (spec 05.A). */
export const TOTAL_HISTORICO_ORDENES = 1248;

const TURNOS_ROT: Turno[] = ['D', 'N'];

/** Hora de inicio y fin de cada turno real. */
const HORARIO_TURNO: Record<Turno, { inicio: string; fin: string }> = {
  D: { inicio: '06:00', fin: '18:00' },
  N: { inicio: '18:00', fin: '06:00' },
};

/** OF-2026-0815 — orden de referencia de todas las pantallas. */
export const ORDEN_REFERENCIA: OrdenFabricacion = {
  id: 'ORD-0815',
  codigo: 'OF-2026-0815',
  fecha: HOY,
  lineaId: 'LIN-LLEN-A1',
  productoId: 'PRD-1120002',
  turno: 'D',
  lote: 'L-260828-A1',
  vencimiento: fechaMas(184),
  planificado: 88000,
  producido: 86240,
  conteoCodificadora: 84601,
  velocidadEstandar: 133.3,
  velocidadEstandarId: 'VE-0070',
  estado: 'por_validar',
  maquinistaId: 'USR-07',
  supervisorId: 'USR-03',
  operarios: 6,
  colaboradores: colaboradoresBase,
  oee: { oee: 81.3, disponibilidad: 92.0, desempeno: 90.1, calidad: 98.1 },
  paradasCount: 4,
  mermasKg: 5.0,
  inicio: iso(HOY, '06:00'),
  fin: iso(HOY, '14:00'),
  observacion: 'Cierre anticipado del programa; la línea pasó a limpieza de fin de programa.',
};

/**
 * Órdenes del día de hoy: 8 de las 9 líneas están corriendo el turno Día.
 * La Llenadora A2 queda sin orden (estado «Sin orden» del tablero, spec 03.A).
 */
const ordenesHoy: OrdenFabricacion[] = [
  ORDEN_REFERENCIA,
  {
    id: 'ORD-0814',
    codigo: 'OF-2026-0814',
    fecha: HOY,
    lineaId: 'LIN-LLEN-M2',
    productoId: 'PRD-1110001',
    turno: 'D',
    lote: 'L-260828-M2',
    vencimiento: fechaMas(184),
    planificado: 5300,
    producido: 3620,
    conteoCodificadora: 3515,
    velocidadEstandar: 8,
    velocidadEstandarId: 'VE-0002',
    estado: 'en_curso',
    maquinistaId: 'USR-07',
    supervisorId: 'USR-03',
    operarios: 5,
    colaboradores: colaboradoresBase.slice(0, 4),
    oee: { oee: 76.9, disponibilidad: 94.1, desempeno: 84.2, calidad: 97.1 },
    paradasCount: 0,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
  {
    id: 'ORD-0813',
    codigo: 'OF-2026-0813',
    fecha: HOY,
    lineaId: 'LIN-LLEN-M1',
    productoId: 'PRD-1110004',
    turno: 'D',
    lote: 'L-260828-M1',
    vencimiento: fechaMas(184),
    planificado: 8100,
    producido: 5480,
    conteoCodificadora: 5332,
    velocidadEstandar: 12.3,
    velocidadEstandarId: 'VE-0003',
    estado: 'en_curso',
    maquinistaId: 'USR-08',
    supervisorId: 'USR-03',
    operarios: 5,
    colaboradores: colaboradoresBase.slice(0, 5),
    oee: { oee: 74.2, disponibilidad: 89.6, desempeno: 85.1, calidad: 97.3 },
    paradasCount: 0,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
  {
    id: 'ORD-0812',
    codigo: 'OF-2026-0812',
    fecha: HOY,
    lineaId: 'LIN-MOLD-A3',
    productoId: 'PRD-1120023',
    turno: 'D',
    lote: 'L-260828-A3',
    vencimiento: fechaMas(184),
    planificado: 231000,
    producido: 148200,
    conteoCodificadora: 143412,
    velocidadEstandar: 350,
    velocidadEstandarId: 'VE-0077',
    estado: 'en_curso',
    maquinistaId: 'USR-09',
    supervisorId: 'USR-03',
    operarios: 6,
    colaboradores: colaboradoresBase.slice(0, 6),
    oee: { oee: 68.4, disponibilidad: 82.3, desempeno: 85.9, calidad: 96.7 },
    paradasCount: 1,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
  {
    id: 'ORD-0811',
    codigo: 'OF-2026-0811',
    fecha: HOY,
    lineaId: 'LIN-EXTR-2',
    productoId: 'PRD-1120001',
    turno: 'D',
    lote: 'L-260828-E2',
    vencimiento: fechaMas(184),
    planificado: 242000,
    producido: 165400,
    conteoCodificadora: 160930,
    velocidadEstandar: 366.7,
    velocidadEstandarId: 'VE-0069',
    estado: 'en_curso',
    maquinistaId: 'USR-02',
    supervisorId: 'USR-03',
    operarios: 6,
    colaboradores: colaboradoresBase.slice(0, 5),
    oee: { oee: 84.6, disponibilidad: 96.2, desempeno: 90.4, calidad: 97.3 },
    paradasCount: 0,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
  {
    id: 'ORD-0810',
    codigo: 'OF-2026-0810',
    fecha: HOY,
    lineaId: 'LIN-EXTR-3',
    productoId: 'PRD-1120003',
    turno: 'D',
    lote: 'L-260828-E3',
    vencimiento: fechaMas(184),
    planificado: 168000,
    producido: 114800,
    conteoCodificadora: 111667,
    velocidadEstandar: 255,
    velocidadEstandarId: 'VE-0071',
    estado: 'en_curso',
    maquinistaId: 'USR-10',
    supervisorId: 'USR-03',
    operarios: 5,
    colaboradores: colaboradoresBase.slice(0, 4),
    oee: { oee: 79.1, disponibilidad: 92.7, desempeno: 87.8, calidad: 97.2 },
    paradasCount: 0,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
  {
    id: 'ORD-0809',
    codigo: 'OF-2026-0809',
    fecha: HOY,
    lineaId: 'LIN-MOLD-A2',
    productoId: 'PRD-1120023',
    turno: 'D',
    lote: 'L-260828-A2',
    vencimiento: fechaMas(184),
    planificado: 198000,
    producido: 133600,
    conteoCodificadora: 130127,
    velocidadEstandar: 300,
    velocidadEstandarId: 'VE-0076',
    estado: 'en_curso',
    maquinistaId: 'USR-09',
    supervisorId: 'USR-03',
    operarios: 6,
    colaboradores: colaboradoresBase.slice(0, 6),
    oee: { oee: 77.5, disponibilidad: 90.8, desempeno: 87.9, calidad: 97.1 },
    paradasCount: 0,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
  {
    id: 'ORD-0808',
    codigo: 'OF-2026-0808',
    fecha: HOY,
    lineaId: 'LIN-MOLD-A4',
    productoId: 'PRD-1120074',
    turno: 'D',
    lote: 'L-260828-A4',
    vencimiento: fechaMas(184),
    planificado: 302000,
    producido: 208500,
    conteoCodificadora: 203207,
    velocidadEstandar: 458.3,
    velocidadEstandarId: 'VE-0092',
    estado: 'en_curso',
    maquinistaId: 'USR-10',
    supervisorId: 'USR-03',
    operarios: 7,
    colaboradores: colaboradoresBase.slice(0, 5),
    oee: { oee: 80.2, disponibilidad: 93.1, desempeno: 88.4, calidad: 97.5 },
    paradasCount: 0,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
];

/** Índices (0-based sobre las 52 órdenes históricas) marcados como "Por validar". */
const POR_VALIDAR = new Set([1, 4, 7, 9, 13, 16, 19, 22, 27, 31, 38]);
const INCOMPLETAS = new Set([6, 24, 41]);
/** Las 35 primeras órdenes históricas tienen paradas (2 + 35 = 37, spec 05.A). */
const CON_PARADAS = 35;
/** Las 20 primeras tienen mermas (1 + 20 = 21, spec 05.A). */
const CON_MERMAS = 20;

/** 13 días × 4 órdenes = 52 históricas, rotando las 9 líneas y los 2 turnos. */
function generarHistoricas(): OrdenFabricacion[] {
  const r = rng(101);
  const out: OrdenFabricacion[] = [];

  for (let dia = 1; dia <= 13; dia += 1) {
    for (let k = 0; k < 4; k += 1) {
      const j = (dia - 1) * 4 + k;
      const numero = 807 - j;
      const linea = lineas[j % lineas.length]!;
      const pares = velocidadesPorLinea.get(linea.id) ?? [];
      const par = pares[j % pares.length]!;
      const turno = TURNOS_ROT[(dia + k) % TURNOS_ROT.length]!;
      const fecha = fechaMenos(dia);
      const planificado = Math.round((par.velocidadUnidMin * 660) / 100) * 100;
      const eficiencia = r.float(0.82, 0.99, 3);
      const producido = Math.round(planificado * eficiencia);
      const calidad = r.float(95.4, 99.2);
      const conteoCodificadora = Math.round(producido * (calidad / 100));
      const disponibilidad = r.float(81, 97);
      const desempeno = r.float(80, 96);
      const oee = redondear((disponibilidad / 100) * (desempeno / 100) * (calidad / 100) * 100);

      const estado = POR_VALIDAR.has(j)
        ? 'por_validar'
        : INCOMPLETAS.has(j)
          ? 'incompleta'
          : dia >= 4
            ? 'validada'
            : 'cerrada';

      const paradasCount = j < CON_PARADAS ? r.int(3, 8) : 0;
      const mermasKg = j < CON_MERMAS ? r.float(1.8, 14.5) : 0;
      const horario = HORARIO_TURNO[turno];

      out.push({
        id: `ORD-${pad4(numero)}`,
        codigo: `OF-2026-${pad4(numero)}`,
        fecha,
        lineaId: linea.id,
        productoId: par.productoId,
        turno,
        lote: `L-${fecha.slice(2).replace(/-/g, '')}-${linea.codigo.replace('-', '')}`,
        vencimiento: fechaMas(184 - dia, fecha),
        planificado,
        producido,
        conteoCodificadora,
        velocidadEstandar: par.velocidadUnidMin,
        velocidadEstandarId: par.id,
        estado,
        maquinistaId: maquinistaPorLinea[linea.id] ?? 'USR-07',
        supervisorId: supervisorPorTurno[turno],
        operarios: r.int(4, 7),
        colaboradores: colaboradoresBase.slice(0, r.int(3, 6)),
        oee: { oee, disponibilidad, desempeno, calidad },
        paradasCount,
        mermasKg: redondear(mermasKg),
        inicio: iso(fecha, horario.inicio),
        fin: turno === 'N' ? iso(fechaMenos(dia - 1), horario.fin) : iso(fecha, horario.fin),
      });
    }
  }
  return out;
}

export const ordenes: OrdenFabricacion[] = [...ordenesHoy, ...generarHistoricas()];

export const ordenPorId = new Map(ordenes.map((o) => [o.id, o]));
export const ordenPorCodigo = new Map(ordenes.map((o) => [o.codigo, o]));

/* ------------------------------------------------------------------ */
/* Bitácora (RF12) — spec 05.E                                         */
/* ------------------------------------------------------------------ */

export const bitacoraReferencia: AuditEvent[] = [
  { id: 'AUD-0815-01', ordenId: 'ORD-0815', fecha: iso(HOY, '05:58'), usuario: 'Ana Ríos', usuarioIniciales: 'AR', tipo: 'creacion', texto: 'Ana Ríos creó la orden OF-2026-0815 · CORNELLO VAI 12X120ML · 88 000 unidades' },
  { id: 'AUD-0815-02', ordenId: 'ORD-0815', fecha: iso(HOY, '06:00'), usuario: 'Luis Vargas', usuarioIniciales: 'LV', tipo: 'sistema', texto: 'Luis Vargas inició la producción del turno Día en la Llenadora A1' },
  { id: 'AUD-0815-03', ordenId: 'ORD-0815', fecha: iso(HOY, '07:42'), usuario: 'Luis Vargas', usuarioIniciales: 'LV', tipo: 'parada', texto: 'Luis Vargas registró la parada 07:42 PP-01-10 Cambio de sabor (14 min)' },
  { id: 'AUD-0815-04', ordenId: 'ORD-0815', fecha: iso(HOY, '08:15'), usuario: 'Ana Ríos', usuarioIniciales: 'AR', tipo: 'edicion', texto: 'Ana Ríos editó la causa de la parada 07:42: PN-03 → PP-01' },
  { id: 'AUD-0815-05', ordenId: 'ORD-0815', fecha: iso(HOY, '09:10'), usuario: 'Luis Vargas', usuarioIniciales: 'LV', tipo: 'velocidad', texto: 'Luis Vargas registró velocidad real 131 u/min (estándar 133,3 · −1,7 %)' },
  { id: 'AUD-0815-06', ordenId: 'ORD-0815', fecha: iso(HOY, '11:05'), usuario: 'Luis Vargas', usuarioIniciales: 'LV', tipo: 'merma', texto: 'Luis Vargas registró merma EP 3,2 kg · MP-01-01 Arranque' },
  { id: 'AUD-0815-07', ordenId: 'ORD-0815', fecha: iso(HOY, '11:27'), usuario: 'Sistema', usuarioIniciales: 'SY', tipo: 'sistema', texto: 'Sistema vinculó detección de sensor a parada 11:18 · PN-02-01 Falla mantto' },
  { id: 'AUD-0815-08', ordenId: 'ORD-0815', fecha: iso(HOY, '12:52'), usuario: 'María Torres', usuarioIniciales: 'MT', tipo: 'merma', texto: 'María Torres clasificó merma PT 1,8 kg · MP-02-01 Cambio de bobina · balde BLD-2026-0418' },
  { id: 'AUD-0815-09', ordenId: 'ORD-0815', fecha: iso(HOY, '14:00'), usuario: 'Luis Vargas', usuarioIniciales: 'LV', tipo: 'sistema', texto: 'Luis Vargas finalizó la orden con 86 240 unidades (conteo codificadora 84 601)' },
  { id: 'AUD-0815-10', ordenId: 'ORD-0815', fecha: iso(HOY, '14:04'), usuario: 'Sistema', usuarioIniciales: 'SY', tipo: 'sistema', texto: 'Sistema calculó OEE 81,3 % (D 92,0 · P 90,1 · C 98,1) y marcó la orden Por validar' },
];

function bitacoraGenerica(orden: OrdenFabricacion): AuditEvent[] {
  const base: AuditEvent[] = [
    { id: `AUD-${orden.id}-01`, ordenId: orden.id, fecha: orden.inicio, usuario: 'Ana Ríos', usuarioIniciales: 'AR', tipo: 'creacion', texto: `Ana Ríos creó la orden ${orden.codigo}` },
    { id: `AUD-${orden.id}-02`, ordenId: orden.id, fecha: orden.inicio, usuario: 'Sistema', usuarioIniciales: 'SY', tipo: 'sistema', texto: `Inicio de producción · ${orden.planificado.toLocaleString('es-PE')} unidades planificadas` },
  ];
  if (orden.fin) {
    base.push({
      id: `AUD-${orden.id}-03`,
      ordenId: orden.id,
      fecha: orden.fin,
      usuario: 'Sistema',
      usuarioIniciales: 'SY',
      tipo: 'sistema',
      texto: `Cierre de orden con ${orden.producido.toLocaleString('es-PE')} unidades · OEE ${String(orden.oee.oee).replace('.', ',')} %`,
    });
  }
  if (orden.estado === 'validada') {
    base.push({
      id: `AUD-${orden.id}-04`,
      ordenId: orden.id,
      fecha: orden.fin ?? orden.inicio,
      usuario: 'Carlos Mendoza',
      usuarioIniciales: 'CM',
      tipo: 'validacion',
      texto: 'Carlos Mendoza validó y cerró la orden',
    });
  }
  return base;
}

export const bitacora: AuditEvent[] = [
  ...bitacoraReferencia,
  ...ordenes.filter((o) => o.id !== 'ORD-0815').flatMap(bitacoraGenerica),
];
