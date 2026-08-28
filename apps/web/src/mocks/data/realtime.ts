import type { LineaEstado } from '@mes/types';
import { detecciones } from './downtimes';

/**
 * Estado de tiempo real congelado según la spec 03.A:
 * L1 Produciendo · L2 Alerta 78 % · L3 Sugerida · L4 Parada PM-01 18 min ·
 * L5 Sin orden · PT-01 Produciendo.
 */

const deteccionL3 = detecciones.find((d) => d.id === 'IOT-L3-01');

export const lineaEstadosBase: LineaEstado[] = [
  {
    lineaId: 'LIN-01',
    lineaCodigo: 'L1',
    lineaNombre: 'Paletas',
    estado: 'produciendo',
    orden: { id: 'ORD-0814', codigo: 'OF-2026-0814', productoNombre: 'Paleta Chocolate', turno: 'M' },
    producido: 6120,
    plan: 8000,
    velocidad: 89,
    velocidadEstandar: 95,
    tiempoEnEstadoMin: 127,
    maquinistaNombre: 'Luis Vargas',
    alerta: { id: 'ALE-003', riesgo: 42, texto: 'Velocidad 6 % bajo estándar' },
  },
  {
    lineaId: 'LIN-02',
    lineaCodigo: 'L2',
    lineaNombre: 'Conos',
    estado: 'alerta',
    orden: { id: 'ORD-0815', codigo: 'OF-2026-0815', productoNombre: 'Cono Vainilla 120 ml', turno: 'M' },
    producido: 9840,
    plan: 10000,
    velocidad: 118,
    velocidadEstandar: 120,
    tiempoEnEstadoMin: 12,
    maquinistaNombre: 'Jorge Quispe',
    ultimaParada: {
      causaCodigo: 'PA-05-03',
      causaNombre: 'Falta de bobina',
      inicio: '2026-08-28T12:40:00',
      duracionMin: 12,
      enCurso: false,
    },
    alerta: { id: 'ALE-001', riesgo: 78, texto: 'Riesgo de parada en 40 min' },
  },
  {
    lineaId: 'LIN-03',
    lineaCodigo: 'L3',
    lineaNombre: 'Vasos',
    estado: 'sugerida',
    orden: { id: 'ORD-0813', codigo: 'OF-2026-0813', productoNombre: 'Vaso Lúcuma', turno: 'M' },
    producido: 5980,
    plan: 7500,
    velocidad: 0,
    velocidadEstandar: 110,
    tiempoEnEstadoMin: 3,
    maquinistaNombre: 'Sofía Cárdenas',
    deteccion: deteccionL3,
  },
  {
    lineaId: 'LIN-04',
    lineaCodigo: 'L4',
    lineaNombre: 'Sándwich',
    estado: 'parada',
    orden: { id: 'ORD-0812', codigo: 'OF-2026-0812', productoNombre: 'Sándwich Clásico', turno: 'M' },
    producido: 3410,
    plan: 5200,
    velocidad: 0,
    velocidadEstandar: 80,
    tiempoEnEstadoMin: 18,
    maquinistaNombre: 'Pedro Ccahuana',
    ultimaParada: {
      causaCodigo: 'PM-01',
      causaNombre: 'Falla mecánica',
      inicio: '2026-08-28T13:47:00',
      duracionMin: 18,
      enCurso: true,
    },
    alerta: { id: 'ALE-002', riesgo: 91, texto: 'En parada 18 min · PM-01 Falla mecánica' },
  },
  {
    lineaId: 'LIN-05',
    lineaCodigo: 'L5',
    lineaNombre: 'Bombones',
    estado: 'sin_orden',
    producido: 0,
    plan: 0,
    velocidad: 0,
    velocidadEstandar: 140,
    tiempoEnEstadoMin: 46,
    maquinistaNombre: 'Elena Ramos',
  },
  {
    lineaId: 'LIN-PT',
    lineaCodigo: 'PT-01',
    lineaNombre: 'Pasteurizador',
    estado: 'produciendo',
    orden: { id: 'ORD-0811', codigo: 'OF-2026-0811', productoNombre: 'Mezcla base pasteurizada', turno: 'M' },
    producido: 3960,
    plan: 4800,
    velocidad: 58,
    velocidadEstandar: 60,
    tiempoEnEstadoMin: 214,
    maquinistaNombre: 'Luis Vargas',
  },
];

export const TURNO_ACTUAL = 'M' as const;
export const TURNO_ACTUAL_LABEL = 'Mañana';
export const TURNO_ACTUAL_RANGO = '06:00–14:00';
