'use client';

import { Icon, EmptyState, Button } from '@mes/ui';
import type { User } from '@mes/types';
import { ROLE_LABEL } from '@mes/types';
import { META_OEE } from '@mes/shared';
import { useResumenJefe } from '../hooks';
import { EstadoLineasTable } from './EstadoLineasTable';
import { HomeHeader } from './HomeHeader';
import { HomeSkeleton } from './HomeSkeleton';
import { KpiRow } from './KpiRow';
import { OeePorLineaChart } from './OeePorLineaChart';
import { RequiereAccion } from './RequiereAccion';
import { TopCausasTable } from './TopCausasTable';

/**
 * `Home / Dashboard Jefe / Default` (Figma 2163:17435) — vista de jefe,
 * supervisor, calidad e investigador. Secciones separadas por `gap 24`:
 * header · 4 KPI · 3 KPI · Requiere acción · fila de gráficos · Estado de líneas.
 */
export function DashboardJefe({ user }: { user: User }) {
  const resumen = useResumenJefe();

  if (resumen.isPending) return <HomeSkeleton />;

  if (resumen.isError) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el panel del turno"
        description="Los indicadores del día no están disponibles ahora mismo. Reintenta; si continúa, avisa al área de sistemas."
        action={
          <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={resumen.refetch}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <>
      <HomeHeader nombre={user.nombre} resumen={resumen.tiempoReal} rolLabel={ROLE_LABEL[user.rol]} />

      <KpiRow kpis={resumen.kpisOee} />
      <KpiRow kpis={resumen.kpisOperacion} ancho="fixed" />

      <RequiereAccion alertas={resumen.alertas} />

      <div className="flex w-full flex-col items-stretch gap-4 xl:flex-row">
        <OeePorLineaChart datos={resumen.oeePorLinea} meta={META_OEE} />
        <TopCausasTable datos={resumen.topCausas} />
      </div>

      <EstadoLineasTable lineas={resumen.lineas} turnoLabel={resumen.tiempoReal?.turnoLabel} />
    </>
  );
}
