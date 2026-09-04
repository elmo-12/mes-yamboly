'use client';

import { useRouter } from 'next/navigation';
import { AlertCard, Badge, EmptyState, Icon, SectionTitle, type AlertVariant } from '@mes/ui';
import type { Alerta, SeveridadAlerta } from '@mes/types';
import { SEVERIDAD_ALERTA_LABEL } from '@mes/types';
import { formatPct } from '@mes/shared';

/** `critica` → rojo · `alta` → ámbar · `media` → azul (frame 2163:18211). */
const VARIANTE: Record<SeveridadAlerta, AlertVariant> = {
  critica: 'critical',
  alta: 'warning',
  media: 'info',
};

const COLOR_BADGE = { critical: 'critical', warning: 'warning', info: 'informational' } as const;

export interface RequiereAccionProps {
  alertas: readonly Alerta[];
  cargando?: boolean;
}

/** Título + mensaje de la alerta a partir del contrato de `/alertas/recientes`. */
function textos(alerta: Alerta): { titulo: string; mensaje: string } {
  const factor = alerta.factores[0]?.texto;
  return {
    titulo: `${alerta.lineaCodigo} ${alerta.lineaNombre} · ${alerta.prediccion}`,
    mensaje: `Probabilidad ${formatPct(alerta.probabilidad, 0)}${factor ? ` · ${factor}` : ''}`,
  };
}

/**
 * Zona "Requiere acción" del Home (Figma 2163:18211): Section title con regla y
 * fila de tres `MES / Alert card` en `gap 16`. Cada tarjeta enlaza a la bandeja
 * de alertas con la alerta preseleccionada.
 */
export function RequiereAccion({ alertas, cargando = false }: RequiereAccionProps) {
  const router = useRouter();
  const visibles = alertas.slice(0, 3);

  return (
    <section className="flex w-full flex-col gap-6">
      <SectionTitle
        divider
        title="Requiere acción"
        description="Alertas abiertas de las últimas 2 horas · priorizadas por impacto en OEE"
      />
      {visibles.length === 0 ? (
        <EmptyState
          icon={<Icon name="check-circle" size={40} />}
          title={cargando ? 'Buscando alertas…' : 'Sin alertas abiertas'}
          description="Ninguna línea requiere intervención en este momento. El modelo vuelve a evaluar al inicio del próximo turno."
        />
      ) : (
        <div className="flex w-full flex-col items-stretch gap-4 lg:flex-row">
          {visibles.map((alerta) => {
            const { titulo, mensaje } = textos(alerta);
            const variante = VARIANTE[alerta.severidad];
            return (
              <AlertCard
                key={alerta.id}
                variant={variante}
                title={titulo}
                description={mensaje}
                badge={<Badge color={COLOR_BADGE[variante]}>{SEVERIDAD_ALERTA_LABEL[alerta.severidad]}</Badge>}
                actionLabel="Ver alerta"
                onAction={() => router.push(`/alertas?id=${alerta.id}`)}
                className="min-w-0 flex-1"
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
