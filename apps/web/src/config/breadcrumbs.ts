import type { Crumb } from '@mes/ui';
import { resolverGrupo, resolverItem } from './navigation';

/**
 * Etiquetas en español por segmento de ruta. Las rutas dinámicas
 * (`ordenes/[id]`) no están aquí: su etiqueta la registra la página con
 * `useBreadcrumbLabel` (ver `layouts/shell-context.tsx`).
 */
export const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  '': 'Inicio',
  'tiempo-real': 'Tiempo real',
  alertas: 'Alertas',
  ordenes: 'Órdenes',
  reportes: 'Reportes',
  analitica: 'Analítica IA',
  configuracion: 'Configuración',
  evidencia: 'Evidencia de tesis',
  perfil: 'Perfil',
  tv: 'Modo TV',
};

/** Migaja raíz, siempre presente. */
const INICIO: Crumb = { label: 'Inicio', href: '/' };

/**
 * Construye el breadcrumb desde la ruta: `Inicio › Grupo › Sección` en las
 * pantallas de primer nivel (patrón de `MES / Page header`, Figma 2149:39) y
 * `Inicio › Sección › Detalle` en las de detalle, donde el grupo se omite para
 * dejar sitio al identificador (p. ej. `Inicio › Órdenes › OF-2026-0815`).
 *
 * `labels` sobrescribe la etiqueta de un segmento concreto — así la página de
 * `/ordenes/[id]` publica el código real de la OF.
 */
export function buildBreadcrumbs(
  pathname: string,
  labels: Readonly<Record<string, string>> = {},
): Crumb[] {
  const segmentos = pathname.split('/').filter(Boolean);
  if (segmentos.length === 0) return [{ label: 'Inicio' }];

  const crumbs: Crumb[] = [INICIO];

  if (segmentos.length === 1) {
    const grupo = resolverGrupo(pathname);
    if (grupo) crumbs.push({ label: grupo.label });
  }

  let href = '';
  segmentos.forEach((segmento, i) => {
    href += `/${segmento}`;
    const ultimo = i === segmentos.length - 1;
    crumbs.push({
      label: etiquetaDeSegmento(segmento, href, labels),
      href: ultimo ? undefined : href,
    });
  });

  return crumbs;
}

function etiquetaDeSegmento(
  segmento: string,
  href: string,
  labels: Readonly<Record<string, string>>,
): string {
  return (
    labels[segmento] ??
    SEGMENT_LABELS[segmento] ??
    resolverItem(href)?.label ??
    decodeURIComponent(segmento)
  );
}
