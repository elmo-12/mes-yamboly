import type {
  MermaListItem,
  OrdenListItem,
  ParadaListItem,
  RegistroVelocidadListItem,
} from '@mes/types';
import type {
  Merma,
  OrdenFabricacion,
  Parada,
  RegistroVelocidad,
} from '../../database/entities';
import type { Lookups } from './lookups.service';

const GUION = '—';

function codigoOrden(lookups: Lookups, ordenId: string): string {
  return lookups.ordenCodigos.get(ordenId) ?? GUION;
}

function nombreUsuario(lookups: Lookups, id: string): string {
  return lookups.usuarios.get(id)?.nombre ?? 'Sistema';
}

/** Quita los `null` de SQLite: el contrato usa `undefined` en los opcionales. */
function opcional(valor: string | null | undefined): string | undefined {
  return valor ?? undefined;
}

export function enriquecerOrden(orden: OrdenFabricacion, lookups: Lookups): OrdenListItem {
  const linea = lookups.lineas.get(orden.lineaId);
  const producto = lookups.productos.get(orden.productoId);
  return {
    ...orden,
    observacion: opcional(orden.observacion),
    lineaCodigo: linea?.codigo ?? GUION,
    lineaNombre: linea?.nombre ?? GUION,
    productoNombre: producto?.nombre ?? GUION,
    maquinistaNombre: nombreUsuario(lookups, orden.maquinistaId),
    supervisorNombre: nombreUsuario(lookups, orden.supervisorId),
  };
}

export function enriquecerParada(parada: Parada, lookups: Lookups): ParadaListItem {
  const causa = lookups.causasParada.get(parada.causaId);
  const tipo = lookups.causasParada.get(parada.tipoCausaId);
  return {
    ...parada,
    numeroSolicitud: opcional(parada.numeroSolicitud),
    evidenciaUrl: opcional(parada.evidenciaUrl),
    deteccionId: opcional(parada.deteccionId),
    comentarioCierre: opcional(parada.comentarioCierre),
    lineaCodigo: lookups.lineas.get(parada.lineaId)?.codigo ?? GUION,
    maquinaNombre: lookups.maquinas.get(parada.maquinaId)?.nombre ?? GUION,
    causaCodigo: causa?.codigo ?? GUION,
    causaNombre: causa?.nombre ?? GUION,
    tipoCausaCodigo: tipo?.codigo ?? GUION,
    tipoCausaNombre: tipo?.nombre ?? GUION,
    responsableNombre: nombreUsuario(lookups, parada.responsableId),
    ordenCodigo: codigoOrden(lookups, parada.ordenId),
  };
}

export function enriquecerMerma(merma: Merma, lookups: Lookups): MermaListItem {
  const causa = lookups.causasMerma.get(merma.causaId);
  const cadena = cadenaCausaMerma(lookups, merma.causaId);
  const tipoId = merma.tipoCausaId || (cadena.tipo?.id ?? '');
  const clasificacionId = merma.clasificacionId ?? cadena.clasificacion?.id ?? null;
  return {
    ...merma,
    codigoBalde: opcional(merma.codigoBalde),
    observacion: opcional(merma.observacion),
    numeroSolicitud: merma.numeroSolicitud ?? null,
    tipoCausaId: tipoId,
    clasificacionId,
    lineaCodigo: lookups.lineas.get(merma.lineaId)?.codigo ?? GUION,
    causaCodigo: causa?.codigo ?? GUION,
    causaNombre: causa?.nombre ?? GUION,
    tipoCausaNombre: lookups.causasMerma.get(tipoId)?.nombre ?? GUION,
    clasificacionNombre: clasificacionId
      ? (lookups.causasMerma.get(clasificacionId)?.nombre ?? GUION)
      : null,
    responsableNombre: nombreUsuario(lookups, merma.responsableId),
    ordenCodigo: codigoOrden(lookups, merma.ordenId),
  };
}

/**
 * Cadena de ascendencia de una causa de merma: `causa` (hoja) →
 * `clasificacion` (nivel intermedio, opcional) → `tipo` (raíz).
 */
export function cadenaCausaMerma(lookups: Lookups, causaId: string) {
  const causa = lookups.causasMerma.get(causaId);
  const padre = causa?.parentId ? lookups.causasMerma.get(causa.parentId) : undefined;
  const abuelo = padre?.parentId ? lookups.causasMerma.get(padre.parentId) : undefined;
  if (abuelo) return { causa, clasificacion: padre, tipo: abuelo };
  if (padre) return { causa, clasificacion: undefined, tipo: padre };
  return { causa, clasificacion: undefined, tipo: causa };
}

export function enriquecerVelocidad(
  registro: RegistroVelocidad,
  lookups: Lookups,
): RegistroVelocidadListItem {
  return {
    ...registro,
    motivo: opcional(registro.motivo),
    lineaCodigo: lookups.lineas.get(registro.lineaId)?.codigo ?? GUION,
    ordenCodigo: codigoOrden(lookups, registro.ordenId),
    responsableNombre: nombreUsuario(lookups, registro.responsableId),
  };
}

/** Sube por el árbol de causas hasta el nodo raíz (`nivel: 'tipo'`). */
export function tipoDeCausa(lookups: Lookups, causaId: string) {
  let actual = lookups.causasParada.get(causaId);
  while (actual?.parentId) {
    const padre = lookups.causasParada.get(actual.parentId);
    if (!padre) break;
    actual = padre;
  }
  return actual;
}
