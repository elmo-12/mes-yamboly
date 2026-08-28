'use client';

import {
  Badge,
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
import { TIPO_MERMA_LABEL } from '@mes/types';
import type { MermaListItem } from '@mes/types';
import { formatKg, formatNumber } from '@mes/shared';
import { hora } from '../format';
import { FilasSkeleton } from './OrdenParadasTab';

const TIPO_COLOR = { MP: 'informational', EP: 'warning', PT: 'accent' } as const;

export interface OrdenMermasTabProps {
  mermas: readonly MermaListItem[];
  resumen?: { cantidad: number; kg: number };
  cargando: boolean;
  /** kg producidos, para el porcentaje de merma sobre producción. */
  producidoKg?: number;
}

/** Pestaña Mermas del detalle de OF — tabla equivalente a la de paradas. */
export function OrdenMermasTab({ mermas, resumen, cargando }: OrdenMermasTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Mermas registradas"
        description="Clasificadas por tipo (MP · EP · PT) y causa codificada MR-01…MR-04 (RF4)."
      />

      {cargando ? (
        <FilasSkeleton filas={2} />
      ) : mermas.length === 0 ? (
        <EmptyState
          icon={<Icon name="package" size={40} />}
          title="Sin mermas registradas en esta orden"
          description="La OF cerró sin producto descartado o el registro aún no se ha hecho desde la línea."
        />
      ) : (
        <>
          <Table density="dense">
            <THead>
              <tr>
                <TH className="w-[92px]">Hora</TH>
                <TH className="w-[150px]">Tipo</TH>
                <TH numeric className="w-[110px]">
                  Cantidad
                </TH>
                <TH className="w-[120px]">Sabor</TH>
                <TH className="min-w-[200px]">Causa</TH>
                <TH className="w-[150px]">Responsable</TH>
                <TH className="w-[140px]">Balde</TH>
                <TH className="w-[150px]">Pasteurización</TH>
              </tr>
            </THead>
            <TBody>
              {mermas.map((m) => (
                <TRow key={m.id}>
                  <TCell className="font-medium tabular">{hora(m.registradaEn)}</TCell>
                  <TCell>
                    <Badge color={TIPO_COLOR[m.tipo]}>
                      {`${m.tipo} · ${TIPO_MERMA_LABEL[m.tipo]}`}
                    </Badge>
                  </TCell>
                  <TCell numeric className="font-medium">
                    {formatKg(m.cantidadKg)}
                  </TCell>
                  <TCell className="text-neutral-text">{m.sabor}</TCell>
                  <TCell>{`${m.causaCodigo} ${m.causaNombre}`}</TCell>
                  <TCell className="text-neutral-text">{m.responsableNombre}</TCell>
                  <TCell className="text-neutral-text">{m.codigoBalde ?? '—'}</TCell>
                  <TCell>
                    {m.enviarPasteurizacion ? (
                      <Badge color="success">Enviada</Badge>
                    ) : (
                      <span className="text-text-disabled">No aplica</span>
                    )}
                  </TCell>
                </TRow>
              ))}
            </TBody>
          </Table>

          <p className="text-body-sm text-text-secondary">
            {`Total ${formatKg(resumen?.kg ?? 0)} en ${formatNumber(resumen?.cantidad ?? mermas.length)} registros · ${formatNumber(mermas.filter((m) => m.enviarPasteurizacion).length)} enviados a pasteurización`}
          </p>
        </>
      )}
    </div>
  );
}
