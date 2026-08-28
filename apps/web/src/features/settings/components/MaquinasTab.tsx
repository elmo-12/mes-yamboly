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
  Input,
  SectionTitle,
  Skeleton,
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
  toast,
} from '@mes/ui';
import type { BadgeColor } from '@mes/ui';
import type { EstadoMaquina } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useActualizarMaquina, useLineas, useMaquinas } from '@/features/catalogs/hooks';
import { MaquinaDrawer } from './MaquinaDrawer';

const ESTADO_LABEL: Record<EstadoMaquina, string> = {
  operativa: 'Operativa',
  mantenimiento: 'Mantenimiento',
  baja: 'De baja',
};

const ESTADO_COLOR: Record<EstadoMaquina, BadgeColor> = {
  operativa: 'success',
  mantenimiento: 'warning',
  baja: 'neutral',
};

/** Pestaña "Máquinas" — tabla integrada + drawer de alta (Figma 2165:11984). */
export function MaquinasTab() {
  const { data, isPending, error, refetch } = useMaquinas();
  const { data: lineas } = useLineas();
  const actualizar = useActualizarMaquina();
  const [busqueda, setBusqueda] = React.useState('');
  const [drawer, setDrawer] = React.useState(false);

  const nombreLinea = (id: string) => {
    const l = (lineas?.data ?? []).find((x) => x.id === id);
    return l ? `${l.codigo} · ${l.nombre}` : id;
  };

  const filtro = busqueda.trim().toLowerCase();
  const maquinas = (data?.data ?? []).filter(
    (m) => !filtro || `${m.codigo} ${m.nombre} ${m.tipo}`.toLowerCase().includes(filtro),
  );

  const cambiarEstado = async (id: string, codigo: string, estado: EstadoMaquina) => {
    try {
      await actualizar.mutateAsync({ id, input: { estado } });
      toast.success(`${codigo} · ${ESTADO_LABEL[estado]}`);
    } catch {
      toast.error('No se pudo cambiar el estado de la máquina');
    }
  };

  if (error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el catálogo de máquinas"
        description="El servicio de catálogos no respondió. Reintenta en unos segundos."
        action={
          <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={() => void refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        className="flex-wrap gap-y-3"
        title="Máquinas y equipos"
        description={`${formatNumber(data?.data.length ?? 0)} equipos registrados · el código se usa al registrar paradas, mermas y órdenes`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input
              aria-label="Buscar máquina"
              className="w-full sm:w-[260px]"
              wrapperClassName="w-full sm:w-[260px]"
              placeholder="Buscar máquina o código"
              leadingIcon={<Icon name="search" size={16} />}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setDrawer(true)}>
              Nueva máquina
            </Button>
          </div>
        }
      />

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : maquinas.length === 0 ? (
        <EmptyState
          variant="no-results"
          icon={<Icon name="search" size={40} />}
          title="Sin máquinas para esa búsqueda"
          description="Prueba con el código de la línea (MQ-L2) o con el tipo de equipo."
          action={
            <Button variant="secondary" onClick={() => setBusqueda('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-[120px]">Código</TH>
              <TH className="min-w-[220px]">Máquina</TH>
              <TH className="w-[160px]">Tipo de equipo</TH>
              <TH className="w-[170px]">Línea</TH>
              <TH className="w-[130px]">Estado</TH>
              <TH numeric className="w-[110px]">
                Paradas 30 d
              </TH>
              <TH className="w-[60px]">
                <span className="sr-only">Acciones</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {maquinas.map((m) => (
              <TRow key={m.id}>
                <TCell className="font-medium tabular">{m.codigo}</TCell>
                <TCell>{m.nombre}</TCell>
                <TCell className="text-neutral-text">{m.tipo}</TCell>
                <TCell className="text-neutral-text">{nombreLinea(m.lineaId)}</TCell>
                <TCell>
                  <Badge color={ESTADO_COLOR[m.estado]}>{ESTADO_LABEL[m.estado]}</Badge>
                </TCell>
                <TCell numeric muted>
                  {formatNumber(m.paradas30d)}
                </TCell>
                <TCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Acciones de ${m.codigo}`}
                      className="grid size-8 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      <Icon name="dots-horizontal" size={18} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={m.estado === 'operativa'}
                        onSelect={() => void cambiarEstado(m.id, m.codigo, 'operativa')}
                      >
                        <Icon name="play-circle" size={16} />
                        Marcar operativa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={m.estado === 'mantenimiento'}
                        onSelect={() => void cambiarEstado(m.id, m.codigo, 'mantenimiento')}
                      >
                        <Icon name="settings" size={16} />
                        Enviar a mantenimiento
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={m.estado === 'baja'}
                        danger
                        onSelect={() => void cambiarEstado(m.id, m.codigo, 'baja')}
                      >
                        <Icon name="archive" size={16} />
                        Dar de baja
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}

      <MaquinaDrawer open={drawer} onOpenChange={setDrawer} />
    </div>
  );
}
