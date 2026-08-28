'use client';

import { Avatar, DescriptionList, KpiCard, Skeleton } from '@mes/ui';
import type { OrdenListItem, ParadaListItem } from '@mes/types';
import { TURNO_LABEL } from '@mes/types';
import { formatDate, formatDateTime, formatNumber, formatPct, formatSpeed } from '@mes/shared';
import { TurnoTimeline } from './TurnoTimeline';

export interface OrdenResumenTabProps {
  orden: OrdenListItem;
  paradas: readonly ParadaListItem[];
  cargandoParadas: boolean;
}

/** Pestaña Resumen del detalle de OF (Figma 2156:8959). */
export function OrdenResumenTab({ orden, paradas, cargandoParadas }: OrdenResumenTabProps) {
  const minutosParada = paradas.reduce((acc, p) => acc + p.duracionMin, 0);
  const cumplimiento = orden.planificado > 0 ? (orden.producido / orden.planificado) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="OEE de la orden"
          value={formatPct(orden.oee.oee)}
          delta={formatNumber(orden.oee.oee - 85, 1)}
          trend={orden.oee.oee >= 85 ? 'up' : 'down'}
          favorable={orden.oee.oee >= 85}
          context="vs meta 85,0 %"
        />
        <KpiCard
          label="Disponibilidad"
          value={formatPct(orden.oee.disponibilidad)}
          trend="flat"
          delta={`${formatNumber(minutosParada)} min`}
          context={`en ${paradas.length} paradas`}
        />
        <KpiCard
          label="Desempeño"
          value={formatPct(orden.oee.desempeno)}
          trend={orden.oee.desempeno >= 90 ? 'up' : 'down'}
          favorable={orden.oee.desempeno >= 90}
          delta={formatPct(orden.oee.desempeno - 90)}
          context="vs velocidad estándar"
        />
        <KpiCard
          label="Calidad"
          value={formatPct(orden.oee.calidad)}
          trend={orden.oee.calidad >= 98 ? 'up' : 'down'}
          favorable={orden.oee.calidad >= 98}
          delta={`${formatNumber(orden.mermasKg, 1)} kg`}
          context="de merma registrada"
        />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <KpiCard
          className="max-w-full xl:max-w-[267px]"
          label="Producido"
          value={`${formatNumber(orden.producido)} u`}
          delta={formatPct(cumplimiento)}
          trend={cumplimiento >= 95 ? 'up' : 'down'}
          favorable={cumplimiento >= 95}
          context={`del plan ${formatNumber(orden.planificado)} u`}
        />
        {cargandoParadas ? (
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-80" />
          </div>
        ) : (
          <TurnoTimeline inicio={orden.inicio} fin={orden.fin} paradas={paradas} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 xl:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary">Datos de la orden</h2>
          <DescriptionList
            labelWidth={200}
            items={[
              { label: 'Producto', value: orden.productoNombre },
              { label: 'Línea', value: `${orden.lineaCodigo} · ${orden.lineaNombre}` },
              { label: 'Lote', value: orden.lote },
              { label: 'Vencimiento', value: formatDate(orden.vencimiento) },
              {
                label: 'Velocidad estándar',
                value: formatSpeed(orden.velocidadEstandar),
              },
              {
                label: 'Planificado',
                value: `${formatNumber(orden.planificado)} u · turno ${TURNO_LABEL[orden.turno]}`,
              },
              { label: 'Inicio real', value: formatDateTime(orden.inicio) },
              { label: 'Fin real', value: orden.fin ? formatDateTime(orden.fin) : 'En curso' },
            ]}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary">Equipo</h2>
          <DescriptionList
            labelWidth={200}
            items={[
              { label: 'Maquinista', value: orden.maquinistaNombre },
              { label: 'Supervisor de línea', value: orden.supervisorNombre },
              { label: 'Operarios en línea', value: formatNumber(orden.operarios) },
              {
                label: 'Colaboradores',
                value: (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {orden.colaboradores.map((c) => (
                      <Avatar
                        key={c.id}
                        name={c.nombre}
                        size={24}
                        title={`${c.nombre} · ${c.rol}`}
                        tone={c.rol.startsWith('Operari') ? 'neutral' : 'primary'}
                      />
                    ))}
                    <span className="ml-1 text-body-sm text-text-secondary">
                      {`${orden.colaboradores.length} registrados en la OF`}
                    </span>
                  </div>
                ),
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
