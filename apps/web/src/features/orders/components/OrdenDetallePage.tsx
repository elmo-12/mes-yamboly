'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { ESTADO_ORDEN_LABEL, TURNO_LABEL } from '@mes/types';
import { formatDateLong } from '@mes/shared';
import { useSession } from '@/hooks/use-session';
import { PageSkeleton } from '@/components/PageSkeleton';
import { useBreadcrumbLabel } from '@/layouts/shell-context';
import {
  useOrden,
  useOrdenBitacora,
  useOrdenMermas,
  useOrdenParadas,
  useOrdenVelocidades,
} from '../hooks';
import { ESTADO_ORDEN_COLOR } from '../format';
import { EditarOrdenModal } from './EditarOrdenModal';
import { OrdenBitacoraTab } from './OrdenBitacoraTab';
import { OrdenCalidadTab } from './OrdenCalidadTab';
import { OrdenConsumoTab } from './OrdenConsumoTab';
import { OrdenEvidenciasTab } from './OrdenEvidenciasTab';
import { OrdenMermasTab } from './OrdenMermasTab';
import { OrdenParadasTab } from './OrdenParadasTab';
import { OrdenResumenTab } from './OrdenResumenTab';
import { ValidarOrdenModal } from './ValidarOrdenModal';

const TABS = [
  'resumen',
  'paradas',
  'mermas',
  'calidad',
  'consumo',
  'evidencias',
  'bitacora',
] as const;
type TabId = (typeof TABS)[number];

/** Solo jefatura y supervisión pueden validar una OF (RF5). */
const ROLES_VALIDACION = ['jefe', 'supervisor'] as const;

export interface OrdenDetallePageProps {
  /** Segmento de la ruta: id (`ORD-0815`) o código (`OF-2026-0815`). */
  id: string;
}

/** `MES / Órdenes / Detalle OF` (Figma 2156:8959 · 2163:9998 · 2163:12196). */
export function OrdenDetallePage({ id }: OrdenDetallePageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { tieneRol } = useSession();

  const orden = useOrden(id);
  const paradas = useOrdenParadas(id);
  const mermas = useOrdenMermas(id);
  const velocidades = useOrdenVelocidades(id);
  const bitacora = useOrdenBitacora(id);

  const [editar, setEditar] = React.useState(false);
  const [validar, setValidar] = React.useState(false);

  useBreadcrumbLabel(id, orden.data?.codigo);

  const tabParam = params.get('tab');
  const tab: TabId = (TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as TabId)
    : 'resumen';

  const cambiarTab = React.useCallback(
    (valor: string) => {
      const next = new URLSearchParams(params.toString());
      if (valor === 'resumen') next.delete('tab');
      else next.set('tab', valor);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /* `?validar=1` (desde el ⋯ del listado) abre el modal de validación. */
  const abrirValidar = params.get('validar') === '1';
  const porValidar = orden.data?.estado === 'por_validar';
  React.useEffect(() => {
    if (abrirValidar && porValidar) setValidar(true);
  }, [abrirValidar, porValidar]);

  /* `?print=1` lanza el diálogo de impresión del navegador. */
  const imprimirAuto = params.get('print') === '1';
  const listo = Boolean(orden.data);
  React.useEffect(() => {
    if (imprimirAuto && listo) window.print();
  }, [imprimirAuto, listo]);

  if (orden.isPending) return <PageSkeleton kpis={4} bloques={2} />;

  if (orden.error || !orden.data) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se encontró la orden de fabricación"
        description={`No hay ninguna OF con el identificador ${id} en el repositorio.`}
        action={
          <Button variant="secondary" onClick={() => router.push('/ordenes')}>
            Volver al listado
          </Button>
        }
      />
    );
  }

  const of = orden.data;
  const puedeValidar = of.estado === 'por_validar' && tieneRol(...ROLES_VALIDACION);
  const editable = of.estado !== 'validada';

  return (
    <>
      <AppPageHeader
        className="flex-wrap gap-y-4"
        title={`${of.codigo} · ${of.productoNombre}`}
        titleSlot={<Badge color={ESTADO_ORDEN_COLOR[of.estado]}>{ESTADO_ORDEN_LABEL[of.estado]}</Badge>}
        subtitle={`${of.lineaCodigo} ${of.lineaNombre} · Turno ${TURNO_LABEL[of.turno]} · ${formatDateLong(of.fecha)} · Maquinista ${of.maquinistaNombre} · Supervisor ${of.supervisorNombre}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" icon={<Icon name="printer" />} onClick={() => window.print()}>
              Imprimir
            </Button>
            <Button variant="secondary" icon={<Icon name="edit" />} onClick={() => setEditar(true)}>
              Editar
            </Button>
            {puedeValidar && (
              <Button
                variant="primary"
                icon={<Icon name="check-circle" />}
                onClick={() => setValidar(true)}
              >
                Validar orden
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={cambiarTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="paradas" count={paradas.data?.resumen.cantidad ?? of.paradasCount}>
            Paradas
          </TabsTrigger>
          <TabsTrigger value="mermas" count={mermas.data?.resumen.cantidad}>
            Mermas
          </TabsTrigger>
          <TabsTrigger value="calidad">Calidad</TabsTrigger>
          <TabsTrigger value="consumo">Consumo</TabsTrigger>
          <TabsTrigger value="evidencias">Evidencias</TabsTrigger>
          <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <OrdenResumenTab
            orden={of}
            paradas={paradas.data?.data ?? []}
            cargandoParadas={paradas.isPending}
          />
        </TabsContent>

        <TabsContent value="paradas">
          <OrdenParadasTab
            orden={of}
            paradas={paradas.data?.data ?? []}
            resumen={paradas.data?.resumen}
            cargando={paradas.isPending}
            editable={editable}
          />
        </TabsContent>

        <TabsContent value="mermas">
          <OrdenMermasTab
            mermas={mermas.data?.data ?? []}
            resumen={mermas.data?.resumen}
            cargando={mermas.isPending}
          />
        </TabsContent>

        <TabsContent value="calidad">
          <OrdenCalidadTab orden={of} mermas={mermas.data?.data ?? []} />
        </TabsContent>

        <TabsContent value="consumo">
          <OrdenConsumoTab
            orden={of}
            velocidades={velocidades.data?.data ?? []}
            cargando={velocidades.isPending}
          />
        </TabsContent>

        <TabsContent value="evidencias">
          <OrdenEvidenciasTab paradas={paradas.data?.data ?? []} cargando={paradas.isPending} />
        </TabsContent>

        <TabsContent value="bitacora">
          <OrdenBitacoraTab eventos={bitacora.data?.data ?? []} cargando={bitacora.isPending} />
        </TabsContent>
      </Tabs>

      <EditarOrdenModal open={editar} onOpenChange={setEditar} orden={of} />
      <ValidarOrdenModal open={validar} onOpenChange={setValidar} orden={of} />
    </>
  );
}
