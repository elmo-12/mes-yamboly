import type { Alerta, EstadoAlerta, SeveridadAlerta, TipoAlerta, Umbrales } from '@mes/types';
import { HOY, fechaMenos, iso, pad4, rng } from './seed';

/**
 * 24 alertas deterministas (spec 07). Composición: 6 activas · 9 atendidas hoy ·
 * 2 vencidas · 7 confirmadas; 4 quedan pendientes de confirmar (acierto = null).
 */

interface AlertaSemilla {
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  maquinaId?: string;
  maquinaNombre?: string;
  prediccion: string;
  probabilidad: number;
  estado: EstadoAlerta;
  acierto: boolean | null;
  ventana: [string, string];
  dias: number;
  factores: { texto: string; contribucion: number }[];
  accionTomada?: string;
  observacion?: string;
}

const SEMILLAS: AlertaSemilla[] = [
  {
    tipo: 'parada_prevista', severidad: 'alta', lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1',
    maquinaId: 'MAQ-10', maquinaNombre: 'Tapadora LLEN A1',
    prediccion: 'Parada PN-02 en LLEN-A1 en 40 min', probabilidad: 78, estado: 'activa', acierto: null,
    ventana: ['14:40', '15:20'], dias: 0,
    factores: [
      { texto: 'Tapadora LLEN A1 con 3 paradas PN-02 en 7 días', contribucion: 42 },
      { texto: 'Velocidad −6 % en la última hora', contribucion: 33 },
      { texto: 'Cambio de producto hace 25 min', contribucion: 25 },
    ],
  },
  {
    tipo: 'parada_prevista', severidad: 'critica', lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3',
    maquinaId: 'MAQ-28', maquinaNombre: 'Pinzas extractoras MOLD A3',
    prediccion: 'Parada PN-02 en curso en MOLD-A3 · riesgo de superar 30 min', probabilidad: 91, estado: 'activa', acierto: null,
    ventana: ['13:47', '14:30'], dias: 0,
    factores: [
      { texto: 'Parada activa PN-02 desde las 13:47', contribucion: 55 },
      { texto: 'Pinzas extractoras con 9 paradas en 30 días', contribucion: 28 },
      { texto: 'Sin repuesto de pinzas en almacén', contribucion: 17 },
    ],
  },
  {
    tipo: 'velocidad_baja', severidad: 'media', lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2',
    maquinaId: 'MAQ-19', maquinaNombre: 'Dosificadora LLEN M2',
    prediccion: 'Velocidad 6 % bajo estándar en LLEN-M2', probabilidad: 72, estado: 'activa', acierto: null,
    ventana: ['13:20', '15:00'], dias: 0,
    factores: [
      { texto: 'Velocidad media 47 u/min frente a 50 estándar', contribucion: 48 },
      { texto: 'Mezcla base por debajo de temperatura objetivo', contribucion: 31 },
      { texto: 'Operario en su primera semana en la línea', contribucion: 21 },
    ],
  },
  {
    tipo: 'merma_prevista', severidad: 'alta', lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2',
    prediccion: 'Merma EP por encima de 2,5 % en EXTR-2 en el turno Noche', probabilidad: 74, estado: 'activa', acierto: null,
    ventana: ['14:00', '18:00'], dias: 0,
    factores: [
      { texto: 'Arranques con sabor Lucuma elevan la merma EP 1,8 pp', contribucion: 45 },
      { texto: 'Envolvedora EXTR 2 con microparadas recurrentes', contribucion: 32 },
      { texto: 'Merma acumulada del día 2,1 %', contribucion: 23 },
    ],
  },
  {
    tipo: 'oee_bajo', severidad: 'alta', lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3',
    prediccion: 'OEE del turno bajo 75 % en MOLD-A3', probabilidad: 83, estado: 'activa', acierto: null,
    ventana: ['14:00', '22:00'], dias: 0,
    factores: [
      { texto: 'Disponibilidad 82,3 % acumulada', contribucion: 51 },
      { texto: 'Dos paradas PN-02 en el turno anterior', contribucion: 29 },
      { texto: 'Desempeño por debajo del estándar de la línea', contribucion: 20 },
    ],
  },
  {
    tipo: 'parada_prevista', severidad: 'media', lineaId: 'LIN-MOLD-A4', lineaCodigo: 'MOLD-A4', lineaNombre: 'Moldeadora A4',
    maquinaId: 'MAQ-30', maquinaNombre: 'Moldeadora MOLD A4',
    prediccion: 'Parada PN-04 por falta de insumo en MOLD-A4', probabilidad: 70, estado: 'activa', acierto: null,
    ventana: ['15:30', '16:30'], dias: 0,
    factores: [
      { texto: 'Stock de bobina para 55 min de producción', contribucion: 47 },
      { texto: 'Dos eventos PN-04-14 en los últimos 7 días', contribucion: 30 },
      { texto: 'Sin orden de reposición registrada', contribucion: 23 },
    ],
  },
  /* Atendidas hoy (9) --------------------------------------------- */
  {
    tipo: 'parada_prevista', severidad: 'alta', lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1',
    maquinaId: 'MAQ-10', maquinaNombre: 'Tapadora LLEN A1',
    prediccion: 'Parada PN-02 en LLEN-A1 antes de las 11:30', probabilidad: 81, estado: 'atendida', acierto: true,
    ventana: ['11:00', '11:40'], dias: 0,
    factores: [
      { texto: 'Vibración del cabezal de tapado por encima del umbral', contribucion: 52 },
      { texto: 'Tapadora con 6 paradas en 30 días', contribucion: 29 },
      { texto: 'Velocidad descendente en los últimos 20 min', contribucion: 19 },
    ],
    accionTomada: 'Se detuvo la línea de forma preventiva y se cambió el retén de la tapadora',
    observacion: 'La parada ocurrió a las 11:18 tal como se predijo',
  },
  {
    tipo: 'velocidad_baja', severidad: 'media', lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2',
    prediccion: 'Velocidad 8 % bajo estándar en EXTR-2', probabilidad: 75, estado: 'atendida', acierto: true,
    ventana: ['09:00', '10:00'], dias: 0,
    factores: [
      { texto: 'Extrusora por debajo del set point', contribucion: 46 },
      { texto: 'Ajuste de sellado en curso', contribucion: 33 },
      { texto: 'Mezcla fría en tolva', contribucion: 21 },
    ],
    accionTomada: 'Se recalibró la extrusora y se elevó la temperatura de la mezcla',
  },
  {
    tipo: 'merma_prevista', severidad: 'media', lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2',
    prediccion: 'Merma PT por desvío del proceso sobre 1,5 % en LLEN-M2', probabilidad: 71, estado: 'atendida', acierto: false,
    ventana: ['08:00', '11:00'], dias: 0,
    factores: [
      { texto: 'Peso medio 2 g por encima del objetivo', contribucion: 49 },
      { texto: 'Balanza sin calibrar desde hace 9 días', contribucion: 30 },
      { texto: 'Cambio de formato reciente', contribucion: 21 },
    ],
    accionTomada: 'Se recalibró la balanza al inicio del turno',
    observacion: 'La merma se mantuvo en 1,1 %; no se materializó el evento',
  },
  {
    tipo: 'oee_bajo', severidad: 'media', lineaId: 'LIN-MOLD-A4', lineaCodigo: 'MOLD-A4', lineaNombre: 'Moldeadora A4',
    prediccion: 'OEE bajo 75 % en MOLD-A4 en el turno Día', probabilidad: 73, estado: 'atendida', acierto: null,
    ventana: ['06:00', '14:00'], dias: 0,
    factores: [
      { texto: 'Desempeño 82 % en el turno anterior', contribucion: 44 },
      { texto: 'Envolvedora MOLD A4 con microparadas recurrentes', contribucion: 34 },
      { texto: 'Dotación incompleta al inicio del turno', contribucion: 22 },
    ],
    accionTomada: 'Se reasignó un operario desde la Llenadora M2 para cubrir el puesto',
  },
  {
    tipo: 'parada_prevista', severidad: 'media', lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2',
    maquinaId: 'MAQ-22', maquinaNombre: 'Faja transportadora LLEN M2',
    prediccion: 'Parada PN-04 por desviación de calibración en LLEN-M2', probabilidad: 70, estado: 'atendida', acierto: null,
    ventana: ['07:30', '08:30'], dias: 0,
    factores: [
      { texto: 'Temperatura de la faja de descarga 2 °C sobre el objetivo', contribucion: 51 },
      { texto: 'Puerta de cámara abierta más de 4 min', contribucion: 27 },
      { texto: 'Compresor con arranques frecuentes', contribucion: 22 },
    ],
    accionTomada: 'Se ajustó el set point y se cerró el ciclo de puertas',
  },
  {
    tipo: 'velocidad_baja', severidad: 'media', lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3',
    prediccion: 'Velocidad 7 % bajo estándar en MOLD-A3', probabilidad: 76, estado: 'atendida', acierto: true,
    ventana: ['09:30', '11:00'], dias: 0,
    factores: [
      { texto: 'Moldeadora MOLD A3 con ciclo lento', contribucion: 45 },
      { texto: 'Ajuste de sellado pendiente', contribucion: 32 },
      { texto: 'Merma de producto en molde elevada', contribucion: 23 },
    ],
    accionTomada: 'Se ajustó el ciclo de la moldeadora',
  },
  {
    tipo: 'merma_prevista', severidad: 'alta', lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1',
    prediccion: 'Merma EP sobre 3 kg en el arranque de LLEN-A1', probabilidad: 79, estado: 'atendida', acierto: true,
    ventana: ['06:00', '07:30'], dias: 0,
    factores: [
      { texto: 'Arranques de LLEN-A1 generan 3,1 kg de media', contribucion: 48 },
      { texto: 'Cambio de sabor programado', contribucion: 31 },
      { texto: 'Limpieza por cambio de sabor prevista a las 07:42', contribucion: 21 },
    ],
    accionTomada: 'Se recuperó la mezcla del arranque en balde para pasteurización',
  },
  {
    tipo: 'parada_prevista', severidad: 'alta', lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2',
    maquinaId: 'MAQ-04', maquinaNombre: 'Túnel de frío EXTR 2',
    prediccion: 'Parada PN-02 por falla de mantto en EXTR-2', probabilidad: 84, estado: 'atendida', acierto: true,
    ventana: ['10:00', '11:00'], dias: 0,
    factores: [
      { texto: 'Extrusora en mantenimiento correctivo', contribucion: 53 },
      { texto: 'Alarmas de sobrecorriente repetidas', contribucion: 28 },
      { texto: 'Histórico de 12 paradas en 30 días', contribucion: 19 },
    ],
    accionTomada: 'Mantenimiento cambió el rodamiento y dejó la máquina en observación',
  },
  {
    tipo: 'oee_bajo', severidad: 'media', lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2',
    prediccion: 'OEE bajo 75 % en EXTR-2 en el turno Día', probabilidad: 72, estado: 'atendida', acierto: false,
    ventana: ['06:00', '14:00'], dias: 0,
    factores: [
      { texto: 'Disponibilidad afectada por mantenimiento', contribucion: 47 },
      { texto: 'Desempeño 85 % acumulado', contribucion: 30 },
      { texto: 'Dos cambios de sabor programados', contribucion: 23 },
    ],
    accionTomada: 'Se reprogramó el segundo cambio de sabor al turno Noche',
    observacion: 'El OEE cerró en 74,2 %, por debajo del umbral pero dentro de lo previsto',
  },
  /* Vencidas (2) --------------------------------------------------- */
  {
    tipo: 'parada_prevista', severidad: 'alta', lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1',
    maquinaId: 'MAQ-08', maquinaNombre: 'Llenadora LLEN A1',
    prediccion: 'Parada PN-02 por falla operacional en LLEN-A1', probabilidad: 77, estado: 'vencida', acierto: null,
    ventana: ['12:00', '13:00'], dias: 0,
    factores: [
      { texto: 'Presión de dosificación por encima del rango', contribucion: 46 },
      { texto: 'Sin purga desde el arranque', contribucion: 32 },
      { texto: 'Cambio de sabor pendiente', contribucion: 22 },
    ],
  },
  {
    tipo: 'merma_prevista', severidad: 'media', lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3',
    prediccion: 'Merma PT por desvío del proceso sobre 2 kg en MOLD-A3', probabilidad: 71, estado: 'vencida', acierto: null,
    ventana: ['10:30', '12:00'], dias: 0,
    factores: [
      { texto: 'Producto con temperatura fuera de rango', contribucion: 49 },
      { texto: 'Pinzas extractoras con desalineación', contribucion: 30 },
      { texto: 'Histórico de rotura elevado los viernes', contribucion: 21 },
    ],
  },
];

