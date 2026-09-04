import type { IconName } from '@mes/ui';
import type { Role } from '@mes/types';

/** Ítem de navegación del shell. `roles` ausente = visible para todos los roles. */
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles?: readonly Role[];
  /** Clave del contador opcional que se pinta como Badge a la derecha. */
  countKey?: 'alertas';
}

export interface NavGroup {
  /** Overline del grupo (también se usa como migaja intermedia). */
  label: string;
  items: readonly NavItem[];
}

/**
 * Navegación principal — `MES / Sidebar` (Figma 2147:5): 3 grupos y 10 ítems.
 * El orden y los iconos son los del componente de Figma.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Operación',
    items: [
      { href: '/', label: 'Inicio', icon: 'home-01' },
      { href: '/tiempo-real', label: 'Tiempo real', icon: 'activity' },
      { href: '/alertas', label: 'Alertas', icon: 'bell-01', countKey: 'alertas' },
    ],
  },
  {
    label: 'Control',
    items: [
      { href: '/ordenes', label: 'Órdenes de fabricación', icon: 'file' },
      { href: '/reportes', label: 'Reportes', icon: 'chart-alt2' },
      {
        href: '/analitica',
        label: 'Analítica IA',
        icon: 'insight',
        roles: ['jefe', 'supervisor', 'investigador'],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        href: '/configuracion',
        label: 'Configuración',
        icon: 'settings-02',
        roles: ['jefe', 'supervisor'],
      },
      {
        href: '/evidencia',
        label: 'Evidencia de tesis',
        icon: 'clipboard',
        roles: ['jefe', 'investigador'],
      },
    ],
  },
] as const;

/** Acciones del pie del sidebar. */
export interface NavFooterAction {
  key: 'perfil' | 'tv' | 'salir';
  label: string;
  icon: IconName;
  href?: string;
  target?: '_blank';
}

export const NAV_FOOTER: readonly NavFooterAction[] = [
  { key: 'perfil', label: 'Perfil', icon: 'user', href: '/perfil' },
  { key: 'tv', label: 'Modo TV', icon: 'monitor', href: '/tv', target: '_blank' },
  { key: 'salir', label: 'Salir', icon: 'logout' },
] as const;

/** Todos los ítems en una lista plana (para resolver el activo y las migajas). */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** `true` si el rol puede ver el ítem. Sin sesión solo se ven los ítems abiertos. */
export function puedeVer(item: NavItem, rol: Role | null): boolean {
  if (!item.roles) return true;
  return rol !== null && item.roles.includes(rol);
}

/** Roles permitidos de una ruta del shell (para `useRequireRole` y `RoleGate`). */
export function rolesDeRuta(pathname: string): readonly Role[] | undefined {
  return resolverItem(pathname)?.roles;
}

/**
 * Ítem activo por prefijo de ruta: `/ordenes/OF-2026-0815` activa `/ordenes`.
 * `/` solo coincide de forma exacta.
 */
export function resolverItem(pathname: string): NavItem | undefined {
  const candidatos = NAV_ITEMS.filter((item) =>
    item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return candidatos.sort((a, b) => b.href.length - a.href.length)[0];
}

/** Grupo al que pertenece la ruta (migaja intermedia del breadcrumb). */
export function resolverGrupo(pathname: string): NavGroup | undefined {
  const item = resolverItem(pathname);
  if (!item) return undefined;
  return NAV_GROUPS.find((g) => g.items.some((i) => i.href === item.href));
}
