'use client';

import {
  Avatar,
  Badge,
  Button,
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
} from '@mes/ui';
import type { BadgeColor } from '@mes/ui';
import { ROLE_LABEL } from '@mes/types';
import type { Role } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useLineas, useSedes, useUsuarios } from '@/features/catalogs/hooks';

const ROL_COLOR: Record<Role, BadgeColor> = {
  jefe: 'accent',
  supervisor: 'informational',
  maquinista: 'neutral',
  calidad: 'success',
  mermas: 'warning',
  investigador: 'neutral',
};

/**
 * Pestaña "Sedes y usuarios": directorio de solo lectura. El alta y la baja de
 * personas se gestionan desde Personal / RR. HH.
 */
export function SedesUsuariosTab() {
  const sedes = useSedes();
  const usuarios = useUsuarios();
  const lineas = useLineas();

  const nombreLinea = (id?: string) => {
    if (!id) return '—';
    const l = (lineas.data?.data ?? []).find((x) => x.id === id);
    return l ? `${l.codigo} · ${l.nombre}` : id;
  };

  const nombreSede = (id: string) => sedes.data?.data.find((s) => s.id === id)?.nombre ?? id;

  if (usuarios.error || sedes.error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el directorio"
        description="El servicio de catálogos no respondió. Reintenta en unos segundos."
        action={
          <Button
            variant="secondary"
            icon={<Icon name="arrow-path" />}
            onClick={() => {
              void usuarios.refetch();
              void sedes.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Sedes"
          description="Plantas donde opera el MES; los catálogos de línea cuelgan de la sede."
        />
        {sedes.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Table density="dense">
            <THead>
              <tr>
                <TH className="w-[140px]">Código</TH>
                <TH className="min-w-[220px]">Sede</TH>
                <TH className="w-[160px]">Ciudad</TH>
                <TH numeric className="w-[110px]">
                  Líneas
                </TH>
                <TH className="w-[130px]">Estado</TH>
              </tr>
            </THead>
            <TBody>
              {(sedes.data?.data ?? []).map((s) => (
                <TRow key={s.id}>
                  <TCell className="font-medium tabular">{s.id}</TCell>
                  <TCell>{s.nombre}</TCell>
                  <TCell className="text-neutral-text">{s.ciudad}</TCell>
                  <TCell numeric muted>
                    {formatNumber(
                      (lineas.data?.data ?? []).filter((l) => l.sedeId === s.id).length,
                    )}
                  </TCell>
                  <TCell>
                    <Badge color={s.activa ? 'success' : 'neutral'}>
                      {s.activa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TCell>
                </TRow>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Usuarios"
          description={`${formatNumber(usuarios.data?.data.length ?? 0)} personas con acceso al MES · el rol define qué módulos ve cada una`}
        />
        {usuarios.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          <Table density="dense">
            <THead>
              <tr>
                <TH className="min-w-[220px]">Persona</TH>
                <TH className="w-[210px]">Correo</TH>
                <TH className="w-[170px]">Cargo</TH>
                <TH className="w-[160px]">Rol</TH>
                <TH className="w-[160px]">Línea asignada</TH>
                <TH className="w-[150px]">Sede</TH>
              </tr>
            </THead>
            <TBody>
              {(usuarios.data?.data ?? []).map((u) => (
                <TRow key={u.id}>
                  <TCell>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={u.nombre} size={24} />
                      {u.nombre}
                    </span>
                  </TCell>
                  <TCell className="text-neutral-text">{u.email}</TCell>
                  <TCell className="text-neutral-text">{u.cargo}</TCell>
                  <TCell>
                    <Badge color={ROL_COLOR[u.rol]}>{ROLE_LABEL[u.rol]}</Badge>
                  </TCell>
                  <TCell className="text-neutral-text">{nombreLinea(u.lineaId)}</TCell>
                  <TCell className="text-neutral-text">{nombreSede(u.sedeId)}</TCell>
                </TRow>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
