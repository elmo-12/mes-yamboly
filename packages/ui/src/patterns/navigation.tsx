'use client';

import * as React from 'react';
import { Bell, ChevronDown, ChevronRight, CircleHelp, Menu, Search } from 'lucide-react';
import { cn } from '../utils/cn';
import { Avatar } from '../primitives/avatar';
import { Badge } from '../primitives/badge';

/* ------------------------------------------------------------------ Sidebar */

export interface SidebarItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Contador que se muestra como badge a la derecha (Alertas). */
  count?: number;
  countColor?: 'critical' | 'warning' | 'informational' | 'neutral';
}

export interface SidebarGroup {
  /** Overline del grupo: OPERACIÓN · CONTROL · ADMINISTRACIÓN. */
  label?: string;
  items: SidebarItem[];
}

export interface SidebarProps {
  groups: readonly SidebarGroup[];
  activeHref: string;
  user?: { name: string; role: string };
  /** Versión estrecha de 72 px (solo iconos). */
  collapsed?: boolean;
  /** Componente de enlace (p. ej. `next/link`). Por defecto `<a>`. */
  linkComponent?: React.ElementType;
  footerActions?: React.ReactNode;
  brand?: string;
  className?: string;
}

/**
 * MES / Sidebar (Figma 2147:5) — 260 px a alto completo, padding 20/16, gap 4.
 * Ítem 36 px, padding 9/10, gap 10, radio 8, icono **18**; inactivo `text/secondary`,
 * activo `primary/subtle` + `#1D4ED8`.
 */
