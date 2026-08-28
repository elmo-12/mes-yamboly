'use client';

import * as React from 'react';
import { Avatar, Badge, EmptyState, Icon, SectionTitle, Tag, Timeline } from '@mes/ui';
import { TIPO_AUDITORIA_LABEL } from '@mes/types';
import type { AuditEvent, TipoAuditoria } from '@mes/types';
import { fechaCorta, hora, TIPO_AUDITORIA_COLOR } from '../format';
import { FilasSkeleton } from './OrdenParadasTab';

export interface OrdenBitacoraTabProps {
  eventos: readonly AuditEvent[];
  cargando: boolean;
}

/**
 * Pestaña Bitácora (Figma 2163:12196, RF12): filtro por tipo con Tags y lista
 * vertical de eventos con hora, avatar, texto y Badge de tipo. Solo lectura.
 */
export function OrdenBitacoraTab({ eventos, cargando }: OrdenBitacoraTabProps) {
  const [tipo, setTipo] = React.useState<TipoAuditoria | 'todos'>('todos');

  /* Solo se ofrecen los tipos presentes en la bitácora de esta orden. */
  const tipos = React.useMemo(() => {
    const set = new Set<TipoAuditoria>();
    eventos.forEach((e) => set.add(e.tipo));
    return [...set];
  }, [eventos]);

  const filtrados = tipo === 'todos' ? eventos : eventos.filter((e) => e.tipo === tipo);

  if (cargando) return <FilasSkeleton filas={5} />;

  return (
    <div className="flex flex-col gap-5">
      <SectionTitle
        title="Bitácora de la orden"
        description={`Trazabilidad completa de altas, ediciones y eventos del sistema · ${eventos.length} registros (RF12)`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 pr-2 text-overline whitespace-nowrap text-text-disabled uppercase">
          Tipo de evento
        </span>
        <Tag size="md" selected={tipo === 'todos'} onClick={() => setTipo('todos')}>
          Todos
        </Tag>
        {tipos.map((t) => (
          <Tag key={t} size="md" selected={tipo === t} onClick={() => setTipo(t)}>
            {TIPO_AUDITORIA_LABEL[t]}
          </Tag>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          variant="no-results"
          icon={<Icon name="search" size={40} />}
          title="Sin eventos de ese tipo"
          description="Cambia el filtro para ver el resto de la trazabilidad de la orden."
        />
      ) : (
        <Timeline
          events={filtrados.map((e) => ({
            time: hora(e.fecha),
            timeMeta: fechaCorta(e.fecha.slice(0, 10)),
            marker: <Avatar name={e.usuario} size={32} />,
            title: e.usuario,
            badge: <Badge color={TIPO_AUDITORIA_COLOR[e.tipo]}>{TIPO_AUDITORIA_LABEL[e.tipo]}</Badge>,
            description: e.texto,
          }))}
        />
      )}
    </div>
  );
}
