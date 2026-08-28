'use client';

import * as React from 'react';
import { Divider } from '@mes/ui';
import { useOrdenes, useOrdenesResumen } from '../hooks';
import { aQueryApi, useOrdenesFiltros } from '../use-ordenes-filtros';
import { OrdenesFilterBar } from './OrdenesFilterBar';
import { OrdenesHeader } from './OrdenesHeader';
import { OrdenesSummary } from './OrdenesSummary';
import { OrdenesTableBlock } from './OrdenesTableBlock';

/**
 * `MES / Órdenes / Listado / Default` (Figma 2156:4160) — composición de las
 * cuatro secciones de la pantalla, con los filtros en `searchParams`.
 */
export function OrdenesPage() {
  const { filtros, aplicar, limpiar, hayFiltros } = useOrdenesFiltros();
  const resumen = useOrdenesResumen();
  const listado = useOrdenes(aQueryApi(filtros));

  return (
    <>
      <OrdenesHeader resumen={resumen.data} />

      <OrdenesSummary
        resumen={resumen.data}
        cargando={resumen.isPending}
        activa={filtros.resumen}
        onChange={(id) => aplicar({ resumen: id, estado: [] })}
      />

      <OrdenesFilterBar
        filtros={filtros}
        onChange={aplicar}
        onClear={limpiar}
        hayFiltros={hayFiltros}
      />

      <Divider />

      <OrdenesTableBlock
        filtros={filtros}
        onChange={aplicar}
        onClear={limpiar}
        data={listado.data}
        cargando={listado.isPending}
        error={listado.error}
        onReintentar={() => void listado.refetch()}
      />
    </>
  );
}
