'use client';

import Link from 'next/link';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  type BadgeColor,
} from '@mes/ui';
import type { EstadoLinea, LineaEstado } from '@mes/types';
import { formatNumber, formatRatio, formatTime } from '@mes/shared';
import { colorPorAvance } from '@/components/charts';

/** Etiqueta y color del Badge de estado (frame 2163:19935). */
const ESTADO: Record<EstadoLinea, { label: string; color: BadgeColor }> = {
  produciendo: { label: 'Produciendo', color: 'success' },
  parada: { label: 'En parada', color: 'critical' },
  /* `Riesgo` = Warning en el MDS (igual que la Line card de Tiempo real). */
  alerta: { label: 'Riesgo', color: 'warning' },
  sugerida: { label: 'Sugerida', color: 'warning' },
  sin_orden: { label: 'Sin orden', color: 'neutral' },
};

/**
 * Anchos verificados en Figma; suman los 1116 px del contenido. La columna de
 * línea se ensancha respecto al frame para que el nombre real de la máquina
 * ("MOLD-A4 · Moldeadora A4") entre completo en una sola línea.
 */
const COLS = {
  linea: 'w-[200px]',
  estado: 'w-[120px]',
  of: 'w-[130px]',
  producto: 'w-[200px]',
  producido: 'w-[150px]',
  velocidad: 'w-[120px]',
  parada: 'w-[196px]',
} as const;

/** La tabla muestra u/h; el contrato entrega u/min. */
function velocidadHora(uPorMinuto: number): string {
  return `${formatNumber(Math.round(uPorMinuto * 60))} u/h`;
}

export interface EstadoLineasTableProps {
  lineas: readonly LineaEstado[];
  turnoLabel?: string;
}

/**
 * Tabla integrada "Estado de líneas" (Figma 2163:19935): cabecera 40, filas 44,
 * sin card. Añade la mini barra producido/plan de `design-system §3.2`, que el
 * frame resuelve solo con texto.
 */
export function EstadoLineasTable({ lineas, turnoLabel }: EstadoLineasTableProps) {
  return (
    <section className="flex w-full flex-col gap-4">
      <SectionTitle
        divider
        title="Estado de líneas"
        description={`Situación de las ${lineas.length} líneas de producción al minuto${
          turnoLabel ? ` · turno ${turnoLabel}` : ''
        }`}
      />

      {lineas.length === 0 ? (
        <EmptyState
          icon={<Icon name="activity" size={40} />}
          title="No hay líneas activas en este turno"
          description="Cuando se inicie una orden de fabricación, el estado de cada línea aparecerá aquí en tiempo real."
          action={
            <Button variant="secondary" asChild icon={<Icon name="arrow-right" />} iconPosition="trailing">
              <Link href="/tiempo-real">Ir a Tiempo real</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className={`${COLS.linea} normal-case`}>Línea</TH>
              <TH className={`${COLS.estado} normal-case`}>Estado</TH>
              <TH className={`${COLS.of} normal-case`}>OF</TH>
              <TH className={`${COLS.producto} normal-case`}>Producto</TH>
              <TH className={`${COLS.producido} normal-case`}>Producido / Plan</TH>
              <TH className={`${COLS.velocidad} normal-case`}>Velocidad</TH>
              <TH className={`${COLS.parada} normal-case`}>Última parada</TH>
            </tr>
          </THead>
          <TBody>
            {lineas.map((linea) => {
              const estado = ESTADO[linea.estado];
              const avance = linea.plan > 0 ? Math.min(100, (linea.producido / linea.plan) * 100) : 0;
              return (
                <TRow key={linea.lineaId}>
                  <TCell className={`${COLS.linea} font-medium whitespace-nowrap`}>
                    {linea.lineaCodigo} · {linea.lineaNombre}
                  </TCell>
                  <TCell className={COLS.estado}>
                    <Badge color={estado.color} dot>
                      {estado.label}
                    </Badge>
                  </TCell>
                  <TCell className={COLS.of}>
                    {linea.orden ? (
                      <Link
                        href={`/ordenes/${linea.orden.id}`}
                        className="font-medium text-text-link underline-offset-2 hover:underline"
                      >
                        {linea.orden.codigo}
                      </Link>
                    ) : (
                      <span className="text-text-disabled">—</span>
                    )}
                  </TCell>
                  <TCell className={`${COLS.producto} text-neutral-text`}>
                    {linea.orden?.productoNombre ?? <span className="text-text-disabled">—</span>}
                  </TCell>
                  <TCell className={COLS.producido}>
                    <div className="flex flex-col gap-1">
                      <span className="tabular text-neutral-text">
                        {formatRatio(linea.producido, linea.plan)}
                      </span>
                      <span className="h-1 w-full overflow-hidden rounded-xs bg-border" aria-hidden>
                        <span
                          className="block h-full rounded-xs"
                          style={{ width: `${avance}%`, backgroundColor: colorPorAvance(avance) }}
                        />
                      </span>
                    </div>
                  </TCell>
                  <TCell className={`${COLS.velocidad} tabular text-neutral-text`}>
                    {velocidadHora(linea.velocidad)}
                  </TCell>
                  <TCell className={COLS.parada}>
                    <div className="flex items-center gap-2">
                      <span className="tabular text-text-secondary">
                        {linea.ultimaParada
                          ? `${formatTime(linea.ultimaParada.inicio)} · ${linea.ultimaParada.causaCodigo}`
                          : '—'}
                      </span>
                      <span className="min-w-0 flex-1" />
                      <Link
                        href={`/tiempo-real?linea=${linea.lineaId}`}
                        aria-label={`Ver detalle de ${linea.lineaCodigo}`}
                        className="shrink-0 rounded-xs text-text-secondary hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        <Icon name="dots-horizontal" size={18} />
                      </Link>
                    </div>
                  </TCell>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      )}
    </section>
  );
}
