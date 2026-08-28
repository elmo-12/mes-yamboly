'use client';

import Link from 'next/link';
import { Badge, Icon, Skeleton, type BadgeColor } from '@mes/ui';
import type { Alerta, SeveridadAlerta } from '@mes/types';
import { SEVERIDAD_ALERTA_LABEL } from '@mes/types';

/** Fila del popover de la campana. */
export interface NotificacionAlerta {
  id: string;
  titulo: string;
  detalle: string;
  /** `Probabilidad 78 % · hace 4 min` */
  meta: string;
  severidad: SeveridadAlerta;
  leida: boolean;
}

const SEVERIDAD_COLOR: Record<SeveridadAlerta, BadgeColor> = {
  critica: 'critical',
  alta: 'warning',
  media: 'informational',
};

const PUNTO: Record<SeveridadAlerta, string> = {
  critica: 'bg-error',
  alta: 'bg-warning',
  media: 'bg-info',
};

export interface NotificationsPopoverProps {
  /** 3 alertas más recientes. `undefined` = todavía cargando. */
  alertas?: readonly NotificacionAlerta[];
  /** Total de alertas de la bandeja (pie del popover). */
  total?: number;
  cargando?: boolean;
  onNavegar?: () => void;
}

/**
 * `Alertas / Popover notificaciones` (Figma 2163:13751 → nodo 2163:13982):
 * 360 de ancho, `Shadow/Dropdown`, cabecera con Badge de no leídas, 3 filas
 * separadas por divisores y pie "Ver todas las alertas" + total.
 *
 * Los datos los inyecta el shell; cuando exista `useAlertasRecientes` (A3)
 * basta con pasar `alertas={data.map(mapAlertaANotificacion)}` desde `AppShell`.
 */
export function NotificationsPopover({
  alertas,
  total,
  cargando,
  onNavegar,
}: NotificationsPopoverProps) {
  const enCarga = cargando || alertas === undefined;
  const noLeidas = alertas?.filter((a) => !a.leida).length ?? 0;

  return (
    <div className="flex w-full flex-col">
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-3">
        <h2 className="min-w-0 flex-1 text-body-md font-semibold text-text-primary">
          Alertas recientes
        </h2>
        {!enCarga && noLeidas > 0 && <Badge color="critical">{noLeidas} nuevas</Badge>}
      </header>

      {enCarga ? (
        <ul className="flex flex-col">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-2.5 border-t border-divider px-4 py-3">
              <Skeleton className="mt-1 size-2 rounded-pill" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      ) : alertas.length === 0 ? (
        <p className="border-t border-divider px-4 py-6 text-center text-body-sm text-text-secondary">
          Sin alertas recientes. El modelo reevalúa cada 5 min.
        </p>
      ) : (
        <ul className="flex flex-col">
          {alertas.map((a) => (
            <li key={a.id} className="border-t border-divider">
              {/* Abre la bandeja con el drawer de detalle (V5: `/alertas?id=`). */}
              <Link
                href={`/alertas?id=${encodeURIComponent(a.id)}`}
                onClick={onNavegar}
                className={`flex w-full gap-2.5 px-4 py-3 text-left transition-colors hover:bg-background-subtle ${
                  a.leida ? 'bg-background-main' : 'bg-background-subtle'
                }`}
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-pill ${PUNTO[a.severidad]}`}
                  aria-label={SEVERIDAD_ALERTA_LABEL[a.severidad]}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-body-md text-text-primary">{a.titulo}</p>
                  <p className="text-body-sm text-text-secondary">{a.detalle}</p>
                  <p className="text-caption text-text-disabled">{a.meta}</p>
                </div>
                <Badge color={SEVERIDAD_COLOR[a.severidad]} className="shrink-0 self-start">
                  {SEVERIDAD_ALERTA_LABEL[a.severidad]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center gap-2 border-t border-divider px-4 py-3">
        <Link
          href="/alertas"
          onClick={onNavegar}
          className="min-w-0 flex-1 text-btn-sm text-text-link hover:underline"
        >
          Ver todas las alertas
        </Link>
        {typeof total === 'number' ? (
          <span className="text-btn-sm text-text-disabled">{total}</span>
        ) : (
          <Icon name="chevron-right" size={16} className="text-text-disabled" />
        )}
      </footer>
    </div>
  );
}

/** Adapta una `Alerta` de la API al formato de fila del popover. */
export function mapAlertaANotificacion(alerta: Alerta, horaRelativa: string): NotificacionAlerta {
  return {
    id: alerta.id,
    titulo: alerta.prediccion,
    detalle: [alerta.lineaNombre, alerta.maquinaNombre].filter(Boolean).join(' · '),
    meta: `Probabilidad ${alerta.probabilidad} % · ${horaRelativa}`,
    severidad: alerta.severidad,
    leida: alerta.estado !== 'activa',
  };
}
