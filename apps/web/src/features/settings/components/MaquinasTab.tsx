'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Icon,
  Input,
  SectionTitle,
  SelectInline,
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
import type { BadgeColor } from '@mes/ui';
import type { EstadoMaquina, Maquina } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useActualizarMaquina, useLineas, useMaquinas } from '@/features/catalogs/hooks';
import { EliminarMaquinaModal } from './EliminarMaquinaModal';
import { MaquinaDrawer } from './MaquinaDrawer';

const TODAS = '__todas__';

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

/** Pestaña "Máquinas" — tabla integrada + drawer de alta/edición (Figma 2165:11984). */
export function MaquinasTab() {
  const { data, isPending, error, refetch } = useMaquinas();
  const { data: lineas } = useLineas();
  const actualizar = useActualizarMaquina();
  const [busqueda, setBusqueda] = React.useState('');
  const [lineaId, setLineaId] = React.useState<string>(TODAS);
  const [verBajas, setVerBajas] = React.useState(false);
  const [drawer, setDrawer] = React.useState<{ maquina?: Maquina }>();
  const [eliminar, setEliminar] = React.useState<Maquina>();

  const nombreLinea = (id: string) => {
    const l = (lineas?.data ?? []).find((x) => x.id === id);
    return l ? `${l.codigo} · ${l.nombre}` : id;
  };

  const todas = data?.data ?? [];
  const bajas = todas.filter((m) => m.estado === 'baja').length;
  const filtro = busqueda.trim().toLowerCase();
  const maquinas = todas.filter(
    (m) =>
      (verBajas || m.estado !== 'baja') &&
      (lineaId === TODAS || m.lineaId === lineaId) &&
      (!filtro || `${m.codigo} ${m.nombre} ${m.tipo}`.toLowerCase().includes(filtro)),
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
        description={`${formatNumber(todas.length - bajas)} equipos en servicio · ${formatNumber(
          bajas,
        )} dados de baja · el código se usa al registrar paradas, mermas y órdenes`}
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
            <SelectInline
              label="Línea"
              options={[
                { value: TODAS, label: 'Todas' },
                ...(lineas?.data ?? []).map((l) => ({
                  value: l.id,
                  label: `${l.codigo} · ${l.nombre}`,
                })),
              ]}
              value={lineaId}
              onValueChange={setLineaId}
            />
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setDrawer({})}>
              Nueva máquina
            </Button>
          </div>
        }
      />

      <Switch
        label="Mostrar dadas de baja"
        supporting="Las máquinas de baja conservan su código en las paradas ya registradas."
        checked={verBajas}
        onCheckedChange={setVerBajas}
      />

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : todas.length === 0 ? (
        <EmptyState
          icon={<Icon name="cpu" size={40} />}
          title="Sin máquinas registradas"
          description="Crea la primera con «Nueva máquina»; el wizard de parada la pedirá."
        />
      ) : maquinas.length === 0 ? (
        <EmptyState
          variant="no-results"
          icon={<Icon name="search" size={40} />}
          title="Sin máquinas para esos filtros"
          description="Prueba con el código de la línea (MQ-LLENM2-01) o con el tipo de equipo."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setBusqueda('');
                setLineaId(TODAS);
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-[150px]">Código</TH>
              <TH className="min-w-[220px]">Máquina</TH>
              <TH className="w-[160px]">Tipo de equipo</TH>
              <TH className="w-[190px]">Línea</TH>
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
                      <DropdownMenuItem onSelect={() => setDrawer({ maquina: m })}>
                        <Icon name="edit" size={16} />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
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
                        onSelect={() => setEliminar(m)}
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

      <MaquinaDrawer
        open={drawer !== undefined}
        onOpenChange={(abierto) => {
          if (!abierto) setDrawer(undefined);
        }}
        maquina={drawer?.maquina}
      />

      {eliminar && (
        <EliminarMaquinaModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setEliminar(undefined);
          }}
          maquina={eliminar}
          onEliminada={() => setEliminar(undefined)}
        />
      )}
    </div>
  );
}
