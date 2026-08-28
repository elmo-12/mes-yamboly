'use client';

import { Badge, EmptyState, Icon, SectionTitle, TBody, TCell, TH, THead, TRow, Table } from '@mes/ui';
import { formatRelative } from '@mes/shared';
import type { RegistroPropio } from '../hooks';

const COLS = {
  hora: 'w-[120px]',
  tipo: 'w-[200px]',
  detalle: 'w-[460px]',
  estado: 'w-[160px]',
  registrado: 'w-[176px]',
} as const;

export interface MisUltimosRegistrosProps {
  registros: readonly RegistroPropio[];
  cargando?: boolean;
}

/** `hace 12 min` a partir del sello de tiempo del registro. */
function hace(fechaIso: string): string {
  return formatRelative(Math.max(0, (Date.now() - new Date(fechaIso).getTime()) / 1000));
}

/**
 * Tabla "Mis últimos registros" del panel del maquinista (Figma 2165:12508):
 * Hora 120 · Tipo 200 · Detalle 460 · Estado 160 · Registrado 176 = 1116.
 */
export function MisUltimosRegistros({ registros, cargando = false }: MisUltimosRegistrosProps) {
  return (
    <section className="flex w-full flex-col gap-4">
      <SectionTitle
        divider
        title="Mis últimos registros"
        description="Producción, paradas y mermas que registraste en el turno actual"
      />

      {registros.length === 0 ? (
        <EmptyState
          icon={<Icon name="task-list" size={40} />}
          title={cargando ? 'Cargando tus registros…' : 'Todavía no registraste eventos en este turno'}
          description="Las paradas, mermas y velocidades que captures aparecerán aquí con su sello de tiempo."
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className={`${COLS.hora} normal-case`}>Hora</TH>
              <TH className={`${COLS.tipo} normal-case`}>Tipo</TH>
              <TH className={`${COLS.detalle} normal-case`}>Detalle</TH>
              <TH className={`${COLS.estado} normal-case`}>Estado</TH>
              <TH className={`${COLS.registrado} normal-case`}>Registrado</TH>
            </tr>
          </THead>
          <TBody>
            {registros.map((registro) => (
              <TRow key={registro.id}>
                <TCell className={`${COLS.hora} tabular font-medium`}>{registro.hora}</TCell>
                <TCell className={`${COLS.tipo} text-neutral-text`}>{registro.tipo}</TCell>
                <TCell className={`${COLS.detalle} text-neutral-text`}>{registro.detalle}</TCell>
                <TCell className={COLS.estado}>
                  <Badge color={registro.estadoColor} dot>
                    {registro.estadoLabel}
                  </Badge>
                </TCell>
                <TCell className={`${COLS.registrado} text-text-secondary`}>
                  {hace(registro.fechaIso)}
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
