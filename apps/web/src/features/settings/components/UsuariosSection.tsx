'use client';

import * as React from 'react';
import {
  Avatar,
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
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
  Tooltip,
  TooltipProvider,
  toast,
} from '@mes/ui';
import type { BadgeColor } from '@mes/ui';
import { ROLES, ROLE_LABEL } from '@mes/types';
import type { Role, User } from '@mes/types';
import { formatDateTime, formatNumber } from '@mes/shared';
import { useCambiarEstadoUsuario, useLineas, useUsuarios } from '@/features/catalogs/hooks';
import { useSession } from '@/hooks/use-session';
import { DesactivarUsuarioModal } from './DesactivarUsuarioModal';
import { RestablecerPasswordModal } from './RestablecerPasswordModal';
import { UsuarioDrawer } from './UsuarioDrawer';

const TODOS = '__todos__';
const GUION = '—';

const ROL_COLOR: Record<Role, BadgeColor> = {
  jefe: 'accent',
  supervisor: 'informational',
  maquinista: 'neutral',
  calidad: 'success',
  mermas: 'warning',
  investigador: 'neutral',
};

const ESTADO_OPCIONES = [
  { value: TODOS, label: 'Todos' },
  { value: 'activo', label: 'Activos' },
  { value: 'inactivo', label: 'Inactivos' },
] as const;

/** `activo=true|false|undefined` según el filtro de estado (`GET /usuarios?activo=`). */
function activoDesde(filtro: string): boolean | undefined {
  if (filtro === 'activo') return true;
  if (filtro === 'inactivo') return false;
  return undefined;
}

/**
 * `Configuración / Usuarios` — directorio con alta, edición,
 * restablecimiento de contraseña y activación/desactivación. Es el único
 * `Button variant="primary"` de la pestaña.
 */
