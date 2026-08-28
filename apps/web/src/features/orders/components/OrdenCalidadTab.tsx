'use client';

import { Badge, DescriptionList, SectionTitle } from '@mes/ui';
import type { MermaListItem, OrdenListItem } from '@mes/types';
import { formatKg, formatNumber, formatPct } from '@mes/shared';

export interface OrdenCalidadTabProps {
  orden: OrdenListItem;
  mermas: readonly MermaListItem[];
}

/**
 * Pestaña Calidad: control cruzado producido / conteo de la codificadora, que
 * es el dato con el que el MES calcula el factor Calidad del OEE.
 */
export function OrdenCalidadTab({ orden, mermas }: OrdenCalidadTabProps) {
  const diferencia = orden.producido - orden.conteoCodificadora;
  const desvio = orden.producido > 0 ? (diferencia / orden.producido) * 100 : 0;
  const mermaPt = mermas.filter((m) => m.tipo === 'PT').reduce((a, m) => a + m.cantidadKg, 0);

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Control de calidad de la orden"
        description="Comparación entre lo declarado en línea y el conteo automático de la codificadora."
      />
      <DescriptionList
        labelWidth={260}
        items={[
          {
            label: 'Calidad (factor del OEE)',
            value: (
              <span className="flex items-center gap-2">
                <span className="font-medium tabular">{formatPct(orden.oee.calidad)}</span>
                <Badge color={orden.oee.calidad >= 98 ? 'success' : 'warning'}>
                  {orden.oee.calidad >= 98 ? 'Dentro de meta' : 'Bajo la meta 98 %'}
                </Badge>
              </span>
            ),
          },
          { label: 'Producido declarado', value: `${formatNumber(orden.producido)} u` },
          { label: 'Conteo de la codificadora', value: `${formatNumber(orden.conteoCodificadora)} u` },
          {
            label: 'Diferencia',
            value: `${formatNumber(diferencia)} u · ${formatPct(desvio)} del producido`,
          },
          { label: 'Merma de producto terminado', value: formatKg(mermaPt) },
          { label: 'Merma total de la orden', value: formatKg(orden.mermasKg) },
          { label: 'Lote', value: orden.lote },
        ]}
      />
    </div>
  );
}
