'use client';

import * as React from 'react';
import { Button, Divider, EmptyState, Icon, SectionTitle, toast } from '@mes/ui';
import type { LineaEstado } from '@mes/types';
import { useSedes } from '@/features/catalogs/hooks';
import { useDescartarDeteccion } from '@/features/downtimes/hooks';
import {
  FinalizarOrdenModal,
  FinalizarParadaModal,
  IniciarOrdenWizard,
  IoTSugeridaModal,
  MermaWizard,
  ParadaWizard,
  VelocidadDrawer,
  contextoDeLinea,
} from '@/features/capture';
import { useLineasTiempoReal } from '../hooks';
import { LineaDrawer } from './LineaDrawer';
import {
  FILTROS_VACIOS,
  LineasFilterBar,
  filtrarLineas,
  type FiltrosLineas,
} from './LineasFilterBar';
import { LineasGrid, LineasGridSkeleton, type AccionLinea } from './LineasGrid';
import { TiempoRealHeader } from './TiempoRealHeader';

type Overlay = Exclude<AccionLinea, 'descartar-iot'>;

/**
 * `Tiempo real / Líneas / Default` (Figma 2156:3936). Hub operativo del MES:
 * tablero de líneas con refresco de 5 s y todos los overlays de captura rápida
 * (OE1 · KPI TRI).
 */
export function TiempoRealPage() {
  const [sedeId, setSedeId] = React.useState('SED-01');
  const [filtros, setFiltros] = React.useState<FiltrosLineas>(FILTROS_VACIOS);
  const [overlay, setOverlay] = React.useState<Overlay | null>(null);
  const [lineaSel, setLineaSel] = React.useState<LineaEstado | null>(null);

  const { data: sedes } = useSedes();
  const { data, isPending, isError, error, refetch } = useLineasTiempoReal({ sedeId });
  const descartar = useDescartarDeteccion();

  const lineas = data?.lineas ?? [];
  const visibles = filtrarLineas(lineas, filtros);
  const turnoLabel = data?.turnoLabel ?? '';
  const turnoRango = data?.turnoRango ?? '';

  /* La tarjeta seleccionada se re-lee de la última respuesta para que el drawer
     y los overlays sigan el refresco de 5 s. */
  const lineaActual = lineaSel
    ? (lineas.find((l) => l.lineaId === lineaSel.lineaId) ?? lineaSel)
    : null;
  const contexto = lineaActual && data ? contextoDeLinea(lineaActual, data) : null;

  const abrir = (accion: Overlay, linea: LineaEstado | null) => {
    setLineaSel(linea);
    setOverlay(accion);
  };

  const onAccion = async (accion: AccionLinea, linea: LineaEstado) => {
    if (accion === 'descartar-iot') {
      if (!linea.deteccion) return;
      try {
        await descartar.mutateAsync(linea.deteccion.id);
        toast.success('Detección descartada · se realimenta el modelo');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo descartar la detección');
      }
      return;
    }
    abrir(accion, linea);
  };

  const cerrar = (abierto: boolean) => {
    if (!abierto) setOverlay(null);
  };

  const hayFiltros = filtros.linea.length > 0 || filtros.estado.length > 0;

  return (
    <>
      <TiempoRealHeader
        actualizadoEn={data?.actualizadoEn}
        turnoLabel={turnoLabel}
        turnoRango={turnoRango}
        lineas={lineas.length}
        overlayAbierto={overlay !== null}
        onIniciarOrden={() => abrir('iniciar-orden', null)}
      />

      {!isError && lineas.length > 0 && (
        <LineasFilterBar
          lineas={lineas}
          sedes={sedes?.data ?? []}
          sedeId={sedeId}
          onSedeChange={setSedeId}
          value={filtros}
          onChange={setFiltros}
        />
      )}

      {!isError && lineas.length > 0 && <Divider />}

      <SectionTitle
        title="Líneas de producción"
        description={`${lineas.length > 0 ? `${lineas.length} puestos monitoreados · ` : ''}lectura de sensores cada 5 s · toca una tarjeta para ver el detalle del turno`}
      />

      {isError ? (
        <EmptyState
          variant="error"
          icon={<Icon name="alert-circle" size={40} />}
          title="No se pudo cargar el tablero"
          description={
            error instanceof Error ? error.message : 'Revisa la conexión con la planta e inténtalo otra vez.'
          }
          action={
            <Button variant="secondary" icon={<Icon name="arrow-path" size={20} />} onClick={() => void refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : isPending ? (
        <LineasGridSkeleton />
      ) : visibles.length === 0 && hayFiltros ? (
        <EmptyState
          variant="no-results"
          icon={<Icon name="search" size={40} />}
          title="Ninguna línea coincide con los filtros"
          description="Prueba con otra línea o quita los filtros de estado."
          action={
            <Button variant="secondary" onClick={() => setFiltros(FILTROS_VACIOS)}>
              Limpiar filtros
            </Button>
          }
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={<Icon name="inbox" size={40} />}
          title="No hay órdenes activas en este turno"
          description="Inicia una orden de fabricación para empezar a monitorear las líneas."
          action={
            <Button
              variant="primary"
              icon={<Icon name="play-circle" size={20} />}
              disabled={overlay !== null}
              onClick={() => abrir('iniciar-orden', null)}
            >
              Iniciar orden
            </Button>
          }
        />
      ) : (
        <LineasGrid
          lineas={visibles}
          resumen={{ turnoLabel, turnoRango }}
          onAccion={(accion, linea) => void onAccion(accion, linea)}
        />
      )}

      {contexto && (
        <>
          <LineaDrawer
            linea={lineaActual}
            turnoLabel={turnoLabel}
            turnoRango={turnoRango}
            abierto={overlay === 'detalle'}
            onOpenChange={cerrar}
            onRegistrarParada={() => setOverlay('parada')}
          />
          <ParadaWizard contexto={contexto} abierto={overlay === 'parada'} onOpenChange={cerrar} />
          <FinalizarParadaModal
            contexto={contexto}
            abierto={overlay === 'finalizar-parada'}
            onOpenChange={cerrar}
          />
          <MermaWizard contexto={contexto} abierto={overlay === 'merma'} onOpenChange={cerrar} />
          <VelocidadDrawer
            contexto={contexto}
            abierto={overlay === 'velocidad'}
            onOpenChange={cerrar}
          />
          <FinalizarOrdenModal
            contexto={contexto}
            abierto={overlay === 'finalizar-orden'}
            onOpenChange={cerrar}
          />
          <IoTSugeridaModal
            contexto={contexto}
            abierto={overlay === 'confirmar-iot'}
            onOpenChange={cerrar}
          />
        </>
      )}

      <IniciarOrdenWizard
        abierto={overlay === 'iniciar-orden'}
        onOpenChange={cerrar}
        lineaId={lineaActual?.lineaId}
      />
    </>
  );
}
