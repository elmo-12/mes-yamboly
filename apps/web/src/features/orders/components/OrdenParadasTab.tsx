'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Icon,
  SectionTitle,
  Skeleton,
  Switch,
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
  toast,
} from '@mes/ui';
import type { OrdenListItem, ParadaListItem } from '@mes/types';
import { formatNumber, formatPct } from '@mes/shared';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { useActualizarParada } from '@/features/downtimes/hooks';
import { hora } from '../format';
import { ParadaDrawer } from './ParadaDrawer';

export interface OrdenParadasTabProps {
  orden: OrdenListItem;
  paradas: readonly ParadaListItem[];
  resumen?: { cantidad: number; minutos: number; afectanOee: number };
  cargando: boolean;
  /** Las órdenes validadas quedan selladas: sin edición ni alta. */
  editable: boolean;
}

/** Pestaña Paradas del detalle de OF (Figma 2163:9998). */
export function OrdenParadasTab({
  orden,
  paradas,
  resumen,
  cargando,
  editable,
}: OrdenParadasTabProps) {
  const [drawer, setDrawer] = React.useState<{ abierto: boolean; parada?: ParadaListItem }>({
    abierto: false,
  });
  const actualizar = useActualizarParada();
  const queryClient = useQueryClient();
  const disponibilidad = orden.oee.disponibilidad;

  const alternarOee = async (parada: ParadaListItem, afectaOee: boolean) => {
    try {
      await actualizar.mutateAsync({ id: parada.id, input: { afectaOee } });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.bitacora(orden.codigo) });
      toast.success(
        afectaOee ? 'La parada descuenta disponibilidad' : 'La parada ya no afecta al OEE',
        { description: `${parada.causaCodigo} · ${hora(parada.inicio)}` },
      );
    } catch {
      toast.error('No se pudo actualizar la parada');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Paradas registradas"
        description="Toda parada requiere causa codificada, acción tomada y responsable (RF3)."
        actions={
          editable ? (
            <Button
              variant="secondary"
              icon={<Icon name="plus-circle" />}
              onClick={() => setDrawer({ abierto: true })}
            >
              Registrar parada retroactiva
            </Button>
          ) : undefined
        }
      />

      {cargando ? (
        <FilasSkeleton />
      ) : paradas.length === 0 ? (
        <EmptyState
          icon={<Icon name="stop-circle" size={40} />}
          title="Sin paradas registradas en esta orden"
          description="El turno se completó sin interrupciones o aún no se han registrado. Puedes añadir una parada retroactiva."
          action={
            editable ? (
              <Button variant="secondary" onClick={() => setDrawer({ abierto: true })}>
                Registrar parada retroactiva
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table density="dense">
            <THead>
              <tr>
                <TH className="w-[88px] px-2">Hora inicio</TH>
                <TH className="w-[80px] px-2">Hora fin</TH>
                <TH className="w-[80px] px-2">Duración</TH>
                <TH className="w-[118px] px-2">Tipo</TH>
                <TH className="w-[150px]">Causa</TH>
                <TH className="w-[150px]">Acción tomada</TH>
                <TH className="w-[110px]">Responsable</TH>
                <TH className="w-[84px] px-2">Evidencia</TH>
                <TH className="w-[70px]">OEE</TH>
                <TH className="w-[60px]">
                  <span className="sr-only">Acciones</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {paradas.map((p) => (
                <TRow
                  key={p.id}
                  className={editable ? 'cursor-pointer' : undefined}
                  /* Figma 2163:9998: la fila abre el drawer de edición. Los
                     controles propios de la celda (Toggle OEE, menú ⋯) siguen
                     mandando sobre el clic de la fila. */
                  onClick={(e) => {
                    if (!editable) return;
                    if ((e.target as HTMLElement).closest('button,a,input,[role="switch"]')) return;
                    setDrawer({ abierto: true, parada: p });
                  }}
                >
                  <TCell className="px-2 font-medium tabular">{hora(p.inicio)}</TCell>
                  <TCell className="px-2 tabular text-neutral-text">{hora(p.fin)}</TCell>
                  <TCell className="px-2 font-medium tabular whitespace-nowrap">
                    {p.fin ? `${p.duracionMin} min` : 'Abierta'}
                  </TCell>
                  <TCell className="px-2">
                    <Badge color={p.afectaOee ? 'critical' : 'neutral'}>
                      {p.afectaOee ? 'No planificada' : 'Planificada'}
                    </Badge>
                  </TCell>
                  <TCell
                    className="max-w-[150px] truncate"
                    title={`${p.causaCodigo} ${p.causaNombre}`}
                  >{`${p.causaCodigo} ${p.causaNombre}`}</TCell>
                  <TCell
                    className="max-w-[150px] truncate text-neutral-text"
                    title={p.accionTomada}
                  >
                    {p.accionTomada}
                  </TCell>
                  <TCell className="max-w-[110px] truncate text-neutral-text" title={p.responsableNombre}>
                    {p.responsableNombre}
                  </TCell>
                  <TCell className="px-2">
                    {p.evidenciaUrl ? (
                      <span className="inline-flex items-center gap-1.5 text-neutral-text">
                        <Icon name="file" size={16} />1
                      </span>
                    ) : (
                      <span className="text-text-disabled">—</span>
                    )}
                  </TCell>
                  <TCell>
                    <Switch
                      size="sm"
                      checked={p.afectaOee}
                      disabled={!editable || actualizar.isPending}
                      aria-label={`La parada de las ${hora(p.inicio)} afecta al cálculo de OEE`}
                      onCheckedChange={(v) => void alternarOee(p, v)}
                    />
                  </TCell>
                  <TCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Acciones de la parada de las ${hora(p.inicio)}`}
                        className="grid size-8 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        <Icon name="dots-horizontal" size={18} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          disabled={!editable}
                          onSelect={() => setDrawer({ abierto: true, parada: p })}
                        >
                          <Icon name="edit" size={16} />
                          Editar parada
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TCell>
                </TRow>
              ))}
            </TBody>
          </Table>

          <p className="text-body-sm text-text-secondary">
            {`Total ${formatNumber(resumen?.minutos ?? 0)} min en ${resumen?.cantidad ?? paradas.length} paradas · ${resumen?.afectanOee ?? 0} afectan el cálculo de OEE · Disponibilidad ${formatPct(disponibilidad)}`}
          </p>
        </>
      )}

      <ParadaDrawer
        open={drawer.abierto}
        onOpenChange={(abierto) => setDrawer((d) => ({ ...d, abierto }))}
        orden={orden}
        parada={drawer.parada}
      />
    </div>
  );
}

export function FilasSkeleton({ filas = 4 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
