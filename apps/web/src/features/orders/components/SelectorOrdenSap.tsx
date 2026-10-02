'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Input,
  Select,
  Skeleton,
  cn,
  toast,
} from '@mes/ui';
import { TURNO_LABEL, type OrdenSapListItem } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useLineas } from '@/features/catalogs/hooks';
import { useSession } from '@/hooks/use-session';
import { mensajeDeError } from '@/services/api/form-errors';
import { useOrdenesSap, useSincronizarOrdenesSap } from '../hooks';

const DIAS = ['dom.', 'lun.', 'mar.', 'miérc.', 'juev.', 'vier.', 'sáb.'];
const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'set.', 'oct.', 'nov.', 'dic.'];

/**
 * Fecha de plan SAP con el formato del wizard legado (es-PE):
 * `2026-10-01` → `juev. 1° oct.`. Se arma a mano porque el `Intl` del
 * navegador abrevia distinto según la versión de ICU (`jue,`/`juev.`).
 */
export function formatFechaSap(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  const dia = d.getDate();
  return `${DIAS[d.getDay()]} ${dia}${dia === 1 ? '°' : ''} ${MESES[d.getMonth()]}`;
}

/** `500 cjs · 9 000 u` */
export function formatPlanificadoSap(orden: Pick<OrdenSapListItem, 'planificadoCajas' | 'planificadoUnidades'>): string {
  return `${formatNumber(orden.planificadoCajas)} cjs · ${formatNumber(orden.planificadoUnidades)} u`;
}

/** Minúsculas sin tildes, para el buscador en cliente. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export interface SelectorOrdenSapProps {
  lineaId: string;
  /** Muestra el selector de línea (wizard abierto sin tarjeta, modal de /ordenes). */
  conSelectorLinea?: boolean;
  onLineaChange?: (lineaId: string) => void;
  /** Id de la orden SAP elegida (`SAP-…`). */
  value: string;
  onChange: (orden: OrdenSapListItem | null) => void;
  /** Mensaje de error del campo `ordenSapId` (validación o 422 del servidor). */
  error?: string;
}

/**
 * Paso «Orden SAP»: lista de órdenes SAP pendientes de la línea, seleccionables
 * como tarjetas con el formato del wizard legado (`# 95101752`, chip de turno,
 * fecha y `código - producto`) y un buscador por orden, producto o código.
 * Lo comparten `IniciarOrdenWizard` (Tiempo real) y `NuevaOrdenModal` (/ordenes).
 */
export function SelectorOrdenSap({
  lineaId,
  conSelectorLinea = false,
  onLineaChange,
  value,
  onChange,
  error,
}: SelectorOrdenSapProps) {
  const [busqueda, setBusqueda] = React.useState('');
  const { tieneRol } = useSession();
  const { data: lineas } = useLineas();
  const { data, isLoading, isError, refetch } = useOrdenesSap(
    { lineaId },
    { enabled: Boolean(lineaId) },
  );
  const sincronizar = useSincronizarOrdenesSap();
  const puedeSincronizar = tieneRol('jefe', 'supervisor');

  /* Al cambiar de línea se limpia el buscador. */
  React.useEffect(() => setBusqueda(''), [lineaId]);

  const ordenes = data?.data ?? [];
  const q = normalizar(busqueda.trim());
  const visibles = q
    ? ordenes.filter(
        (o) =>
          normalizar(o.numero).includes(q) ||
          normalizar(o.codigoProducto).includes(q) ||
          normalizar(o.productoNombre).includes(q),
      )
    : ordenes;

  const lanzarSincronizacion = async () => {
    try {
      const r = await sincronizar.mutateAsync();
      toast.success('Órdenes SAP sincronizadas', {
        description: `${formatNumber(r.leidas)} pendientes en SAP · ${formatNumber(r.insertadas)} nuevas`,
      });
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo sincronizar con SAP'));
    }
  };

  const botonSincronizar = puedeSincronizar ? (
    <Button
      variant="secondary"
      icon={<Icon name="arrow-path" size={20} />}
      loading={sincronizar.isPending}
      onClick={() => void lanzarSincronizacion()}
    >
      Sincronizar con SAP
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('grid grid-cols-1 gap-4', conSelectorLinea && 'sm:grid-cols-2')}>
        {conSelectorLinea && (
          <Select
            label="Línea"
            hint="Línea de producción de la planta"
            placeholder="Selecciona la línea"
            /* Sólo líneas activas: en una línea desactivada no se inician órdenes. */
            options={(lineas?.data ?? [])
              .filter((l) => l.estado === 'activo')
              .map((l) => ({
              value: l.id,
                label: `${l.codigo} · ${l.nombre}`,
              }))}
            value={lineaId}
            onValueChange={(v) => {
              onLineaChange?.(v);
              onChange(null);
            }}
          />
        )}
        <Input
          label="Orden SAP"
          placeholder="Buscar por orden, producto o código…"
          leadingIcon={<Icon name="search" size={16} />}
          value={busqueda}
          disabled={!lineaId}
          onChange={(e) => setBusqueda(e.target.value)}
          destructive={Boolean(error)}
          hint={
            error ??
            (lineaId
              ? `${formatNumber(ordenes.length)} pendientes en la línea`
              : 'Elige primero la línea')
          }
        />
      </div>

      {!lineaId ? null : isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          variant="error"
          icon={<Icon name="alert-triangle" />}
          title="No se pudieron cargar las órdenes SAP"
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              Reintentar
            </Button>
          }
          className="py-6"
        />
      ) : ordenes.length === 0 ? (
        <EmptyState
          icon={<Icon name="inbox" />}
          title="No hay órdenes SAP pendientes para esta línea"
          description="Las órdenes llegan de SAP; las ya iniciadas no se vuelven a ofrecer."
          action={botonSincronizar}
          className="py-6"
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          variant="no-results"
          icon={<Icon name="search" />}
          title="Ninguna orden coincide con la búsqueda"
          className="py-6"
        />
      ) : (
        <div
          role="radiogroup"
          aria-label="Órdenes SAP pendientes"
          className="flex max-h-[296px] flex-col gap-2 overflow-y-auto pr-1"
        >
          {visibles.map((o) => {
            const elegida = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={elegida}
                onClick={() => onChange(elegida ? null : o)}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-md border px-3 py-2.5 text-left',
                  'transition-colors duration-150 ease-standard focus-visible:shadow-focus focus-visible:outline-none',
                  elegida
                    ? 'border-primary-subtle-border bg-primary-subtle'
                    : 'border-border bg-background-main hover:border-border-strong hover:bg-background-subtle',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="text-h4 text-text-primary"># {o.numero}</span>
                  <Badge color={o.turno === 'N' ? 'accent' : 'informational'}>
                    Turno {TURNO_LABEL[o.turno]}
                  </Badge>
                  <span className="ml-auto text-body-sm text-text-secondary">
                    {formatFechaSap(o.fecha)}
                  </span>
                  {elegida && <Icon name="check-circle" size={20} className="text-primary" />}
                </span>
                <span className="text-body-sm text-text-secondary">
                  {o.codigoProducto} - {o.productoNombre}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {lineaId && ordenes.length > 0 && botonSincronizar && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="arrow-path" size={16} />}
            loading={sincronizar.isPending}
            onClick={() => void lanzarSincronizacion()}
          >
            Sincronizar con SAP
          </Button>
        </div>
      )}
    </div>
  );
}
