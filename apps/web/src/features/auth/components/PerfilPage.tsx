'use client';

import * as React from 'react';
import {
  Avatar,
  Badge,
  Button,
  DescriptionList,
  EmptyState,
  Icon,
  SectionTitle,
  Skeleton,
  Switch,
  type BadgeColor,
} from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { ROLE_LABEL, type Role } from '@mes/types';
import { formatDateTime } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { useDensidad } from '@/hooks/use-densidad';
import { useLineas, useSedes } from '@/features/catalogs/hooks';
import { useLogout, useMe } from '../hooks';

const ROL_COLOR: Record<Role, BadgeColor> = {
  jefe: 'accent',
  supervisor: 'informational',
  maquinista: 'neutral',
  calidad: 'success',
  mermas: 'warning',
  investigador: 'neutral',
};

/**
 * `/perfil` — patrón Settings del MDS: la página es el contenedor, filas
 * label/valor con divisores (`DescriptionList`) y una sección por bloque.
 * Los datos vienen de `GET /auth/me`; sede y línea se resuelven con los
 * catálogos para mostrar el nombre en lugar del id.
 */
export function PerfilPage() {
  const { data: user, isPending, error, refetch } = useMe();
  const sedes = useSedes();
  const lineas = useLineas();
  const [densidad, setDensidad] = useDensidad();
  const logout = useLogout();

  const nombreSede = React.useMemo(
    () => sedes.data?.data.find((s) => s.id === user?.sedeId)?.nombre ?? user?.sedeId ?? '—',
    [sedes.data, user],
  );

  const nombreLinea = React.useMemo(() => {
    if (!user?.lineaId) return 'Todas las líneas';
    const linea = lineas.data?.data.find((l) => l.id === user.lineaId);
    return linea ? `${linea.codigo} ${linea.nombre}` : user.lineaId;
  }, [lineas.data, user]);

  if (error) {
    return (
      <>
        <Cabecera />
        <EmptyState
          variant="error"
          icon={<Icon name="alert-circle" size={40} />}
          title="No se pudo cargar tu perfil"
          description="El servicio de sesión no respondió. Reintenta en unos segundos."
          action={
            <Button
              variant="secondary"
              icon={<Icon name="arrow-path" />}
              onClick={() => void refetch()}
            >
              Reintentar
            </Button>
          }
        />
      </>
    );
  }

  if (isPending || !user) {
    return (
      <>
        <Cabecera />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-64" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <Cabecera />

      <div className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <SectionTitle
            title="Datos de la cuenta"
            description="Los gestiona el Jefe de producción desde Configuración → Sedes y usuarios"
          />
          <DescriptionList
            labelWidth={220}
            items={[
              {
                label: 'Nombre',
                value: (
                  <span className="flex items-center gap-3">
                    <Avatar name={user.nombre} size={32} />
                    {user.nombre}
                  </span>
                ),
              },
              { label: 'Correo', value: user.email },
              { label: 'DNI', value: user.dni },
              { label: 'Rol', value: <Badge color={ROL_COLOR[user.rol]}>{ROLE_LABEL[user.rol]}</Badge> },
              { label: 'Cargo', value: user.cargo },
              { label: 'Sede', value: nombreSede },
              { label: 'Línea asignada', value: nombreLinea },
              {
                label: 'Último acceso',
                value: user.ultimoAcceso ? formatDateTime(user.ultimoAcceso) : '—',
              },
            ]}
          />
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            title="Preferencias"
            description="Se guardan en este navegador; no afectan a los demás usuarios"
          />
          <DescriptionList
            labelWidth={320}
            items={[
              {
                label: (
                  <span className="flex flex-col gap-0.5">
                    <span className="text-body text-text-primary">Densidad compacta</span>
                    <span className="text-body-sm text-text-secondary">
                      Filas de tabla más bajas para ver más registros por pantalla
                    </span>
                  </span>
                ),
                value: (
                  <Switch
                    checked={densidad === 'compact'}
                    onCheckedChange={(activo) => setDensidad(activo ? 'compact' : 'standard')}
                    label={densidad === 'compact' ? 'Activada' : 'Desactivada'}
                  />
                ),
              },
            ]}
          />
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            title="Sesión"
            description="Se cerrará la sesión en este dispositivo y volverás a la pantalla de acceso"
          />
          <div>
            <Button
              variant="secondary"
              icon={<Icon name="logout" />}
              loading={logout.isPending}
              onClick={() => logout.mutate()}
            >
              Cerrar sesión
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function Cabecera() {
  return (
    <AppPageHeader
      title="Perfil"
      subtitle="Datos de la cuenta, rol asignado y preferencias de esta sesión"
      breadcrumb={[{ label: 'Inicio', href: '/' }, { label: 'Perfil' }]}
      linkComponent={AppLink}
    />
  );
}
