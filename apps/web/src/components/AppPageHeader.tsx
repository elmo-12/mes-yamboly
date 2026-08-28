'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader, type PageHeaderProps } from '@mes/ui';
import { buildBreadcrumbs } from '@/config/breadcrumbs';
import { useBreadcrumb } from '@/layouts/shell-context';

/**
 * `MES / Page header` (Figma 2149:39) con el breadcrumb resuelto desde la ruta.
 *
 * En Figma la migaja vive **dentro** de la cabecera de página (breadcrumb + H2 +
 * subtítulo), no en la topbar. Este envoltorio la calcula con
 * `buildBreadcrumbs` (o la toma del shell cuando una vista la sobrescribe con
 * `setCrumbs`) para que todas las pantallas del shell la muestren igual sin
 * repetir el cálculo en cada página. Acepta los mismos props que `PageHeader`:
 * pasar `breadcrumb` explícitamente sigue teniendo prioridad.
 */
export function AppPageHeader({ breadcrumb, linkComponent, ...props }: PageHeaderProps) {
  const pathname = usePathname();
  const { crumbs, labels } = useBreadcrumb();
  const migajas = breadcrumb ?? crumbs ?? buildBreadcrumbs(pathname, labels);

  return <PageHeader {...props} breadcrumb={migajas} linkComponent={linkComponent ?? Link} />;
}
