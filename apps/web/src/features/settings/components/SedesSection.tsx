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
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
  toast,
} from '@mes/ui';
import type { Sede } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useActualizarSede, useLineas, useSedes, useUsuarios } from '@/features/catalogs/hooks';
import { DesactivarSedeModal } from './DesactivarSedeModal';
import { SedeDrawer } from './SedeDrawer';

/**
 * `Configuración / Sedes y usuarios` — sección de sedes (9 plantas reales).
 * El alta usa `Button variant="secondary"`: el único Primary de la pestaña es
 * «Nuevo usuario», la acción principal del directorio.
 */
export function SedesSection() {
  const sedes = useSedes();
  const usuarios = useUsuarios();
  const lineas = useLineas();
  const actualizar = useActualizarSede();
  const [drawer, setDrawer] = React.useState<{ sede?: Sede }>();
  const [desactivar, setDesactivar] = React.useState<Sede>();

  const filas = sedes.data?.data ?? [];

  const usuariosPorSede = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const u of usuarios.data?.data ?? []) {
      mapa.set(u.sedeId, (mapa.get(u.sedeId) ?? 0) + 1);
    }
    return mapa;
  }, [usuarios.data]);

  const activar = async (sede: Sede) => {
    try {
      await actualizar.mutateAsync({ id: sede.id, input: { activa: true } });
      toast.success(`Sede ${sede.codigo} activada`, {
        description: 'Vuelve a ofrecerse al dar de alta usuarios.',
      });
    } catch (error) {
      toast.error('No se pudo activar la sede', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    }
  };

  if (sedes.error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudieron cargar las sedes"
        description="El servicio de catálogos no respondió. Reintenta en unos segundos."
        action={
          <Button
            variant="secondary"
            icon={<Icon name="arrow-path" />}
            onClick={() => void sedes.refetch()}
          >
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        className="flex-wrap gap-y-3"
        title="Sedes"
        description={`${formatNumber(filas.length)} plantas donde opera el MES · los catálogos de línea cuelgan de la sede`}
        actions={
          <Button variant="secondary" icon={<Icon name="plus" />} onClick={() => setDrawer({})}>
            Nueva sede
          </Button>
        }
      />

      {sedes.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : filas.length === 0 ? (
        <EmptyState
          icon={<Icon name="boxes" size={40} />}
          title="Sin sedes registradas"
          description="Crea la primera con «Nueva sede»; las líneas y los usuarios cuelgan de ella."
        />
      ) : (
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-[120px]">Código</TH>
              <TH className="min-w-[220px]">Sede</TH>
              <TH className="w-[160px]">Ciudad</TH>
              <TH numeric className="w-[110px]">
                Líneas
              </TH>
              <TH numeric className="w-[130px]">
                Usuarios
              </TH>
              <TH className="w-[130px]">Estado</TH>
              <TH className="w-[60px]">
                <span className="sr-only">Acciones</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {filas.map((s) => (
              <TRow key={s.id}>
                <TCell className="font-medium tabular">{s.codigo}</TCell>
                <TCell>{s.nombre}</TCell>
                <TCell className="text-neutral-text">{s.ciudad}</TCell>
                <TCell numeric muted>
                  {formatNumber((lineas.data?.data ?? []).filter((l) => l.sedeId === s.id).length)}
                </TCell>
                <TCell numeric muted>
                  {formatNumber(usuariosPorSede.get(s.id) ?? 0)}
                </TCell>
                <TCell>
                  <Badge color={s.activa ? 'success' : 'neutral'}>
                    {s.activa ? 'Activa' : 'Inactiva'}
                  </Badge>
                </TCell>
                <TCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Acciones de ${s.codigo}`}
                      className="grid size-8 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      <Icon name="dots-horizontal" size={18} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setDrawer({ sede: s })}>
                        <Icon name="edit" size={16} />
                        Editar
                      </DropdownMenuItem>
                      {s.activa ? (
                        <DropdownMenuItem danger onSelect={() => setDesactivar(s)}>
                          <Icon name="archive" size={16} />
                          Desactivar
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => void activar(s)}>
                          <Icon name="play-circle" size={16} />
                          Activar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}

      <SedeDrawer
        open={drawer !== undefined}
        onOpenChange={(abierto) => {
          if (!abierto) setDrawer(undefined);
        }}
        sede={drawer?.sede}
      />

      {desactivar && (
        <DesactivarSedeModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDesactivar(undefined);
          }}
          sede={desactivar}
          usuariosAsignados={usuariosPorSede.get(desactivar.id) ?? 0}
          onDesactivada={() => setDesactivar(undefined)}
        />
      )}
    </section>
  );
}