/** Alertas confirmadas de días anteriores (7) — alimentan el histórico de EP. */
function generarConfirmadas(): AlertaSemilla[] {
  const r = rng(505);
  const lineasRef = [
    { lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2' },
    { lineaId: 'LIN-EXTR-3', lineaCodigo: 'EXTR-3', lineaNombre: 'Extrusora 3' },
    { lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1' },
    { lineaId: 'LIN-LLEN-A2', lineaCodigo: 'LLEN-A2', lineaNombre: 'Llenadora A2' },
    { lineaId: 'LIN-LLEN-M1', lineaCodigo: 'LLEN-M1', lineaNombre: 'Llenadora M1' },
    { lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2' },
    { lineaId: 'LIN-MOLD-A2', lineaCodigo: 'MOLD-A2', lineaNombre: 'Moldeadora A2' },
    { lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3' },
    { lineaId: 'LIN-MOLD-A4', lineaCodigo: 'MOLD-A4', lineaNombre: 'Moldeadora A4' },
  ];
  const tipos: TipoAlerta[] = ['parada_prevista', 'merma_prevista', 'velocidad_baja', 'oee_bajo'];
  const textos: Record<TipoAlerta, string> = {
    parada_prevista: 'Parada PN-02 prevista',
    merma_prevista: 'Merma EP por encima del umbral',
    velocidad_baja: 'Velocidad por debajo del estándar',
    oee_bajo: 'OEE del turno bajo el umbral',
  };
  const aciertos = [true, true, false, true, true, true, false];

  return aciertos.map((acierto, i) => {
    const linea = lineasRef[i % lineasRef.length]!;
    const tipo = tipos[i % tipos.length]!;
    return {
      tipo,
      severidad: (['alta', 'media', 'critica'] as SeveridadAlerta[])[i % 3]!,
      lineaId: linea.lineaId,
      lineaCodigo: linea.lineaCodigo,
      lineaNombre: linea.lineaNombre,
      prediccion: `${textos[tipo]} en ${linea.lineaCodigo} ${linea.lineaNombre}`,
      probabilidad: r.int(70, 93),
      estado: 'confirmada' as EstadoAlerta,
      acierto,
      ventana: ['09:00', '12:00'] as [string, string],
      dias: i + 1,
      factores: [
        { texto: `Histórico de eventos en ${linea.lineaCodigo} en los últimos 7 días`, contribucion: r.int(40, 55) },
        { texto: 'Desviación de velocidad sostenida', contribucion: r.int(25, 35) },
        { texto: 'Cambio de producto reciente', contribucion: r.int(15, 25) },
      ],
      accionTomada: 'Se aplicó la acción preventiva indicada por el supervisor',
      observacion: acierto ? 'El evento ocurrió dentro de la ventana prevista' : 'El evento no se materializó',
    };
  });
}

function construir(semillas: AlertaSemilla[]): Alerta[] {
  return semillas.map((s, i) => {
    const fecha = s.dias === 0 ? HOY : fechaMenos(s.dias);
    return {
      id: `ALE-${pad4(i + 1).slice(1)}`,
      tipo: s.tipo,
      severidad: s.severidad,
      lineaId: s.lineaId,
      lineaCodigo: s.lineaCodigo,
      lineaNombre: s.lineaNombre,
      maquinaId: s.maquinaId,
      maquinaNombre: s.maquinaNombre,
      prediccion: s.prediccion,
      probabilidad: s.probabilidad,
      ventanaInicio: iso(fecha, s.ventana[0]),
      ventanaFin: iso(fecha, s.ventana[1]),
      estado: s.estado,
      acierto: s.acierto,
      factores: s.factores,
      accionTomada: s.accionTomada,
      observacion: s.observacion,
      generadaEn: iso(fecha, s.ventana[0]),
      atendidaPor: s.accionTomada ? 'Ana Ríos' : undefined,
      atendidaEn: s.accionTomada ? iso(fecha, s.ventana[1]) : undefined,
    };
  });
}

export const alertas: Alerta[] = construir([...SEMILLAS, ...generarConfirmadas()]);

export const umbralesIniciales: Umbrales = {
  velocidadBajoEstandarPct: 5,
  oeeMinimo: 75,
  probabilidadMinima: 70,
  notificarN8n: true,
  mostrarTv: true,
  actualizadoEn: iso(fechaMenos(3), '09:14'),
  actualizadoPor: 'Carlos Mendoza',
};
