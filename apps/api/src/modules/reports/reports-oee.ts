/**
 * OEE de una ventana de fechas calculado sobre las tablas transaccionales.
 *
 * Las tablas pre-agregadas de Reportes (`indicador_linea`, `indicador_turno`,
 * `indicador_kpi`) son una **foto sin ventana temporal**: se regeneran enteras
 * en cada siembra o sincronización y no saben de periodos. Servirlas tal cual
 * hacía que «OEE por línea — turno actual» del Home mostrara las 9 líneas del
 * mes aunque hoy sólo estén produciendo 4, y que el selector de periodo de
 * `/reportes` no cambiara nada salvo la tendencia diaria.
 *
 * Este módulo recorre `orden_fabricacion` y `parada` una sola vez y agrega por
 * línea, por turno y en total, para la ventana pedida. La fórmula es la misma
 * `computeOee` del paquete compartido, así que los números siguen cuadrando con
 * el resto de la aplicación.
 */
import { computeOee, finDeTurno } from '@mes/shared';
import type { OeeDetalle, Turno } from '@mes/types';
import { ahoraIso } from '../../common/utils';
import type { OrdenFabricacion, Parada } from '../../database/entities';

/** Magnitudes crudas que alimentan `computeOee`. */
export interface Acumulado {
  tiempoPlanificadoMin: number;
  paradasMin: number;
  unidadesProducidas: number;
  unidadesBuenas: number;
  /** Velocidad estándar ponderada por minutos; se divide al calcular. */
  velocidadPonderada: number;
  /** Nº de órdenes que aportaron, para descartar líneas sin actividad. */
  ordenes: number;
}

export interface AgregadoVentana {
  porLinea: Map<string, Acumulado>;
  porTurno: Map<Turno, Acumulado>;
  /** Clave `YYYY-MM-DD`, para la tendencia diaria. */
  porFecha: Map<string, Acumulado>;
  total: Acumulado;
}

export function nuevoAcumulado(): Acumulado {
  return {
    tiempoPlanificadoMin: 0,
    paradasMin: 0,
    unidadesProducidas: 0,
    unidadesBuenas: 0,
    velocidadPonderada: 0,
    ordenes: 0,
  };
}

export function velocidadMedia(a: Acumulado): number {
  return a.tiempoPlanificadoMin > 0 ? a.velocidadPonderada / a.tiempoPlanificadoMin : 0;
}

export function oeeDe(a: Acumulado): OeeDetalle {
  return computeOee({
    tiempoPlanificadoMin: a.tiempoPlanificadoMin,
    paradasMin: a.paradasMin,
    unidadesProducidas: a.unidadesProducidas,
    unidadesBuenas: a.unidadesBuenas,
    velocidadEstandar: velocidadMedia(a),
  });
}

function minutosEntre(desde: string, hasta: string): number {
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60_000);
}

function tomar<K>(mapa: Map<K, Acumulado>, clave: K): Acumulado {
  let valor = mapa.get(clave);
  if (!valor) {
    valor = nuevoAcumulado();
    mapa.set(clave, valor);
  }
  return valor;
}

function sumar(destino: Acumulado, minutos: number, paradasMin: number, orden: OrdenFabricacion): void {
  destino.tiempoPlanificadoMin += minutos;
  destino.paradasMin += paradasMin;
  destino.unidadesProducidas += orden.producido;
  /* La calidad de la orden la publica el sistema de planta; se traduce a
   * unidades buenas para que `computeOee` reproduzca ese mismo porcentaje. */
  destino.unidadesBuenas += Math.round(orden.producido * ((orden.oee?.calidad ?? 100) / 100));
  destino.velocidadPonderada += orden.velocidadEstandar * minutos;
  destino.ordenes += 1;
}

/**
 * Fin efectivo de una orden: su cierre real o, si sigue abierta, lo que haya
 * ocurrido antes entre «ahora» y el cierre de su turno. El tope por turno evita
 * que una orden que nadie cerró sume días enteros de tiempo planificado.
 */
export function finEfectivo(orden: OrdenFabricacion, ahora: string): string {
  if (orden.fin) return orden.fin;
  const cierre = finDeTurno(orden.fecha, orden.turno);
  return ahora < cierre ? ahora : cierre;
}

export interface OpcionesVentana {
  desde: string;
  hasta: string;
  /** Vacío = todas. */
  lineaIds?: readonly string[];
  /** Vacío = todos. */
  turnos?: readonly Turno[];
  /** Instante hasta el que cuenta una orden todavía abierta. */
  ahora?: string;
}

/**
 * Agrega las órdenes de la ventana. Una orden abierta cuenta hasta `ahora`,
 * que es lo que hace que el Home muestre el turno en curso y no un turno
 * completo de 12 h que aún no ha terminado.
 */
export function agregarVentana(
  ordenes: readonly OrdenFabricacion[],
  paradas: readonly Parada[],
  opciones: OpcionesVentana,
): AgregadoVentana {
  /* Hora local, como el resto de marcas de tiempo de la aplicación: con
   * `toISOString()` (UTC) una orden abierta sumaba 5 horas de más en Lima. */
  const ahora = opciones.ahora ?? ahoraIso();
  const lineas = new Set(opciones.lineaIds ?? []);
  const turnosFiltro = new Set(opciones.turnos ?? []);

  const paradasPorOrden = new Map<string, number>();
  for (const parada of paradas) {
    if (!parada.afectaOee) continue;
    paradasPorOrden.set(
      parada.ordenId,
      (paradasPorOrden.get(parada.ordenId) ?? 0) + parada.duracionMin,
    );
  }

  const agregado: AgregadoVentana = {
    porLinea: new Map(),
    porTurno: new Map(),
    porFecha: new Map(),
    total: nuevoAcumulado(),
  };

  for (const orden of ordenes) {
    if (orden.fecha < opciones.desde || orden.fecha > opciones.hasta) continue;
    if (lineas.size > 0 && !lineas.has(orden.lineaId)) continue;
    if (turnosFiltro.size > 0 && !turnosFiltro.has(orden.turno)) continue;

    const minutos = minutosEntre(orden.inicio, finEfectivo(orden, ahora));
    const paradasMin = paradasPorOrden.get(orden.id) ?? 0;
    sumar(tomar(agregado.porLinea, orden.lineaId), minutos, paradasMin, orden);
    sumar(tomar(agregado.porTurno, orden.turno), minutos, paradasMin, orden);
    sumar(tomar(agregado.porFecha, orden.fecha), minutos, paradasMin, orden);
    sumar(agregado.total, minutos, paradasMin, orden);
  }

  return agregado;
}
