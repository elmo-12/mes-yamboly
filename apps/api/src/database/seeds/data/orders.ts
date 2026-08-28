import type { AuditEvent, OrdenFabricacion, Turno } from '@mes/types';
import { lineas, productos } from './catalogs';
import { colaboradoresBase, maquinistaPorLinea, supervisorPorTurno } from './users';
import { HOY, fechaMas, fechaMenos, iso, pad4, redondear, rng } from './seed';

/**
 * 60 órdenes deterministas: OF-2026-0815 … OF-2026-0756.
 * La OF-2026-0815 reproduce literalmente la spec 05.C/D/E.
 */

/** Total histórico mostrado en el header y en la summary card "Todas" (spec 05.A). */
export const TOTAL_HISTORICO_ORDENES = 1248;

const TURNOS_ROT: Turno[] = ['M', 'T', 'N'];

/** OF-2026-0815 — orden de referencia de todas las pantallas. */
export const ORDEN_REFERENCIA: OrdenFabricacion = {
  id: 'ORD-0815',
  codigo: 'OF-2026-0815',
  fecha: HOY,
  lineaId: 'LIN-02',
  productoId: 'PRD-003',
  turno: 'M',
  lote: 'L-260828-02',
  vencimiento: fechaMas(184),
  planificado: 10000,
  producido: 9840,
  conteoCodificadora: 9653,
  velocidadEstandar: 120,
  estado: 'por_validar',
  maquinistaId: 'USR-02',
  supervisorId: 'USR-03',
  operarios: 6,
  colaboradores: colaboradoresBase,
  oee: { oee: 81.3, disponibilidad: 92.0, desempeno: 90.1, calidad: 98.1 },
  paradasCount: 4,
  mermasKg: 5.0,
  inicio: iso(HOY, '06:00'),
  fin: iso(HOY, '14:00'),
};

/** Órdenes del día de hoy (L5 queda sin orden, spec 03.A). */
const ordenesHoy: OrdenFabricacion[] = [
  ORDEN_REFERENCIA,
  {
    id: 'ORD-0814',
    codigo: 'OF-2026-0814',
    fecha: HOY,
    lineaId: 'LIN-01',
    productoId: 'PRD-001',
    turno: 'M',
    lote: 'L-260828-01',
    vencimiento: fechaMas(184),
    planificado: 8000,
    producido: 6120,
    conteoCodificadora: 6002,
    velocidadEstandar: 95,
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
    lineaId: 'LIN-03',
    productoId: 'PRD-005',
    turno: 'M',
    lote: 'L-260828-03',
    vencimiento: fechaMas(184),
    planificado: 7500,
    producido: 5980,
    conteoCodificadora: 5871,
    velocidadEstandar: 110,
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
    lineaId: 'LIN-04',
    productoId: 'PRD-007',
    turno: 'M',
    lote: 'L-260828-04',
    vencimiento: fechaMas(120),
    planificado: 5200,
    producido: 3410,
    conteoCodificadora: 3348,
    velocidadEstandar: 80,
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
    lineaId: 'LIN-PT',
    productoId: 'PRD-011',
    turno: 'M',
    lote: 'L-260828-PT',
    vencimiento: fechaMas(30),
    planificado: 4800,
    producido: 3960,
    conteoCodificadora: 3960,
    velocidadEstandar: 60,
    estado: 'en_curso',
    maquinistaId: 'USR-07',
    supervisorId: 'USR-03',
    operarios: 3,
    colaboradores: colaboradoresBase.slice(0, 3),
    oee: { oee: 84.6, disponibilidad: 96.2, desempeno: 90.4, calidad: 97.3 },
    paradasCount: 0,
    mermasKg: 0,
    inicio: iso(HOY, '06:00'),
    fin: null,
  },
];

/** Índices (0-based sobre las 55 órdenes históricas) marcados como "Por validar". */
const POR_VALIDAR = new Set([1, 4, 7, 9, 13, 16, 19, 22, 27, 31, 38]);
const INCOMPLETAS = new Set([6, 24, 41]);
/** Las 35 primeras órdenes históricas tienen paradas (2 + 35 = 37, spec 05.A). */
const CON_PARADAS = 35;
/** Las 20 primeras tienen mermas (1 + 20 = 21, spec 05.A). */
const CON_MERMAS = 20;

