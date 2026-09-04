import * as React from 'react';
import { Badge, EmptyState, Icon, KpiCard, Skeleton, type BadgeColor } from '@mes/ui';
import type { EstadoKpi, KpiTesis, KpiTesisId } from '@mes/types';
import { formatNumber } from '@mes/shared';

export const ESTADO_KPI_BADGE: Record<EstadoKpi, BadgeColor> = {
  cumple: 'success',
  en_riesgo: 'warning',
  no_cumple: 'critical',
  sin_datos: 'neutral',
};

export const ESTADO_KPI_LABEL: Record<EstadoKpi, string> = {
  cumple: 'Cumple',
  en_riesgo: 'En riesgo',
  no_cumple: 'No cumple',
  sin_datos: 'Pendiente',
};

/** Texto único de los KPI todavía sin postest registrado. */
export const SIN_DATOS = 'Sin datos';

/** `1,4 min` · `93,3 %` · `Sin datos` cuando el postest aún no tiene registros. */
export function formatValorKpi(kpi: Pick<KpiTesis, 'valor' | 'unidad'>): string {
  if (kpi.valor === null) return SIN_DATOS;
  return `${formatNumber(kpi.valor, 1)} ${kpi.unidad}`.trim();
}

/**
 * Etiqueta corta de la KPI card (Figma 2156:5682): el overline cabe en una
 * línea, así que se usa un rótulo abreviado en vez del nombre completo.
 */
const ETIQUETA_CORTA: Record<KpiTesisId, string> = {
  TRI: 'TRI · Tiempo de registro',
  TCI: 'TCI · Calidad de registros',
  TSP: 'TSP · Satisfacción',
  CFS: 'CFS · Cumplimiento func.',
  EP: 'EP · Exactitud predic.',
};

/** Meta abreviada de la KPI card; el texto completo vive en la tabla resumen. */
const META_CORTA: Record<KpiTesisId, string> = {
  TRI: '≥ 40 % red.',
  TCI: '≥ 90 %',
  TSP: '≥ 80 %',
  CFS: '9 / 9',
  EP: '≥ 80 %',
};

export function etiquetaKpi(kpi: KpiTesis): string {
  return ETIQUETA_CORTA[kpi.id] ?? `${kpi.id} · ${kpi.nombre}`;
}

export function metaCorta(kpi: KpiTesis): string {
  return META_CORTA[kpi.id] ?? kpi.meta;
}

export interface KpiTesisCardProps {
  kpi: KpiTesis;
}

/**
 * Valor de una KPI card que admite `null`: el número se pierde el tamaño
 * `text-metric` para que «Sin datos» no desborde la tarjeta de 267 px.
 */
export function ValorKpi({ texto }: { texto: string }) {
  if (texto !== SIN_DATOS) return <>{texto}</>;
  return <span className="text-h3 text-text-secondary">{SIN_DATOS}</span>;
}

/** KPI card de la fila de Evidencia: valor + meta con Badge de estado + detalle. */
export function KpiTesisCard({ kpi }: KpiTesisCardProps) {
  return (
    <KpiCard
      label={etiquetaKpi(kpi)}
      value={<ValorKpi texto={formatValorKpi(kpi)} />}
      meta={
        <>
          <span>Meta {metaCorta(kpi)}</span>
          <Badge color={ESTADO_KPI_BADGE[kpi.estado]}>{ESTADO_KPI_LABEL[kpi.estado]}</Badge>
        </>
      }
      trend={kpi.estado === 'cumple' ? 'up' : 'flat'}
      favorable={kpi.estado === 'cumple'}
      context={kpi.detalle}
    />
  );
}

/** KPI card simple de las pestañas de anexo (sin depender de `KpiTesis`). */
export function KpiAnexoCard({
  label,
  value,
  meta,
  estado,
  context,
}: {
  label: string;
  /** `null` cuando el instrumento todavía no tiene registros: muestra «Sin datos». */
  value: React.ReactNode | null;
  meta?: string;
  estado?: EstadoKpi | 'referencia';
  context?: string;
}) {
  return (
    <KpiCard
      label={label}
      value={value === null ? <ValorKpi texto={SIN_DATOS} /> : value}
      meta={
        meta ? (
          <>
            <span>{meta}</span>
            {estado === 'referencia' ? (
              <Badge color="neutral">Referencia</Badge>
            ) : estado ? (
              <Badge color={ESTADO_KPI_BADGE[estado]}>{ESTADO_KPI_LABEL[estado]}</Badge>
            ) : null}
          </>
        ) : undefined
      }
      trend={estado === 'cumple' ? 'up' : 'flat'}
      favorable={estado === 'cumple'}
      context={context}
    />
  );
}

/** Fila de KPI card: 4 por fila (267×112 en Figma). */
export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

/** Skeleton compartido por las pestañas de anexo. */
export function AnexoSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-5 w-72" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Estado de error compartido por las pestañas de anexo. */
export function AnexoError({ anexo, onRetry }: { anexo: string; onRetry?: () => void }) {
  return (
    <EmptyState
      variant="error"
      icon={<Icon name="alert-circle" size={40} />}
      title={`No se pudo cargar el ${anexo}`}
      description="El instrumento no respondió. Reintenta; si continúa, avisa al área de sistemas."
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-body-md font-medium text-primary hover:underline"
          >
            Reintentar
          </button>
        ) : undefined
      }
    />
  );
}

/** Pie de tabla de los anexos: fórmula aplicada + navegación. */
export function PieAnexo({ texto, actions }: { texto: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
      <p className="text-body-sm text-text-secondary">{texto}</p>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Bloque de nota gris de los anexos (reglas, enlace de encuesta…). */
export function NotaAnexo({
  titulo,
  detalle,
  actions,
}: {
  titulo: string;
  detalle: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-background-subtle px-4 py-3.5">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body-md font-semibold text-text-primary">{titulo}</p>
        <p className="text-body-sm text-text-secondary">{detalle}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Paginación en cliente de las tablas de anexo (10 filas por página). */
export function usePaginaLocal<T>(items: readonly T[], pageSize = 10) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const paginaActual = Math.min(page, totalPages);
  const filas = items.slice((paginaActual - 1) * pageSize, paginaActual * pageSize);
  return { page: paginaActual, totalPages, filas, setPage, pageSize, total: items.length };
}
