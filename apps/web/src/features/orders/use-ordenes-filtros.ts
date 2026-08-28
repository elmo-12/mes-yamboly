'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { EstadoOrden, OrdenListQuery, Periodo, Turno } from '@mes/types';

/** Tarjeta de resumen activa (spec 05.A). Solo una a la vez. */
export const RESUMENES = ['todas', 'por_validar', 'con_paradas', 'con_mermas'] as const;
export type ResumenOrdenes = (typeof RESUMENES)[number];

export const PAGE_SIZE = 25;
/** Página amplia para los filtros que no existen en la API (`con_paradas`). */
const PAGE_SIZE_AMPLIO = 200;

export interface OrdenesFiltros {
  periodo: Periodo;
  linea: string[];
  turno: Turno[];
  estado: EstadoOrden[];
  resumen: ResumenOrdenes;
  search: string;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
}

const VACIO: OrdenesFiltros = {
  periodo: 'semana',
  linea: [],
  turno: [],
  estado: [],
  resumen: 'todas',
  search: '',
  sort: 'fecha',
  dir: 'desc',
  page: 1,
};

function lista(valor: string | null): string[] {
  return valor ? valor.split(',').filter(Boolean) : [];
}

/**
 * Filtros del listado de órdenes en `searchParams`, para que el `?search=` de
 * la búsqueda global de la topbar y los enlaces compartidos funcionen tal cual.
 */
export function useOrdenesFiltros() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filtros = React.useMemo<OrdenesFiltros>(() => {
    const resumen = params.get('resumen');
    const dir = params.get('dir');
    return {
      periodo: (params.get('periodo') as Periodo | null) ?? VACIO.periodo,
      linea: lista(params.get('linea')),
      turno: lista(params.get('turno')) as Turno[],
      estado: lista(params.get('estado')) as EstadoOrden[],
      resumen: (RESUMENES as readonly string[]).includes(resumen ?? '')
        ? (resumen as ResumenOrdenes)
        : 'todas',
      search: params.get('search') ?? '',
      sort: params.get('sort') ?? VACIO.sort,
      dir: dir === 'asc' ? 'asc' : 'desc',
      page: Math.max(1, Number(params.get('page') ?? 1) || 1),
    };
  }, [params]);

  const aplicar = React.useCallback(
    (parcial: Partial<OrdenesFiltros>) => {
      const siguiente = { ...filtros, ...parcial };
      /* Cualquier cambio que no sea de página vuelve a la primera. */
      if (parcial.page === undefined) siguiente.page = 1;

      const next = new URLSearchParams();
      if (siguiente.periodo !== VACIO.periodo) next.set('periodo', siguiente.periodo);
      if (siguiente.linea.length) next.set('linea', siguiente.linea.join(','));
      if (siguiente.turno.length) next.set('turno', siguiente.turno.join(','));
      if (siguiente.estado.length) next.set('estado', siguiente.estado.join(','));
      if (siguiente.resumen !== 'todas') next.set('resumen', siguiente.resumen);
      if (siguiente.search) next.set('search', siguiente.search);
      if (siguiente.sort !== VACIO.sort) next.set('sort', siguiente.sort);
      if (siguiente.dir !== VACIO.dir) next.set('dir', siguiente.dir);
      if (siguiente.page > 1) next.set('page', String(siguiente.page));

      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filtros, pathname, router],
  );

  const limpiar = React.useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  /** `true` si hay algo que "Limpiar filtros" pueda deshacer. */
  const hayFiltros =
    filtros.periodo !== VACIO.periodo ||
    filtros.linea.length > 0 ||
    filtros.turno.length > 0 ||
    filtros.estado.length > 0 ||
    filtros.resumen !== 'todas' ||
    filtros.search !== '';

  return { filtros, aplicar, limpiar, hayFiltros };
}

/**
 * Traduce los filtros de la UI a la query de `GET /ordenes`.
 * `con_paradas` y `con_mermas` no existen en el contrato: se piden hasta 200
 * filas y se filtran en cliente (ver `OrdenesTableBlock`).
 */
export function aQueryApi(f: OrdenesFiltros): OrdenListQuery {
  const cliente = f.resumen === 'con_paradas' || f.resumen === 'con_mermas';
  return {
    periodo: f.periodo,
    lineaId: f.linea.length ? f.linea : undefined,
    turno: f.turno.length ? f.turno : undefined,
    estado: f.resumen === 'por_validar' ? ['por_validar'] : f.estado.length ? f.estado : undefined,
    search: f.search || undefined,
    sort: f.sort,
    orden: f.dir,
    page: cliente ? 1 : f.page,
    pageSize: cliente ? PAGE_SIZE_AMPLIO : PAGE_SIZE,
  };
}
