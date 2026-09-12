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

export interface OrdenVelocidadesTabProps {
  orden: OrdenListItem;
  velocidades: readonly RegistroVelocidadListItem[];
  cargando: boolean;
}

/**
 * Pestaña Velocidades: las lecturas de velocidad de la OF (`registro_velocidad`),
 * con su desvío frente al estándar congelado en la orden. No es consumo de
 * insumos — el contrato de API no expone esa lista (no hay
 * `GET /ordenes/:id/consumo`) y el dato que sí llega de la línea es la velocidad.
 */
export function OrdenVelocidadesTab({ orden, velocidades, cargando }: OrdenVelocidadesTabProps) {
  if (cargando) return <FilasSkeleton filas={3} />;

  if (velocidades.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="gauge" size={40} />}
        title="Sin lecturas de velocidad"
        description="Esta orden no tiene lecturas de velocidad sincronizadas desde la línea."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Lecturas de velocidad de la línea"
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
