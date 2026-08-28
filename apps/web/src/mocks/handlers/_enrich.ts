import type {
  Merma,
  MermaListItem,
  OrdenFabricacion,
  OrdenListItem,
  Parada,
  ParadaListItem,
  RegistroVelocidad,
  RegistroVelocidadListItem,
} from '@mes/types';
import { causaMermaPorId, lineaPorId, maquinaPorId, productoPorId } from '../data';
import { nombreUsuario } from '../data/users';
import { getStore } from '../store';

function ordenCodigo(ordenId: string): string {
  return getStore().ordenes.find((o) => o.id === ordenId)?.codigo ?? '—';
}

export function enriquecerOrden(orden: OrdenFabricacion): OrdenListItem {
  const linea = lineaPorId.get(orden.lineaId);
  const producto = productoPorId.get(orden.productoId);
  return {
    ...orden,
    lineaCodigo: linea?.codigo ?? '—',
    lineaNombre: linea?.nombre ?? '—',
    productoNombre: producto?.nombre ?? '—',
    maquinistaNombre: nombreUsuario(orden.maquinistaId),
    supervisorNombre: nombreUsuario(orden.supervisorId),
  };
}

export function enriquecerParada(parada: Parada): ParadaListItem {
  const store = getStore();
  const causa = store.causasParada.find((c) => c.id === parada.causaId);
  const tipo = store.causasParada.find((c) => c.id === parada.tipoCausaId);
  return {
    ...parada,
    lineaCodigo: lineaPorId.get(parada.lineaId)?.codigo ?? '—',
    maquinaNombre: maquinaPorId.get(parada.maquinaId)?.nombre ?? '—',
    causaCodigo: causa?.codigo ?? '—',
    causaNombre: causa?.nombre ?? '—',
    tipoCausaCodigo: tipo?.codigo ?? '—',
    tipoCausaNombre: tipo?.nombre ?? '—',
    responsableNombre: nombreUsuario(parada.responsableId),
    ordenCodigo: ordenCodigo(parada.ordenId),
  };
}

export function enriquecerMerma(merma: Merma): MermaListItem {
  const causa = causaMermaPorId.get(merma.causaId);
  return {
    ...merma,
    lineaCodigo: lineaPorId.get(merma.lineaId)?.codigo ?? '—',
    causaCodigo: causa?.codigo ?? '—',
    causaNombre: causa?.nombre ?? '—',
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
