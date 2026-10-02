import type { LineaEstado, SensoresLinea } from '@mes/types';
import { detecciones } from './downtimes';
import { HOY } from './seed';

/**
 * Estado de tiempo real congelado (spec 03.A) sobre las 9 líneas reales, a las
 * 14:05 del turno Día: Llenadora A1 en Alerta 78 % · Extrusora 2 con detección
 * sugerida · Moldeadora A3 en Parada PN-02 18 min · Llenadora A2 Sin orden ·
 * el resto Produciendo.
 */

const deteccionExtr2 = detecciones.find((d) => d.id === 'IOT-EXTR2-01');

/**
 * Sensores IoT simulados (paridad con `SensoresIotService` de la API cuando
 * `IOT_API_URL`/`IOT_API_KEY` están definidas): las tres lineales del IoT con
 * sensores asignados. Ids de sensor inventados; el resto de líneas, sin sensores.
 */
function sensoresMock(
  lineal: string,
  ids: string[],
  caidos: string[] = [],
  estado: SensoresLinea['estado'] = 'ok',
): SensoresLinea {
  const sensores = ids.map((id) => ({ id, enLinea: !caidos.includes(id) }));
  return {
    lineal,
    consultado: true,
    total: sensores.length,
    enLinea: sensores.filter((x) => x.enLinea).length,
    sensores,
    estado,
    ultimaLectura: `${HOY}T14:04:55`,
  };
}