export function UsuariosSection() {
  const { user } = useSession();
  const [busqueda, setBusqueda] = React.useState('');
  const [rol, setRol] = React.useState<string>(TODOS);
  const [estado, setEstado] = React.useState<string>(TODOS);

  const usuarios = useUsuarios({
    rol: rol === TODOS ? undefined : [rol as Role],
    activo: activoDesde(estado),
  });
  const lineas = useLineas();
  const cambiarEstado = useCambiarEstadoUsuario();

  const [drawer, setDrawer] = React.useState<{ usuario?: User }>();
  const [password, setPassword] = React.useState<User>();
  const [desactivar, setDesactivar] = React.useState<User>();

  const nombreLinea = (id?: string | null) => {
    if (!id) return GUION;
    const l = (lineas.data?.data ?? []).find((x) => x.id === id);
    return l ? `${l.codigo} · ${l.nombre}` : id;
  };

  const filtro = busqueda.trim().toLowerCase();
  const filas = (usuarios.data?.data ?? []).filter(
    (u) => !filtro || `${u.nombre} ${u.email} ${u.dni} ${u.cargo}`.toLowerCase().includes(filtro),
  );
  const hayFiltros = filtro !== '' || rol !== TODOS || estado !== TODOS;

  const activar = async (usuario: User) => {
    try {
      await cambiarEstado.mutateAsync({ id: usuario.id, activo: true });
      toast.success(`${usuario.nombre} activado`, {
        description: 'Ya puede volver a iniciar sesión en el MES.',
      });
    } catch (error) {
      toast.error('No se pudo activar el usuario', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    }
  };

  const limpiar = () => {
    setBusqueda('');
    setRol(TODOS);
    setEstado(TODOS);
  };

  if (usuarios.error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el directorio"
        description="El servicio de usuarios no respondió. Reintenta en unos segundos."
        action={
          <Button
            variant="secondary"
            icon={<Icon name="arrow-path" />}
            onClick={() => void usuarios.refetch()}
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
        title="Usuarios"
        description={`${formatNumber(filas.length)} personas con acceso al MES · el rol define qué módulos ve cada una`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input
              aria-label="Buscar usuario"
              className="w-full sm:w-[240px]"
              wrapperClassName="w-full sm:w-[240px]"
              placeholder="Buscar nombre, correo o DNI"
              leadingIcon={<Icon name="search" size={16} />}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <SelectInline
              label="Rol"
              options={[
                { value: TODOS, label: 'Todos' },
                ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
              ]}
              value={rol}
              onValueChange={setRol}
            />
            <SelectInline
              label="Estado"
              options={ESTADO_OPCIONES}
              value={estado}
              onValueChange={setEstado}
            />
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setDrawer({})}>
              Nuevo usuario
            </Button>
          </div>
        }
      />

      {usuarios.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : filas.length === 0 ? (
        hayFiltros ? (
          <EmptyState
            variant="no-results"
            icon={<Icon name="search" size={40} />}
            title="Sin personas para esos filtros"
            description="Prueba con otro rol o estado, o busca por nombre, correo o DNI."
            action={
              <Button variant="secondary" onClick={limpiar}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Icon name="user-group" size={40} />}
            title="Sin personas en el directorio"
            description="Crea la primera con «Nuevo usuario»; el rol define qué módulos ve."
          />
        )
      ) : (
        <TooltipProvider>
          <Table density="dense">
            <THead>
              <tr>
                <TH className="min-w-[220px]">Persona</TH>
                <TH className="w-[220px]">Correo</TH>
                <TH className="w-[110px]">DNI</TH>
                <TH className="w-[150px]">Rol</TH>
                <TH className="w-[190px]">Cargo</TH>
                <TH className="w-[190px]">Línea asignada</TH>
                <TH className="w-[170px]">Último acceso</TH>
                <TH className="w-[110px]">Estado</TH>
                <TH className="w-[60px]">
                  <span className="sr-only">Acciones</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {filas.map((u) => {
                const esUnoMismo = u.id === user?.id;
                return (
                  <TRow key={u.id}>
                    <TCell>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={u.nombre} size={24} />
                        {u.nombre}
                      </span>
                    </TCell>
                    <TCell className="text-neutral-text">{u.email}</TCell>
                    <TCell className="tabular text-neutral-text">{u.dni}</TCell>
                    <TCell>
                      <Badge color={ROL_COLOR[u.rol]}>{ROLE_LABEL[u.rol]}</Badge>
                    </TCell>
                    <TCell className="text-neutral-text">{u.cargo}</TCell>
                    <TCell className="text-neutral-text">{nombreLinea(u.lineaId)}</TCell>
                    <TCell className="text-neutral-text">
                      {u.ultimoAcceso ? formatDateTime(u.ultimoAcceso) : GUION}
                    </TCell>
                    <TCell>
                      <Badge color={u.activo ? 'success' : 'neutral'}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TCell>
                    <TCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Acciones de ${u.nombre}`}
                          className="grid size-8 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                        >
                          <Icon name="dots-horizontal" size={18} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setDrawer({ usuario: u })}>
                            <Icon name="edit" size={16} />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setPassword(u)}>
                            <Icon name="shield-check" size={16} />
                            Restablecer contraseña
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.activo ? (
                            esUnoMismo ? (
                              /* El ítem deshabilitado no recibe puntero: el
                                 tooltip cuelga del envoltorio. La API responde
                                 422 igualmente si se intenta por otra vía. */
                              <Tooltip
                                content="No puedes desactivar tu propia cuenta"
                                supporting="Pídeselo a otro jefe de producción."
                              >
                                <span className="block">
                                  <DropdownMenuItem danger disabled>
                                    <Icon name="archive" size={16} />
                                    Desactivar
                                  </DropdownMenuItem>
                                </span>
                              </Tooltip>
                            ) : (
                              <DropdownMenuItem danger onSelect={() => setDesactivar(u)}>
                                <Icon name="archive" size={16} />
                                Desactivar
                              </DropdownMenuItem>
                            )
                          ) : (
                            <DropdownMenuItem onSelect={() => void activar(u)}>
                              <Icon name="play-circle" size={16} />
                              Activar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TCell>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        </TooltipProvider>
      )}

      <UsuarioDrawer
        open={drawer !== undefined}
        onOpenChange={(abierto) => {
          if (!abierto) setDrawer(undefined);
        }}
        usuario={drawer?.usuario}
      />

      {password && (
        <RestablecerPasswordModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setPassword(undefined);
          }}
          usuario={password}
        />
      )}

      {desactivar && (
        <DesactivarUsuarioModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDesactivar(undefined);
          }}
          usuario={desactivar}
          onDesactivado={() => setDesactivar(undefined)}
        />
      )}
    </section>
  );
}
