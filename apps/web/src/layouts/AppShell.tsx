'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Avatar,
  Drawer,
  DrawerClose,
  DrawerContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  PageContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sidebar,
  SidebarFooterAction,
  Topbar,
  type SidebarGroup,
} from '@mes/ui';
import { ROLE_LABEL } from '@mes/types';
import { formatRelative } from '@mes/shared';
import { NAV_FOOTER, NAV_GROUPS, puedeVer, resolverItem } from '@/config/navigation';
import { useSession } from '@/hooks/use-session';
import { useAlertasRecientes, useAlertasResumen } from '@/features/alerts/hooks';
import {
  NotificationsPopover,
  mapAlertaANotificacion,
} from '@/features/alerts/components/NotificationsPopover';
import { useBreadcrumb } from './shell-context';

const SEARCH_ID = 'topbar-search';

/**
 * Shell de la aplicación — Sidebar 260 + Topbar 64 + `Content` (Figma 2147:5 /
 * 2149:13). A partir de `xl` (1280) la sidebar es fija; por debajo se oculta y
 * el botón hamburguesa de la topbar la abre como Drawer lateral izquierdo
 * (`Tiempo real / 1024`, 2163:1568), a ancho completo por debajo de `sm`.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, rol, logout } = useSession();
  const { counts } = useBreadcrumb();
  const [navAbierta, setNavAbierta] = React.useState(false);

  /* La navegación móvil se cierra al cambiar de ruta. */
  React.useEffect(() => setNavAbierta(false), [pathname]);

  /* Atajo ⌘K / Ctrl+K → foco en la búsqueda global. */
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      document.getElementById(SEARCH_ID)?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* Contador del ítem Alertas y de la campana: alertas activas
     (A3 · `useAlertasResumen`). `counts.alertas` deja que una vista lo
     sobrescriba con `useNavCount('alertas', n)`. */
  const { data: resumenAlertas } = useAlertasResumen();
  const alertas = counts.alertas ?? resumenAlertas?.activas;

  const grupos = React.useMemo<SidebarGroup[]>(
    () =>
      NAV_GROUPS.map((grupo) => ({
        label: grupo.label.toUpperCase(),
        items: grupo.items
          .filter((item) => puedeVer(item, rol))
          .map((item) => ({
            href: item.href,
            label: item.label,
            icon: <Icon name={item.icon} size={18} />,
            count: item.countKey === 'alertas' ? alertas : undefined,
          })),
      })).filter((grupo) => grupo.items.length > 0),
    [rol, alertas],
  );

  const activeHref = resolverItem(pathname)?.href ?? pathname;

  const salir = React.useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout, router]);

  const buscar = React.useCallback(
    (valor: string) => {
      const q = valor.trim();
      router.push(q ? `/ordenes?search=${encodeURIComponent(q)}` : '/ordenes');
    },
    [router],
  );

  const usuario = user ? { name: user.nombre, role: ROLE_LABEL[user.rol] } : undefined;

  const pie = (
    <>
      {NAV_FOOTER.map((accion) =>
        accion.href ? (
          <SidebarFooterAction
            key={accion.key}
            href={accion.href}
            target={accion.target}
            rel={accion.target === '_blank' ? 'noopener noreferrer' : undefined}
            linkComponent={accion.target === '_blank' ? 'a' : Link}
            icon={<Icon name={accion.icon} size={18} />}
          >
            {accion.label}
          </SidebarFooterAction>
        ) : (
          <SidebarFooterAction
            key={accion.key}
            onClick={salir}
            icon={<Icon name={accion.icon} size={18} />}
          >
            {accion.label}
          </SidebarFooterAction>
        ),
      )}
    </>
  );

  return (
    <div className="flex min-h-dvh w-full bg-background-main">
      <div className="sticky top-0 hidden h-dvh shrink-0 xl:block">
        <Sidebar
          groups={grupos}
          activeHref={activeHref}
          user={usuario}
          linkComponent={Link}
          footerActions={pie}
        />
      </div>

      <Drawer open={navAbierta} onOpenChange={setNavAbierta}>
        <DrawerContent
          side="left"
          hideHeader
          title="Navegación principal"
          className="w-full max-w-full sm:w-sidebar sm:max-w-[85vw] xl:hidden"
        >
          <DrawerClose
            aria-label="Cerrar navegación"
            className="absolute top-4 right-4 grid size-9 place-items-center rounded-md border border-border bg-background-main text-text-secondary hover:bg-background-subtle hover:text-text-primary sm:hidden"
          >
            <Icon name="x-mark" size={16} />
          </DrawerClose>
          <Sidebar
            groups={grupos}
            activeHref={activeHref}
            user={usuario}
            linkComponent={Link}
            footerActions={pie}
            className="w-full border-r-0"
          />
        </DrawerContent>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          className="sticky top-0 z-(--z-sticky)"
          onMenuClick={() => setNavAbierta(true)}
          onSearchSubmit={buscar}
          searchId={SEARCH_ID}
          site="Lima"
          notificationsSlot={<CampanaNotificaciones count={alertas} />}
          userSlot={usuario ? <MenuUsuario nombre={usuario.name} onSalir={salir} /> : undefined}
        />
        <PageContent>{children}</PageContent>
      </div>
    </div>
  );
}

/** Campana + `Popover / Notificaciones` 360 (Figma 2163:13982). */
function CampanaNotificaciones({ count }: { count?: number }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Notificaciones${count ? ` (${count})` : ''}`}
        className="relative grid size-9 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Icon name="bell-01" size={20} />
        {typeof count === 'number' && count > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-pill bg-error px-1 text-caption text-text-inverse">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-90 max-w-[92vw] p-0">
        <ContenidoNotificaciones total={count} />
      </PopoverContent>
    </Popover>
  );
}

/** Datos del popover: 3 alertas más recientes (A3 · useAlertasRecientes). */
function ContenidoNotificaciones({ total }: { total?: number }) {
  const { data, isPending } = useAlertasRecientes(3);
  const ahora = Date.now();
  const alertas = data?.data.map((a) => mapAlertaANotificacion(a, desde(a.generadaEn, ahora)));
  return <NotificationsPopover alertas={alertas} total={total} cargando={isPending} />;
}

/** `hace 4 min` · `ahora mismo` para eventos recién generados o con reloj adelantado. */
function desde(iso: string, ahora: number): string {
  const segundos = (ahora - new Date(iso).getTime()) / 1000;
  return segundos < 5 ? 'ahora mismo' : formatRelative(segundos);
}

/** Avatar con menú (Perfil · Salir) — mapa de navegación de `docs/figma-map.md`. */
function MenuUsuario({ nombre, onSalir }: { nombre: string; onSalir: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cuenta"
        className="shrink-0 rounded-pill focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Avatar name={nombre} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <Icon name="user" size={16} />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={onSalir}>
          <Icon name="logout" size={16} />
          Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
