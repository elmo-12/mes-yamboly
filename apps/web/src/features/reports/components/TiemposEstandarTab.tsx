'use client';

import * as React from 'react';
import { Badge, SectionTitle, TBody, TCell, TH, THead, TRow, Table, type BadgeColor } from '@mes/ui';
import type { CausaParada, CausaParadaNodo, ReporteQuery } from '@mes/types';
import { formatDelta, formatMinutes, formatNumber } from '@mes/shared';
import { useCausasParada } from '@/features/catalogs/hooks';
import { useReporteParadas } from '../hooks';
import { TabError, TabSinDatos, TabSkeleton } from './estados';

export interface TiemposEstandarTabProps {
  query: ReporteQuery;
  onLimpiar: () => void;
}

/** Aplana el árbol Tipo → General → Específica en una lista de causas. */
function aplanar(nodos: readonly CausaParadaNodo[]): CausaParada[] {
  const salida: CausaParada[] = [];
  const visitar = (n: CausaParadaNodo) => {
    const { hijos, ...causa } = n;
    salida.push(causa);
    hijos.forEach(visitar);
  };
  nodos.forEach(visitar);
  return salida;
}

function colorDesvio(pct: number): BadgeColor {
  if (pct <= 5) return 'success';
  if (pct <= 20) return 'warning';
  return 'critical';
}

/**
 * Contraste entre el tiempo estándar de cada causa (catálogo de Configuración,
 * `CausaParada.tiempoEstandarMin`) y el promedio real del periodo
 * (`minutos / cantidad` del detalle de paradas). Alimenta el análisis de
 * desvíos de RF7 y la revisión de estándares de RF11.
 */
export function TiemposEstandarTab({ query, onLimpiar }: TiemposEstandarTabProps) {
  const paradas = useReporteParadas(query);
  const causas = useCausasParada();

  if (paradas.isPending || causas.isPending) return <TabSkeleton kpis={0} bloques={1} />;
  if (paradas.isError || causas.isError) return <TabError onReintentar={() => void paradas.refetch()} />;

  const estandarPorCodigo = new Map(
    aplanar(causas.data.data).map((c) => [c.codigo, c.tiempoEstandarMin]),
  );

  const filas = paradas.data.detallePorCausa
    .filter((c) => c.cantidad > 0)
    .map((c) => {
      const estandar = estandarPorCodigo.get(c.causaCodigo) ?? 0;
      const real = c.minutos / c.cantidad;
      const desvioMin = real - estandar;
      const desvioPct = estandar > 0 ? (desvioMin / estandar) * 100 : 0;
      return { ...c, estandar, real, desvioMin, desvioPct };
    })
    .filter((f) => f.estandar > 0);

  if (filas.length === 0) return <TabSinDatos onLimpiar={onLimpiar} />;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Tiempos estándar frente al real"
        description="Tiempo estándar del catálogo de causas (Configuración) contra el promedio real registrado en el periodo."
      />
      <Table density="dense">
        <THead>
          <TRow plain>
            <TH>Código</TH>
            <TH>Causa</TH>
            <TH numeric>Eventos</TH>
            <TH numeric>Tiempo estándar</TH>
            <TH numeric>Promedio real</TH>
            <TH numeric>Desvío</TH>
          </TRow>
        </THead>
        <TBody>
          {filas.map((f) => (
            <TRow key={f.causaId}>
              <TCell className="font-medium tabular">{f.causaCodigo}</TCell>
              <TCell>{f.causaNombre}</TCell>
              <TCell numeric muted>
                {formatNumber(f.cantidad)}
              </TCell>
              <TCell numeric>{formatMinutes(f.estandar, 0)}</TCell>
              <TCell numeric className="font-medium">
                {formatMinutes(f.real)}
              </TCell>
              <TCell numeric>
                <Badge color={colorDesvio(f.desvioPct)}>
                  {formatDelta(f.desvioPct, '%')} · {formatDelta(f.desvioMin, 'min')}
                </Badge>
              </TCell>
            </TRow>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
