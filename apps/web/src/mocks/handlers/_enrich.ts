import type {
  Merma,
  MermaListItem,
  OrdenFabricacion,
  OrdenListItem,
  OrdenSap,
  OrdenSapListItem,
  Parada,
  ParadaListItem,
  RegistroVelocidad,
  RegistroVelocidadListItem,
} from '@mes/types';
import { lineaPorId } from '../data';
import { buscarCausaMerma, cadenaCausaMerma, getStore, nombreUsuario, parActivo } from '../store';

function ordenCodigo(ordenId: string): string {
  return getStore().ordenes.find((o) => o.id === ordenId)?.codigo ?? '—';
}

export function enriquecerOrden(orden: OrdenFabricacion): OrdenListItem {
  const linea = lineaPorId.get(orden.lineaId);
  const producto = getStore().productos.find((p) => p.id === orden.productoId);
  return {
    ...orden,
    lineaCodigo: linea?.codigo ?? '—',
    lineaNombre: linea?.nombre ?? '—',
    productoNombre: producto?.nombre ?? '—',
    maquinistaNombre: nombreUsuario(orden.maquinistaId),
    supervisorNombre: nombreUsuario(orden.supervisorId),
  };
}

/**
 * Velocidad con la que nacería una orden desde la fila SAP: par activo y, si no
 * lo hay, el texto SAP (u/h → u/min, 1 decimal). Espejo de `resolverVelocidadSap`.
 */
export function velocidadDeOrdenSap(
  fila: Pick<OrdenSap, 'productoId' | 'lineaId' | 'velocidadUnidHora'>
): { velocidadUnidMin: number; fuente: 'par' | 'sap'; velocidadEstandarId: string | null } | null {
  const par = fila.productoId ? parActivo(fila.productoId, fila.lineaId) : undefined;
  if (par) return { velocidadUnidMin: par.velocidadUnidMin, fuente: 'par', velocidadEstandarId: par.id };
  if (fila.velocidadUnidHora && fila.velocidadUnidHora > 0) {
    return {
      velocidadUnidMin: Math.round((fila.velocidadUnidHora / 60) * 10) / 10,
      fuente: 'sap',
      velocidadEstandarId: null,
    };
  }
  return null;
}

/** Espejo de `enriquecerOrdenSap` de la API. */
export function enriquecerOrdenSap(fila: OrdenSap): OrdenSapListItem {
  const linea = lineaPorId.get(fila.lineaId);
  const producto = fila.productoId
    ? getStore().productos.find((p) => p.id === fila.productoId)
    : undefined;
  const unidadesPorCaja = producto && producto.unidadesPorCaja > 0 ? producto.unidadesPorCaja : 1;
  const velocidad = velocidadDeOrdenSap(fila);
  return {
    ...fila,
    productoNombre: fila.productoNombre || producto?.nombre || '—',
    lineaCodigo: linea?.codigo ?? '—',
    lineaNombre: linea?.nombre ?? '—',
    unidadesPorCaja,
    planificadoUnidades: fila.planificadoCajas * unidadesPorCaja,
    velocidadEstandar: velocidad?.velocidadUnidMin ?? null,
    velocidadFuente: velocidad?.fuente ?? null,
  };
}

export function enriquecerParada(parada: Parada): ParadaListItem {
  const store = getStore();
  const causa = store.causasParada.find((c) => c.id === parada.causaId);
  const tipo = store.causasParada.find((c) => c.id === parada.tipoCausaId);
  return {
    ...parada,
    lineaCodigo: lineaPorId.get(parada.lineaId)?.codigo ?? '—',
    causaCodigo: causa?.codigo ?? '—',
    causaNombre: causa?.nombre ?? '—',
    tipoCausaCodigo: tipo?.codigo ?? '—',
    tipoCausaNombre: tipo?.nombre ?? '—',
    clasificacion: tipo?.clasificacion ?? causa?.clasificacion ?? 'imprevista',
    responsableNombre: nombreUsuario(parada.responsableId),
    ordenCodigo: ordenCodigo(parada.ordenId),
  };
}

export function enriquecerMerma(merma: Merma): MermaListItem {
  const causa = buscarCausaMerma(merma.causaId);
  const cadena = cadenaCausaMerma(merma.causaId);
  const tipoCausaId = merma.tipoCausaId || (cadena.tipo?.id ?? '');
  const clasificacionId = merma.clasificacionId ?? cadena.clasificacion?.id ?? null;
  return {
    ...merma,
    tipoCausaId,
    clasificacionId,
    numeroSolicitud: merma.numeroSolicitud ?? null,
    lineaCodigo: lineaPorId.get(merma.lineaId)?.codigo ?? '—',
    causaCodigo: causa?.codigo ?? '—',
    causaNombre: causa?.nombre ?? '—',
    tipoCausaNombre: buscarCausaMerma(tipoCausaId)?.nombre ?? '—',
    clasificacionNombre: clasificacionId
      ? (buscarCausaMerma(clasificacionId)?.nombre ?? '—')
      : null,
    responsableNombre: nombreUsuario(merma.responsableId),
    ordenCodigo: ordenCodigo(merma.ordenId),
  };
}

export function enriquecerVelocidad(registro: RegistroVelocidad): RegistroVelocidadListItem {
  return {
    ...registro,
    lineaCodigo: lineaPorId.get(registro.lineaId)?.codigo ?? '—',
    ordenCodigo: ordenCodigo(registro.ordenId),
    responsableNombre: nombreUsuario(registro.responsableId),
  };
}