export function Sidebar({
  groups,
  activeHref,
  user,
  collapsed = false,
  linkComponent,
  footerActions,
  brand = 'Yamboly MES',
  className,
}: SidebarProps) {
  const Link = (linkComponent ?? 'a') as React.ElementType;
  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'flex h-full shrink-0 flex-col gap-1 border-r border-divider bg-background-main px-4 py-5',
        collapsed ? 'w-sidebar-collapsed items-center px-3' : 'w-sidebar',
        className,
      )}
    >
      <div className={cn('flex items-center gap-2.5 pb-4', collapsed ? 'px-0' : 'px-2')}>
        <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-primary text-body-sm font-semibold text-primary-foreground">
          Y
        </span>
        {!collapsed && (
          <span className="text-body-md font-semibold text-text-primary">{brand}</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label ?? `g${gi}`} className="flex flex-col gap-1">
            {group.label && !collapsed && (
              <span className="px-5 pt-4 pb-2 text-overline text-text-disabled uppercase">
                {group.label}
              </span>
            )}
            {group.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex h-9 items-center rounded-sm px-2.5 text-body-md transition-colors duration-150 ease-standard',
                    collapsed ? 'justify-center px-0' : 'gap-2.5',
                    active
                      ? 'bg-primary-subtle text-info-text'
                      : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary',
                  )}
                >
                  <span className="grid size-icon-nav shrink-0 place-items-center [&_svg]:size-icon-nav">
                    {item.icon}
                  </span>
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  {!collapsed && typeof item.count === 'number' && item.count > 0 && (
                    <Badge color={item.countColor ?? 'critical'}>{item.count}</Badge>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-0.5 pt-2">
        {footerActions && !collapsed && (
          <div className="flex flex-col gap-0.5">{footerActions}</div>
        )}
        {user && (
          <div
            className={cn(
              'mt-2 flex items-center gap-2.5 rounded-sm p-2.5',
              collapsed && 'justify-center p-0',
            )}
          >
            <Avatar name={user.name} size={24} className="size-7 text-[11px]" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-text-primary">{user.name}</p>
                <p className="truncate text-caption font-normal text-text-secondary">{user.role}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

export interface SidebarFooterActionProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  'children'
> {
  icon: React.ReactNode;
  children?: React.ReactNode;
  /** Si se indica, el ítem se renderiza como enlace en vez de botón. */
  href?: string;
  target?: string;
  rel?: string;
  /** Componente de enlace (p. ej. `next/link`). Por defecto `<a>`. */
  linkComponent?: React.ElementType;
}

/** Ítem de acción del pie del sidebar (Perfil / Modo TV / Salir). */
export function SidebarFooterAction({
  icon,
  children,
  className,
  href,
  target,
  rel,
  linkComponent,
  ...props
}: SidebarFooterActionProps) {
  const Comp = (href ? (linkComponent ?? 'a') : 'button') as React.ElementType;
  const extra = href ? { href, target, rel } : { type: 'button' as const };
  return (
    <Comp
      {...extra}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-left text-body-md text-text-secondary',
        'transition-colors duration-150 ease-standard hover:bg-background-subtle hover:text-text-primary',
        className,
      )}
      {...props}
    >
      <span className="grid size-icon-nav shrink-0 place-items-center [&_svg]:size-icon-nav">
        {icon}
      </span>
      {children}
    </Comp>
  );
}

/* ------------------------------------------------------------------- Topbar */

export interface TopbarProps {
  breadcrumb?: React.ReactNode;
  onMenuClick?: () => void;
  onSearch?: (value: string) => void;
  /** Se dispara al pulsar Enter en la búsqueda global. */
  onSearchSubmit?: (value: string) => void;
  searchPlaceholder?: string;
  /** `id` del input de búsqueda, para el atajo ⌘K. */
  searchId?: string;
  notificationsCount?: number;
  onNotificationsClick?: () => void;
  /** Sustituye la campana (p. ej. por el disparador de un Popover). */
  notificationsSlot?: React.ReactNode;
  onHelpClick?: () => void;
  /** Sede activa, p. ej. "Lima". */
  site?: string;
  siteSlot?: React.ReactNode;
  user?: { name: string };
  /** Sustituye el avatar (p. ej. por el disparador de un DropdownMenu). */
  userSlot?: React.ReactNode;
  className?: string;
}

/**
 * MES / Topbar (Figma 2149:13) — 1180×64, padding-x 32, gap 16.
 * Search 320×36 sobre `background/subtle` radio 12 con icono 16; campana e
 * interrogante 20; avatar 32. El botón de menú solo aparece por debajo de 1280.
 */
export function Topbar({
  breadcrumb,
  onMenuClick,
  onSearch,
  onSearchSubmit,
  searchPlaceholder = 'Buscar OF, lote o línea…   ⌘K',
  searchId,
  notificationsCount = 0,
  onNotificationsClick,
  notificationsSlot,
  onHelpClick,
  site,
  siteSlot,
  user,
  userSlot,
  className,
}: TopbarProps) {
  return (
    <header
      className={cn(
        'flex h-topbar w-full shrink-0 items-center gap-4 border-b border-divider bg-background-main px-8',
        className,
      )}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú"
        className="grid size-9 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle xl:hidden"
      >
        <Menu className="size-icon-md" aria-hidden />
      </button>

      <form
        role="search"
        className="relative hidden w-80 shrink-0 md:block"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('q');
          if (input instanceof HTMLInputElement) onSearchSubmit?.(input.value);
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-icon-sm -translate-y-1/2 text-text-disabled"
          aria-hidden
        />
        <input
          id={searchId}
          name="q"
          type="search"
          aria-label="Búsqueda global"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch?.(e.target.value)}
          className="h-ctrl-sm w-full rounded-md bg-background-subtle pr-3 pl-9 text-body text-text-primary outline-none placeholder:text-text-disabled focus:shadow-focus"
        />
      </form>

      <div className="min-w-0 flex-1">{breadcrumb}</div>

      {siteSlot ??
        (site && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-body text-text-secondary lg:flex">
            Sede: <span className="font-medium text-text-primary">{site}</span>
            <ChevronDown className="size-icon-sm text-text-secondary" aria-hidden />
          </span>
        ))}

      {notificationsSlot ?? (
        <button
          type="button"
          onClick={onNotificationsClick}
          aria-label={`Notificaciones${notificationsCount ? ` (${notificationsCount})` : ''}`}
          className="relative grid size-9 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary"
        >
          <Bell className="size-icon-md" aria-hidden />
          {notificationsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-pill bg-error px-1 text-[10px] leading-4 font-medium text-text-inverse">
              {notificationsCount > 9 ? '9+' : notificationsCount}
            </span>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onHelpClick}
        aria-label="Ayuda"
        className="grid size-9 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary"
      >
        <CircleHelp className="size-icon-md" aria-hidden />
      </button>

      {userSlot ?? (user && <Avatar name={user.name} size={32} />)}
    </header>
  );
}

/* --------------------------------------------------------------- Breadcrumb */

export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: readonly Crumb[];
  linkComponent?: React.ElementType;
  className?: string;
}

/** MES / Breadcrumb (2149:31): crumbs 12/400 `text/secondary`, último `neutral/text`, chevron 14. */
export function Breadcrumb({ items, linkComponent, className }: BreadcrumbProps) {
  const Link = (linkComponent ?? 'a') as React.ElementType;
  return (
    <nav aria-label="Ruta" className={cn('flex items-center gap-1.5 text-body-sm', className)}>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={`${c.label}-${i}`}>
            {c.href && !last ? (
              <Link href={c.href} className="text-text-secondary hover:text-text-primary">
                {c.label}
              </Link>
            ) : (
              <span
                className={last ? 'text-neutral-text' : 'text-text-secondary'}
                aria-current={last ? 'page' : undefined}
              >
                {c.label}
              </span>
            )}
            {!last && (
              <ChevronRight className="size-icon-chip shrink-0 text-text-disabled" aria-hidden />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------- PageHeader */

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumb?: readonly Crumb[];
  /** Acciones a la derecha, gap 12. Un solo Button `primary` por pantalla. */
  actions?: React.ReactNode;
  /** Badge u otro elemento junto al título. */
  titleSlot?: React.ReactNode;
  linkComponent?: React.ElementType;
  className?: string;
}

/** MES / Page header (2149:39) — 1116×76: breadcrumb + H2 + subtítulo + acciones. */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  titleSlot,
  linkComponent,
  className,
}: PageHeaderProps) {
  return (
    /* `flex-wrap` en el contenedor y en las acciones: por debajo de ~420 px la
       botonera baja de línea en vez de desbordar el ancho de la página. */
    <div
      className={cn(
        'flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {breadcrumb && breadcrumb.length > 0 && (
          <Breadcrumb items={breadcrumb} linkComponent={linkComponent} />
        )}
        <div className="flex items-center gap-2.5">
          <h1 className="text-h2 text-text-primary">{title}</h1>
          {titleSlot}
        </div>
        {subtitle && <p className="text-body-sm text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- PageContent */

/**
 * Frame `Content` del shell (Figma): ancho 1180, padding 28/32/40/32, gap 24,
 * ancho útil 1116. Todas las pantallas MES cuelgan de aquí.
 */
export function PageContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex w-full flex-1 flex-col gap-6 bg-background-main px-8 pt-7 pb-10',
        className,
      )}
      {...props}
    />
  );
}
