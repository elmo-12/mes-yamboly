'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCard,
  Badge,
  Button,
  EmptyState,
  Icon,
  LineCard,
  type LineState,
} from '@mes/ui';
import type { EstadoLinea, User } from '@mes/types';
import { SEVERIDAD_ALERTA_LABEL } from '@mes/types';
import { formatNumber, formatPct, formatSpeed, turnoRango } from '@mes/shared';
import { useResumenMaquinista } from '../hooks';
import { HomeHeader } from './HomeHeader';
import { HomeSkeleton } from './HomeSkeleton';
import { KpiRow } from './KpiRow';
import { MisUltimosRegistros } from './MisUltimosRegistros';

const ESTADO_LINE_CARD: Record<EstadoLinea, LineState> = {
  produciendo: 'produciendo',
  parada: 'parada',
  alerta: 'alerta',
  sugerida: 'sugerida',
  sin_orden: 'sin-orden',
};

/**
 * `Home / Dashboard Maquinista / Default` (Figma 2165:769) — vista de maquinista
 * y encargado de merma: su línea en grande, tres KPI del turno y sus últimos
 * registros. La `Line card` conserva su Primary (excepción del MDS).
 */
export function DashboardMaquinista({ user }: { user: User }) {
  const router = useRouter();
  const resumen = useResumenMaquinista(user.lineaId ?? undefined);
  const linea = resumen.linea;

  if (resumen.isPending) return <HomeSkeleton variante="maquinista" />;

  if (resumen.isError) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar tu panel"
        description="El estado de tu línea no está disponible ahora mismo. Reintenta; si continúa, avisa al área de sistemas."
        action={
          <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={resumen.refetch}>
            Reintentar
          </Button>
        }
      />
    );
  }

  const subtitulo = linea
    ? [
        `${linea.lineaCodigo} · ${linea.lineaNombre}`,
        resumen.tiempoReal
          ? `Turno ${resumen.tiempoReal.turnoLabel} (${resumen.tiempoReal.turnoRango || turnoRango(resumen.tiempoReal.turno)})`
          : null,
        linea.orden?.productoNombre ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Sin línea asignada';

  return (
    <>
      <HomeHeader
        nombre={user.nombre}
        rolLabel={user.cargo}
        subtitulo={subtitulo}
        actions={
          <>
            <Button variant="secondary" asChild icon={<Icon name="stop-circle" />}>
              <Link href="/tiempo-real?accion=parada">Reportar parada</Link>
            </Button>
            <Button variant="secondary" asChild icon={<Icon name="plus" />}>
              <Link href="/tiempo-real?accion=merma">Registrar merma</Link>
            </Button>
          </>
        }
      />

      {!linea ? (
        <EmptyState
          icon={<Icon name="activity" size={40} />}
          title="No tienes una línea asignada"
          description="Pide a tu supervisor que te asigne una línea de producción para ver aquí su estado en tiempo real."
          action={
            <Button variant="secondary" asChild>
              <Link href="/tiempo-real">Ver todas las líneas</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex w-full flex-col items-stretch gap-4 lg:flex-row lg:items-start">
            <LineCard
              line={`${linea.lineaCodigo} · ${linea.lineaNombre}`}
              order={
                linea.orden
                  ? `${linea.orden.codigo} · ${linea.orden.productoNombre}`
                  : 'Sin orden activa'
              }
              state={ESTADO_LINE_CARD[linea.estado]}
              message={linea.alerta?.texto}
              metrics={[
                {
                  label: 'Producido',
                  value: `${formatNumber(linea.producido)} u`,
                  note: `${formatPct(linea.plan > 0 ? (linea.producido / linea.plan) * 100 : 0, 0)} del objetivo (${formatNumber(linea.plan)} u)`,
                },
                {
                  label: 'Velocidad',
                  value: formatSpeed(linea.velocidad),
                  note: `objetivo ${formatSpeed(linea.velocidadEstandar)}`,
                },
                {
                  label: 'Turno',
                  value: resumen.tiempoReal?.turnoLabel ?? '—',
                  note: resumen.tiempoReal?.turnoRango,
                },
              ]}
              segments={resumen.segmentos}
              actions={
                <>
                  <Button variant="primary" size="lg" block icon={<Icon name="stop-circle" />} asChild>
                    <Link href="/tiempo-real?accion=parada">Parada</Link>
                  </Button>
                  <Button variant="secondary" size="lg" block asChild>
                    <Link href="/tiempo-real?accion=merma">Merma</Link>
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    icon={<Icon name="dots-horizontal" />}
                    iconPosition="only"
                    aria-label="Más acciones de la línea"
                    onClick={() => router.push(`/tiempo-real?linea=${linea.lineaId}`)}
                  />
                </>
              }
              className="w-full lg:w-[548px] lg:shrink-0"
            />

            {resumen.alerta && (
              <AlertCard
                variant={resumen.alerta.severidad === 'critica' ? 'critical' : resumen.alerta.severidad === 'alta' ? 'warning' : 'info'}
                title={`${resumen.alerta.lineaCodigo} ${resumen.alerta.lineaNombre} · ${resumen.alerta.prediccion}`}
                description={resumen.alerta.factores[0]?.texto}
                badge={
                  <Badge
                    color={
                      resumen.alerta.severidad === 'critica'
                        ? 'critical'
                        : resumen.alerta.severidad === 'alta'
                          ? 'warning'
                          : 'informational'
                    }
                  >
                    {SEVERIDAD_ALERTA_LABEL[resumen.alerta.severidad]}
                  </Badge>
                }
                actionLabel="Ver alerta"
                onAction={() => router.push(`/alertas?id=${resumen.alerta?.id ?? ''}`)}
                className="min-w-0 flex-1"
              />
            )}
          </div>

          <KpiRow kpis={resumen.kpis} ancho="fixed" />

          <MisUltimosRegistros registros={resumen.registros} />
        </>
      )}
    </>
  );
}
