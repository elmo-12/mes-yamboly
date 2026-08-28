'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Avatar,
  Badge,
  Button,
  Divider,
  Drawer,
  DrawerContent,
  EmptyState,
  Icon,
  Overline,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Timeline,
  type TimelineEvent,
} from '@mes/ui';
import type { LineaEstado, TimelineEvento, TipoEventoTimeline } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useOrden } from '@/features/orders/hooks';
import { useLineaTimeline } from '../hooks';
import { badgeLinea } from './linea-view';

const TONO_EVENTO: Record<TipoEventoTimeline, TimelineEvent['tone']> = {
  inicio_of: 'primary',
  fin_of: 'primary',
  parada: 'error',
  velocidad: 'success',
  merma: 'warning',
  alerta: 'warning',
};

const BADGE_ESTADO = {
  produciendo: 'success',
  parada: 'critical',
  sin_orden: 'neutral',
  alerta: 'warning',
  sugerida: 'warning',
} as const;

export interface LineaDrawerProps {
  linea: LineaEstado | null;
  turnoLabel: string;
  turnoRango: string;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  onRegistrarParada: () => void;
}

/**
 * `Tiempo real / Detalle de línea (drawer)` (Figma 2156:7548): Drawer 480 con
 * badges de estado, Tabs, 3 métricas y la cronología del turno.
 */
export function LineaDrawer({
  linea,
  turnoLabel,
  turnoRango,
  abierto,
  onOpenChange,
  onRegistrarParada,
}: LineaDrawerProps) {
  const { data: timeline, isPending } = useLineaTimeline(
    abierto && linea ? linea.lineaId : undefined,
  );
  const { data: orden } = useOrden(abierto && linea?.orden ? linea.orden.id : undefined);
  const eventos = timeline?.eventos ?? [];

  if (!linea) return null;

  const aTimeline = (lista: readonly TimelineEvento[]): TimelineEvent[] =>
    lista.map((e) => ({
      time: e.hora,
      title: e.titulo,
      description: e.detalle,
      tone: TONO_EVENTO[e.tipo],
      badge: e.duracionMin ? <Badge color="neutral">{`${e.duracionMin} min`}</Badge> : undefined,
    }));

  const avance = linea.plan > 0 ? Math.round((linea.producido / linea.plan) * 100) : 0;

  return (
    <Drawer open={abierto} onOpenChange={onOpenChange}>
      <DrawerContent
        title={`${linea.lineaCodigo} · ${linea.lineaNombre}`}
        aria-describedby={undefined}
        footer={
          <>
            {linea.orden ? (
              <Button variant="secondary" asChild>
                <Link href={`/ordenes/${linea.orden.id}`}>Ver historial</Link>
              </Button>
            ) : (
              <Button variant="secondary" disabled>
                Ver historial
              </Button>
            )}
            <Button variant="primary" onClick={onRegistrarParada}>
              Registrar parada
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge color={BADGE_ESTADO[linea.estado]} dot>
                {badgeLinea(linea)}
              </Badge>
              <Badge color="neutral" dot>{`Turno ${turnoLabel} ${turnoRango}`}</Badge>
            </div>
            <p className="text-body-sm text-text-secondary">
              {[
                linea.orden?.codigo,
                linea.orden?.productoNombre,
                linea.maquinistaNombre ? `${linea.maquinistaNombre} (Maquinista)` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Sin orden asignada en este turno'}
            </p>
          </div>

          <Tabs defaultValue="resumen">
            <TabsList>
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="paradas">Paradas</TabsTrigger>
              <TabsTrigger value="mermas">Mermas</TabsTrigger>
              <TabsTrigger value="velocidad">Velocidad</TabsTrigger>
              <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
            </TabsList>

            <TabsContent value="resumen" className="flex flex-col gap-5 pt-5">
              <div className="flex gap-3">
                <Metrica
                  label="Producido"
                  value={`${formatNumber(linea.producido)} u`}
                  nota={`${formatNumber(avance)} % de ${formatNumber(linea.plan)}`}
                />
                <Metrica
                  label="Velocidad"
                  value={`${formatNumber(linea.velocidad)} u/min`}
                  nota={`objetivo ${formatNumber(linea.velocidadEstandar)}`}
                />
                <Metrica
                  label="Paradas"
                  value={`${formatNumber(eventos.filter((e) => e.tipo === 'parada').length)}`}
                  nota={
                    linea.ultimaParada
                      ? `${linea.ultimaParada.causaCodigo} · ${formatNumber(linea.ultimaParada.duracionMin)} min`
                      : 'sin paradas en el turno'
                  }
                />
              </div>
              <Divider />
              <p className="text-h4 text-text-primary">Cronología del turno</p>
              <ListaEventos cargando={isPending} eventos={aTimeline(eventos)} vacio="Aún no hay eventos en este turno." />
            </TabsContent>

            {(['parada', 'merma', 'velocidad'] as const).map((tipo) => (
              <TabsContent
                key={tipo}
                value={tipo === 'parada' ? 'paradas' : tipo === 'merma' ? 'mermas' : 'velocidad'}
                className="pt-5"
              >
                <ListaEventos
                  cargando={isPending}
                  eventos={aTimeline(eventos.filter((e) => e.tipo === tipo))}
                  vacio={
                    tipo === 'parada'
                      ? 'Sin paradas registradas en el turno.'
                      : tipo === 'merma'
                        ? 'Sin mermas registradas en el turno.'
                        : 'Sin lecturas de velocidad en el turno.'
                  }
                />
              </TabsContent>
            ))}

            <TabsContent value="colaboradores" className="flex flex-col gap-3 pt-5">
              {orden?.colaboradores.length ? (
                orden.colaboradores.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <Avatar name={c.nombre} size={32} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body-md text-text-primary">{c.nombre}</span>
                      <span className="truncate text-body-sm text-text-secondary">{c.rol}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={<Icon name="user-group" size={40} />}
                  title="Sin equipo asignado"
                  description="La cuadrilla del turno se registra al iniciar la orden de fabricación."
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Metrica({ label, value, nota }: { label: string; value: string; nota: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-background-subtle p-3">
      <Overline>{label}</Overline>
      <span className="truncate text-btn-lg font-semibold tabular text-text-primary">
        {value}
      </span>
      <span className="truncate text-caption font-normal text-text-secondary">{nota}</span>
    </div>
  );
}

function ListaEventos({
  cargando,
  eventos,
  vacio,
}: {
  cargando: boolean;
  eventos: TimelineEvent[];
  vacio: string;
}) {
  if (cargando) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (eventos.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="inbox" size={40} />}
        title="Sin registros"
        description={vacio}
      />
    );
  }
  return <Timeline events={eventos} />;
}