function generarHistoricas(): OrdenFabricacion[] {
  const r = rng(101);
  const out: OrdenFabricacion[] = [];
  const lineasProd = lineas.filter((l) => l.codigo !== 'PT-01');

  for (let dia = 1; dia <= 11; dia += 1) {
    for (let k = 0; k < 5; k += 1) {
      const j = (dia - 1) * 5 + k;
      const numero = 810 - j;
      const linea = lineasProd[k]!;
      const candidatos = productos.filter((p) => p.lineaId === linea.id);
      const producto = candidatos[j % candidatos.length]!;
      const turno = TURNOS_ROT[(dia + k) % 3]!;
      const fecha = fechaMenos(dia);
      const planificado = [8000, 10000, 7500, 5200, 9000][k]!;
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
      const horaInicio = turno === 'M' ? '06:00' : turno === 'T' ? '14:00' : '22:00';
      const horaFin = turno === 'M' ? '14:00' : turno === 'T' ? '22:00' : '06:00';

      out.push({
        id: `ORD-${pad4(numero)}`,
        codigo: `OF-2026-${pad4(numero)}`,
        fecha,
        lineaId: linea.id,
        productoId: producto.id,
        turno,
        lote: `L-${fecha.slice(2).replace(/-/g, '')}-0${k + 1}`,
        vencimiento: fechaMas(184 - dia, fecha),
        planificado,
        producido,
        conteoCodificadora,
        velocidadEstandar: producto.velocidadEstandar,
        estado,
        maquinistaId: maquinistaPorLinea[linea.id] ?? 'USR-07',
        supervisorId: supervisorPorTurno[turno] ?? 'USR-03',
        operarios: r.int(4, 7),
        colaboradores: colaboradoresBase.slice(0, r.int(3, 6)),
        oee: { oee, disponibilidad, desempeno, calidad },
        paradasCount,
        mermasKg: redondear(mermasKg),
        inicio: iso(fecha, horaInicio),
        fin: turno === 'N' ? iso(fechaMenos(dia - 1), horaFin) : iso(fecha, horaFin),
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
  { id: 'AUD-0815-01', ordenId: 'ORD-0815', fecha: iso(HOY, '05:58'), usuario: 'Ana Ríos', usuarioIniciales: 'AR', tipo: 'creacion', texto: 'Ana Ríos creó la orden OF-2026-0815 · Cono Vainilla 120 ml · 10 000 unidades' },
  { id: 'AUD-0815-02', ordenId: 'ORD-0815', fecha: iso(HOY, '06:00'), usuario: 'Jorge Quispe', usuarioIniciales: 'JQ', tipo: 'sistema', texto: 'Jorge Quispe inició la producción del turno Mañana' },
  { id: 'AUD-0815-03', ordenId: 'ORD-0815', fecha: iso(HOY, '07:42'), usuario: 'Jorge Quispe', usuarioIniciales: 'JQ', tipo: 'parada', texto: 'Jorge Quispe registró la parada 07:42 PL-03-02 CIP entre sabores (14 min)' },
  { id: 'AUD-0815-04', ordenId: 'ORD-0815', fecha: iso(HOY, '08:15'), usuario: 'Ana Ríos', usuarioIniciales: 'AR', tipo: 'edicion', texto: 'Ana Ríos editó la causa de la parada 07:42: PO-06 → PM-01' },
  { id: 'AUD-0815-05', ordenId: 'ORD-0815', fecha: iso(HOY, '09:10'), usuario: 'Jorge Quispe', usuarioIniciales: 'JQ', tipo: 'velocidad', texto: 'Jorge Quispe registró velocidad real 118 u/min (estándar 120 · −1,7 %)' },
  { id: 'AUD-0815-06', ordenId: 'ORD-0815', fecha: iso(HOY, '11:05'), usuario: 'Jorge Quispe', usuarioIniciales: 'JQ', tipo: 'merma', texto: 'Jorge Quispe registró merma EP 3,2 kg · MR-03 Arranque' },
  { id: 'AUD-0815-07', ordenId: 'ORD-0815', fecha: iso(HOY, '11:27'), usuario: 'Sistema', usuarioIniciales: 'SY', tipo: 'sistema', texto: 'Sistema vinculó detección de sensor a parada 11:18 · PM-01-03 Rotura de cadena' },
  { id: 'AUD-0815-08', ordenId: 'ORD-0815', fecha: iso(HOY, '12:52'), usuario: 'María Torres', usuarioIniciales: 'MT', tipo: 'merma', texto: 'María Torres clasificó merma PT 1,8 kg · MR-01 Sobrepeso · balde BLD-2026-0418' },
  { id: 'AUD-0815-09', ordenId: 'ORD-0815', fecha: iso(HOY, '14:00'), usuario: 'Jorge Quispe', usuarioIniciales: 'JQ', tipo: 'sistema', texto: 'Jorge Quispe finalizó la orden con 9 840 unidades (conteo codificadora 9 653)' },
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
