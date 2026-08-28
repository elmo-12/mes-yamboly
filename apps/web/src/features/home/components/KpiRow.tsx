import { KpiCard, cn } from '@mes/ui';
import type { KpiVista } from '../kpis';

export interface KpiRowProps {
  kpis: readonly KpiVista[];
  /**
   * `stretch` reparte el ancho (fila de 4 del frame); `fixed` deja las tarjetas
   * a 267 px y el resto de la fila vacío (fila de 3 del frame 2163:17532).
   */
  ancho?: 'stretch' | 'fixed';
}

/** Fila de `MES / KPI card` — 4 por fila como máximo, `gap 16` (design-system §2.1). */
export function KpiRow({ kpis, ancho = 'stretch' }: KpiRowProps) {
  if (kpis.length === 0) return null;
  return (
    <div className="flex w-full flex-wrap items-stretch gap-4">
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.id}
          label={kpi.label}
          value={kpi.value}
          delta={kpi.delta}
          trend={kpi.trend}
          favorable={kpi.favorable}
          context={kpi.context}
          className={cn(
            ancho === 'fixed' && 'grow-0 basis-[267px] sm:flex-none sm:w-[267px]',
          )}
        />
      ))}
    </div>
  );
}
