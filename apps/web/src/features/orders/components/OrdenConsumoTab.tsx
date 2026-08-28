'use client';

import {
  EmptyState,
  Icon,
  SectionTitle,
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
} from '@mes/ui';
import type { OrdenListItem, RegistroVelocidadListItem } from '@mes/types';
import { formatNumber, formatPct, formatSpeed } from '@mes/shared';
import { hora } from '../format';
import { FilasSkeleton } from './OrdenParadasTab';

export interface OrdenConsumoTabProps {
  orden: OrdenListItem;
  velocidades: readonly RegistroVelocidadListItem[];
  cargando: boolean;
}

/**
 * Pestaña Consumo. El contrato de API no expone todavía la lista de insumos
 * (no hay `GET /ordenes/:id/consumo`), así que se muestra el consumo de
 * capacidad de la línea con los registros de velocidad de la OF, que sí son
 * datos reales de la orden; sin ellos, empty state.
 */
export function OrdenConsumoTab({ orden, velocidades, cargando }: OrdenConsumoTabProps) {
  if (cargando) return <FilasSkeleton filas={3} />;

  if (velocidades.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="boxes" size={40} />}
        title="Sin datos de consumo registrados"
        description="Esta orden no tiene lecturas de velocidad ni consumo de insumos sincronizados desde la línea."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Consumo de capacidad de la línea"
        description={`Velocidad estándar ${formatSpeed(orden.velocidadEstandar)} · ${velocidades.length} lecturas del turno`}
      />
      <Table density="dense">
        <THead>
          <tr>
            <TH className="w-[92px]">Hora</TH>
            <TH numeric className="w-[130px]">
              Velocidad real
            </TH>
            <TH numeric className="w-[130px]">
              Estándar
            </TH>
            <TH numeric className="w-[110px]">
              Desvío
            </TH>
            <TH className="min-w-[220px]">Motivo</TH>
            <TH className="w-[150px]">Responsable</TH>
          </tr>
        </THead>
        <TBody>
          {velocidades.map((v) => (
            <TRow key={v.id}>
              <TCell className="font-medium tabular">{hora(v.registradaEn)}</TCell>
              <TCell numeric className="font-medium">
                {formatNumber(v.velocidadReal)}
              </TCell>
              <TCell numeric muted>
                {formatNumber(v.velocidadEstandar)}
              </TCell>
              <TCell
                numeric
                className={v.desvioPct < 0 ? 'font-medium text-warning-text' : 'font-medium text-success-text'}
              >
                {formatPct(v.desvioPct)}
              </TCell>
              <TCell className="text-neutral-text">{v.motivo ?? '—'}</TCell>
              <TCell className="text-neutral-text">{v.responsableNombre}</TCell>
            </TRow>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
