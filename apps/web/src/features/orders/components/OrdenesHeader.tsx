'use client';

import * as React from 'react';
import { Button, Icon, toast } from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { formatNumber, formatRelative } from '@mes/shared';
import type { OrdenesResumen } from '@mes/types';
import { NuevaOrdenModal } from './NuevaOrdenModal';

export interface OrdenesHeaderProps {
  resumen?: OrdenesResumen;
}

/**
 * `MES / Órdenes / Listado` — page header (Figma 2156:4238): título H2,
 * subtítulo con el total histórico y la última sincronización, Secondary
 * "Exportar" (`file-xls`) y el único Primary de la pantalla, "Nueva orden".
 */
export function OrdenesHeader({ resumen }: OrdenesHeaderProps) {
  const [nueva, setNueva] = React.useState(false);

  const subtitulo = resumen
    ? `Fuente única de producción · ${formatNumber(resumen.todas)} órdenes · Última sincronización ${desde(resumen.ultimaSincronizacion)}`
    : 'Fuente única de producción · listado, filtros y detalle de cada OF';

  const exportar = React.useCallback(() => {
    toast.success('Exportación en preparación', {
      description: 'Recibirás el archivo XLSX con las órdenes filtradas en unos segundos.',
    });
  }, []);

  return (
    <>
      <AppPageHeader
        className="flex-wrap gap-y-4"
        title="Órdenes de fabricación"
        subtitle={subtitulo}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" icon={<Icon name="file-xls" />} onClick={exportar}>
              Exportar
            </Button>
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setNueva(true)}>
              Nueva orden
            </Button>
          </div>
        }
      />
      <NuevaOrdenModal open={nueva} onOpenChange={setNueva} />
    </>
  );
}

function desde(iso: string): string {
  const segundos = (Date.now() - new Date(iso).getTime()) / 1000;
  if (segundos < 0 || segundos < 5) return 'ahora mismo';
  return formatRelative(segundos);
}
