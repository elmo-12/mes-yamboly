'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Periodo, ReporteQuery, Turno } from '@mes/types';
import { PERIODOS, TURNOS } from '@mes/types';
import { rangoPeriodo } from '@mes/shared';

export const REPORT_TABS = ['indicadores', 'paradas', 'mermas', 'tiempos', 'exportar'] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export const REPORT_TAB_LABEL: Record<ReportTab, string> = {
  indicadores: 'Indicadores',
  paradas: 'Paradas',
  mermas: 'Mermas',
  tiempos: 'Tiempos estándar',
  exportar: 'Exportar',
};

/** Periodos ofrecidos en la barra de filtros (Figma 2163:18531). */
export const PERIODOS_FILTRO: readonly { value: Periodo; label: string }[] = [
  { value: 'semana', label: 'Últimos 7 días' },
  { value: 'mes', label: 'Mes' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'personalizado', label: 'Personalizado' },
];

export type Comparar = NonNullable<ReporteQuery['comparar']>;

export const COMPARAR_FILTRO: readonly { value: Comparar; label: string }[] = [
  { value: 'periodo_anterior', label: 'Periodo anterior' },
  { value: 'anio_anterior', label: 'Mismo periodo año anterior' },
];

export interface ReportFilters {
  tab: ReportTab;
  periodo: Periodo;
  desde: string;
  hasta: string;
  /** Ids de línea seleccionados; vacío = todas. */
  lineaId: string[];
  turno: Turno[];
  comparar: Comparar;
}

function esTab(v: string | null): v is ReportTab {
  return v !== null && (REPORT_TABS as readonly string[]).includes(v);
}

function esPeriodo(v: string | null): v is Periodo {
  return v !== null && (PERIODOS as readonly string[]).includes(v);
}

function lista(v: string | null): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Estado de la vista Reportes en `searchParams` (`?tab=`, `?periodo=`, `?linea=`,
 * `?turno=`, `?comparar=`, `?desde=`, `?hasta=`). Al recargar la URL reproduce
 * exactamente la misma consulta.
 */
export function useReportFilters(): {
  filtros: ReportFilters;
  query: ReporteQuery;
  setFiltros: (parcial: Partial<ReportFilters>) => void;
  limpiar: () => void;
  hayFiltros: boolean;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtros = React.useMemo<ReportFilters>(() => {
    const tabParam = searchParams.get('tab');
    const periodoParam = searchParams.get('periodo');
    const periodo: Periodo = esPeriodo(periodoParam) ? periodoParam : 'semana';
    const rango = rangoPeriodo(periodo === 'personalizado' ? 'semana' : periodo);
    return {
      tab: esTab(tabParam) ? tabParam : 'indicadores',
      periodo,
      desde: searchParams.get('desde') ?? rango.desde,
      hasta: searchParams.get('hasta') ?? rango.hasta,
      lineaId: lista(searchParams.get('linea')),
      turno: lista(searchParams.get('turno')).filter((t): t is Turno =>
        (TURNOS as readonly string[]).includes(t),
      ),
      comparar: searchParams.get('comparar') === 'anio_anterior' ? 'anio_anterior' : 'periodo_anterior',
    };
  }, [searchParams]);

  const setFiltros = React.useCallback(
    (parcial: Partial<ReportFilters>) => {
      const siguiente = { ...filtros, ...parcial };
      const params = new URLSearchParams();
      if (siguiente.tab !== 'indicadores') params.set('tab', siguiente.tab);
      if (siguiente.periodo !== 'semana') params.set('periodo', siguiente.periodo);
      if (siguiente.periodo === 'personalizado') {
        params.set('desde', siguiente.desde);
        params.set('hasta', siguiente.hasta);
      }
      if (siguiente.lineaId.length > 0) params.set('linea', siguiente.lineaId.join(','));
      if (siguiente.turno.length > 0) params.set('turno', siguiente.turno.join(','));
      if (siguiente.comparar !== 'periodo_anterior') params.set('comparar', siguiente.comparar);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filtros, pathname, router],
  );

  const limpiar = React.useCallback(() => {
    const params = new URLSearchParams();
    if (filtros.tab !== 'indicadores') params.set('tab', filtros.tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filtros.tab, pathname, router]);

  const hayFiltros =
    filtros.periodo !== 'semana' ||
    filtros.lineaId.length > 0 ||
    filtros.turno.length > 0 ||
    filtros.comparar !== 'periodo_anterior';

  const query = React.useMemo<ReporteQuery>(
    () => ({
      periodo: filtros.periodo,
      ...(filtros.periodo === 'personalizado' ? { desde: filtros.desde, hasta: filtros.hasta } : {}),
      ...(filtros.lineaId.length > 0 ? { lineaId: filtros.lineaId } : {}),
      ...(filtros.turno.length > 0 ? { turno: filtros.turno } : {}),
      comparar: filtros.comparar,
    }),
    [filtros],
  );

  return { filtros, query, setFiltros, limpiar, hayFiltros };
}
