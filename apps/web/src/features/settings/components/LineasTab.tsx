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
import { TIPOS_PROCESO_LINEA, TIPO_PROCESO_LABEL } from '@mes/types';
import type { EstadoCatalogo, LineaListItem, TipoProcesoLinea } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useActualizarLinea, useLineas } from '@/features/catalogs/hooks';
import { DesactivarLineaModal } from './DesactivarLineaModal';
import { LineaDrawer } from './LineaDrawer';

const TODOS = '__todos__';

const ESTADO_LABEL: Record<EstadoCatalogo, string> = {
  activo: 'Activa',
  inactivo: 'Inactiva',
};

const ESTADO_COLOR: Record<EstadoCatalogo, BadgeColor> = {
  activo: 'success',
  inactivo: 'neutral',
};

const TIPO_COLOR: Record<TipoProcesoLinea, BadgeColor> = {
  llenadora: 'informational',
  extrusora: 'accent',
  moldeadora: 'neutral',
};

/**
 * Pestaña «Líneas» — mantenedor de las líneas de planta. La línea **es** la
 * máquina física: no existe un nivel de equipo por debajo, así que las paradas
 * se registran hasta aquí.
 */
export function LineasTab() {
  const { data, isPending, error, refetch } = useLineas();
  const actualizar = useActualizarLinea();
  const [busqueda, setBusqueda] = React.useState('');
  const [tipoProceso, setTipoProceso] = React.useState<string>(TODOS);
  const [verInactivas, setVerInactivas] = React.useState(false);
  const [drawer, setDrawer] = React.useState<{ linea?: LineaListItem }>();
  const [desactivar, setDesactivar] = React.useState<LineaListItem>();

  const todas = data?.data ?? [];
  const inactivas = todas.filter((l) => l.estado === 'inactivo').length;
  const filtro = busqueda.trim().toLowerCase();
  const lineas = todas.filter(
    (l) =>
      (verInactivas || l.estado !== 'inactivo') &&
      (tipoProceso === TODOS || l.tipoProceso === tipoProceso) &&
      (!filtro || `${l.codigo} ${l.nombre} ${l.nombreCorto}`.toLowerCase().includes(filtro)),
  );

  const activar = async (id: string, codigo: string) => {
    try {
      await actualizar.mutateAsync({ id, input: { estado: 'activo' } });
      toast.success(`${codigo} · ${ESTADO_LABEL.activo}`);
    } catch {
      toast.error('No se pudo cambiar el estado de la línea');
    }
  };

  if (error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el catálogo de líneas"
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
        title="Líneas de producción"
        description={`${formatNumber(todas.length - inactivas)} líneas activas · ${formatNumber(
          inactivas,
        )} inactivas · la línea es la máquina física y su código se usa en órdenes, paradas y mermas`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input
              aria-label="Buscar línea"
              className="w-full sm:w-[260px]"
              wrapperClassName="w-full sm:w-[260px]"
              placeholder="Buscar línea o código"
              leadingIcon={<Icon name="search" size={16} />}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <SelectInline
              label="Proceso"
              options={[
                { value: TODOS, label: 'Todos' },
                ...TIPOS_PROCESO_LINEA.map((t) => ({ value: t, label: TIPO_PROCESO_LABEL[t] })),
              ]}
              value={tipoProceso}
              onValueChange={setTipoProceso}
            />
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setDrawer({})}>
              Nueva línea
            </Button>
          </div>
        }
      />

      <Switch
        label="Mostrar inactivas"
        supporting="Las líneas inactivas conservan su código en las órdenes y paradas ya registradas."
        checked={verInactivas}
        onCheckedChange={setVerInactivas}
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
          title="Sin líneas registradas"
          description="Crea la primera con «Nueva línea»; las órdenes y el wizard de parada la pedirán."
        />
      ) : lineas.length === 0 ? (
        <EmptyState
          variant="no-results"
          icon={<Icon name="search" size={40} />}
          title="Sin líneas para esos filtros"
          description="Prueba con el código de la línea (LLEN-M2) o con otro tipo de proceso."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setBusqueda('');
                setTipoProceso(TODOS);
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
              <TH className="w-[130px]">Código</TH>
              <TH className="min-w-[200px]">Línea</TH>
              <TH className="w-[130px]">Nombre corto</TH>
              <TH className="w-[140px]">Proceso</TH>
              <TH numeric className="w-[150px]">
                Productos con velocidad
              </TH>
              <TH numeric className="w-[110px]">
                Paradas 30 d
              </TH>
              <TH className="w-[120px]">Estado</TH>
              <TH className="w-[60px]">
                <span className="sr-only">Acciones</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {lineas.map((l) => (
              <TRow key={l.id}>
                <TCell className="font-medium tabular">{l.codigo}</TCell>
                <TCell>{l.nombre}</TCell>
                <TCell className="text-neutral-text">{l.nombreCorto}</TCell>
                <TCell>
                  <Badge color={TIPO_COLOR[l.tipoProceso]}>
                    {TIPO_PROCESO_LABEL[l.tipoProceso]}
                  </Badge>
                </TCell>
                <TCell numeric muted>
                  {formatNumber(l.productosConVelocidad)}
                </TCell>
                <TCell numeric muted>
                  {formatNumber(l.paradas30d)}
                </TCell>
                <TCell>
                  <Badge color={ESTADO_COLOR[l.estado]}>{ESTADO_LABEL[l.estado]}</Badge>
                </TCell>
                <TCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Acciones de ${l.codigo}`}
                      className="grid size-8 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      <Icon name="dots-horizontal" size={18} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setDrawer({ linea: l })}>
                        <Icon name="edit" size={16} />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={l.estado === 'activo'}
                        onSelect={() => void activar(l.id, l.codigo)}
                      >
                        <Icon name="play-circle" size={16} />
                        Activar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={l.estado === 'inactivo'}
                        danger
                        onSelect={() => setDesactivar(l)}
                      >
                        <Icon name="archive" size={16} />
                        Desactivar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}

      <LineaDrawer
        open={drawer !== undefined}
        onOpenChange={(abierto) => {
          if (!abierto) setDrawer(undefined);
        }}
        linea={drawer?.linea}
      />

      {desactivar && (
        <DesactivarLineaModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDesactivar(undefined);
          }}
          linea={desactivar}
          onDesactivada={() => setDesactivar(undefined)}
        />
      )}
    </div>
  );
}