export const lineaEstadosBase: LineaEstado[] = [
  {
    lineaId: 'LIN-EXTR-2',
    lineaCodigo: 'EXTR-2',
    lineaNombre: 'Extrusora 2',
    estado: 'sugerida',
    orden: { id: 'ORD-0811', codigo: 'OF-2026-0811', productoNombre: 'BOMBOM VAINILLA 30X54ML', turno: 'D' },
    producido: 165400,
    plan: 242000,
    velocidad: 0,
    velocidadEstandar: 366.7,
    tiempoEnEstadoMin: 3,
    maquinistaNombre: 'Jorge Quispe',
    deteccion: deteccionExtr2,
  },
  {
    lineaId: 'LIN-EXTR-3',
    lineaCodigo: 'EXTR-3',
    lineaNombre: 'Extrusora 3',
    estado: 'produciendo',
    orden: { id: 'ORD-0810', codigo: 'OF-2026-0810', productoNombre: 'SANDWICH VAI-LUC 30X67ML', turno: 'D' },
    producido: 114800,
    plan: 168000,
    velocidad: 248,
    velocidadEstandar: 255,
    tiempoEnEstadoMin: 214,
    maquinistaNombre: 'Elena Ramos',
    /* Una de las dos salidas sin señal: el conteo sigue con la otra. */
    sensores: sensoresMock('EXTRUSORA 3', ['SIM_I', 'SIM_J'], ['SIM_J']),
    fuenteProduccion: 'sensores',
    fuenteVelocidad: 'sensores',
  },
  {
    lineaId: 'LIN-LLEN-A1',
    lineaCodigo: 'LLEN-A1',
    lineaNombre: 'Llenadora A1',
    estado: 'alerta',
    orden: { id: 'ORD-0815', codigo: 'OF-2026-0815', productoNombre: 'CORNELLO VAI 12X120ML', turno: 'D' },
    producido: 86240,
    plan: 88000,
    velocidad: 131,
    velocidadEstandar: 133.3,
    tiempoEnEstadoMin: 12,
    maquinistaNombre: 'Luis Vargas',
    ultimaParada: {
      causaCodigo: 'PN-04-14',
      causaNombre: 'Sin Stock en almacén',
      inicio: '2026-08-28T12:40:00',
      duracionMin: 12,
      enCurso: false,
    },
    alerta: {
      id: 'ALE-001',
      tipo: 'parada_prevista',
      riesgo: 78,
      texto: 'Riesgo de parada en 40 min',
      generadaEn: `${HOY}T14:40:00`,
    },
  },
  {
    lineaId: 'LIN-LLEN-A2',
    lineaCodigo: 'LLEN-A2',
    lineaNombre: 'Llenadora A2',
    estado: 'sin_orden',
    producido: 0,
    plan: 0,
    velocidad: 0,
    velocidadEstandar: 320,
    tiempoEnEstadoMin: 46,
    maquinistaNombre: 'Sofía Cárdenas',
  },
  {
    lineaId: 'LIN-LLEN-M1',
    lineaCodigo: 'LLEN-M1',
    lineaNombre: 'Llenadora M1',
    estado: 'produciendo',
    orden: { id: 'ORD-0813', codigo: 'OF-2026-0813', productoNombre: 'CUB-YAM-COCO CHIPS 1X5L', turno: 'D' },
    producido: 5480,
    plan: 8100,
    velocidad: 11.8,
    velocidadEstandar: 12.3,
    tiempoEnEstadoMin: 127,
    maquinistaNombre: 'Sofía Cárdenas',
  },
  {
    lineaId: 'LIN-LLEN-M2',
    lineaCodigo: 'LLEN-M2',
    lineaNombre: 'Llenadora M2',
    estado: 'produciendo',
    orden: { id: 'ORD-0814', codigo: 'OF-2026-0814', productoNombre: 'CUB-YAM-CAPUCCINO 1X5L', turno: 'D' },
    producido: 3620,
    plan: 5300,
    velocidad: 7.5,
    velocidadEstandar: 8,
    tiempoEnEstadoMin: 127,
    maquinistaNombre: 'Luis Vargas',
    alerta: {
      id: 'ALE-003',
      tipo: 'velocidad_baja',
      riesgo: 42,
      texto: 'Velocidad 6 % bajo estándar',
      generadaEn: `${HOY}T13:20:00`,
    },
  },
  {
    lineaId: 'LIN-MOLD-A2',
    lineaCodigo: 'MOLD-A2',
    lineaNombre: 'Moldeadora A2',
    estado: 'produciendo',
    orden: { id: 'ORD-0809', codigo: 'OF-2026-0809', productoNombre: 'YAMBITO VAI-LUC 40X54ML', turno: 'D' },
    producido: 133600,
    plan: 198000,
    velocidad: 292,
    velocidadEstandar: 300,
    tiempoEnEstadoMin: 198,
    maquinistaNombre: 'Pedro Ccahuana',
    sensores: sensoresMock('MOLDEADORA A2', ['SIM_C', 'SIM_D'], [], 'parcial'),
    fuenteProduccion: 'sensores',
    fuenteVelocidad: 'sensores',
  },
  {
    lineaId: 'LIN-MOLD-A3',
    lineaCodigo: 'MOLD-A3',
    lineaNombre: 'Moldeadora A3',
    estado: 'parada',
    orden: { id: 'ORD-0812', codigo: 'OF-2026-0812', productoNombre: 'YAMBITO VAI-LUC 40X54ML', turno: 'D' },
    producido: 148200,
    plan: 231000,
    velocidad: 0,
    velocidadEstandar: 350,
    tiempoEnEstadoMin: 18,
    maquinistaNombre: 'Pedro Ccahuana',
    /* En parada: los sensores miden 0 u/min, que es lo que hace la máquina. */
    sensores: sensoresMock('MOLDEADORA A3', ['SIM_E', 'SIM_F', 'SIM_G']),
    fuenteProduccion: 'sensores',
    fuenteVelocidad: 'sensores',
    ultimaParada: {
      causaCodigo: 'PN-02',
      causaNombre: 'Paro por fallas',
      inicio: '2026-08-28T13:47:00',
      duracionMin: 18,
      enCurso: true,
    },
    alerta: {
      id: 'ALE-002',
      tipo: 'parada_prevista',
      riesgo: 91,
      texto: 'En parada 18 min · PN-02 Paro por fallas',
      generadaEn: `${HOY}T13:47:00`,
    },
  },
  {
    lineaId: 'LIN-MOLD-A4',
    lineaCodigo: 'MOLD-A4',
    lineaNombre: 'Moldeadora A4',
    estado: 'produciendo',
    orden: { id: 'ORD-0808', codigo: 'OF-2026-0808', productoNombre: 'MAXI GOLD VAI LUC 36X78ML', turno: 'D' },
    producido: 208500,
    plan: 302000,
    velocidad: 451,
    velocidadEstandar: 458.3,
    tiempoEnEstadoMin: 214,
    maquinistaNombre: 'Elena Ramos',
  },
];

export const TURNO_ACTUAL = 'D' as const;
export const TURNO_ACTUAL_LABEL = 'Día';
export const TURNO_ACTUAL_RANGO = '06:00–18:00';
