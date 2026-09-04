'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  LineCard,
  Skeleton,
} from '@mes/ui';
import type { LineaEstado, TiempoRealResumen } from '@mes/types';
import { BOTON_FILA, BOTON_PRINCIPAL, lineCardAmpliaProps } from './linea-view';

export type AccionLinea =
  | 'detalle'
  | 'parada'
  | 'finalizar-parada'
  | 'merma'
  | 'velocidad'
  | 'iniciar-orden'
  | 'finalizar-orden'
  | 'confirmar-iot'
  | 'descartar-iot';

export interface LineasGridProps {
  lineas: readonly LineaEstado[];
  resumen: Pick<TiempoRealResumen, 'turnoLabel' | 'turnoRango'>;
  onAccion: (accion: AccionLinea, linea: LineaEstado) => void;
}

/**
 * Grid de Line cards ampliadas: 2 columnas × gap 24 a partir de 1280 y 1 por
 * debajo (las 9 líneas de planta necesitan tarjetas altas y legibles, no una
 * rejilla de 3). Cada tarjeta conserva su propio Primary (excepción MDS
 * documentada para Tiempo real).
 */
export function LineasGrid({ lineas, resumen, onAccion }: LineasGridProps) {
  return (
    <div className="grid w-full grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
      {lineas.map((linea) => (
        <LineCard
          key={linea.lineaId}
          {...lineCardAmpliaProps(linea, resumen)}
          className="h-full w-full cursor-pointer"
          onClick={(e) => {
            const el = e.target as HTMLElement;
            /* Los menús/overlays se renderizan en un portal: en React los
               eventos siguen burbujeando por el árbol de componentes, así que
               se descartan los que no vienen del DOM de la tarjeta. */
            if (!e.currentTarget.contains(el)) return;
            if (el.closest('button, a, [role="menuitem"]')) return;
            onAccion('detalle', linea);
          }}
          actions={<AccionesLinea linea={linea} onAccion={onAccion} />}
        />
      ))}
    </div>
  );
}

function AccionesLinea({
  linea,
  onAccion,
}: {
  linea: LineaEstado;
  onAccion: (accion: AccionLinea, linea: LineaEstado) => void;
}) {
  /* En la tarjeta ampliada toda la botonera es táctil `lg` (48), también la de
     `sugerida`: la fila es la misma para las 9 líneas del tablero. En tarjeta
     estrecha (móvil) el Primary ocupa la fila entera y la
     secundaria comparte la siguiente con el menú. */
  if (linea.estado === 'sugerida') {
    return (
      <>
        <Button
          variant="primary"
          size="lg"
          block
          className={BOTON_PRINCIPAL}
          icon={<Icon name="check" size={20} />}
          onClick={() => onAccion('confirmar-iot', linea)}
        >
          Confirmar parada
        </Button>
        <Button
          variant="secondary"
          size="lg"
          block
          className={BOTON_FILA}
          onClick={() => onAccion('descartar-iot', linea)}
        >
          Descartar
        </Button>
        <MenuLinea linea={linea} onAccion={onAccion} />
      </>
    );
  }

  if (linea.estado === 'sin_orden') {
    return (
      <>
        <Button
          variant="primary"
          size="lg"
          block
          className={BOTON_FILA}
          icon={<Icon name="play-circle" size={20} />}
          onClick={() => onAccion('iniciar-orden', linea)}
        >
          Iniciar orden
        </Button>
        <MenuLinea linea={linea} onAccion={onAccion} />
      </>
    );
  }

  const enParada = linea.estado === 'parada';
  return (
    <>
      <Button
        variant="primary"
        size="lg"
        block
        className={BOTON_PRINCIPAL}
        icon={<Icon name={enParada ? 'check' : 'stop-circle'} size={20} />}
        onClick={() => onAccion(enParada ? 'finalizar-parada' : 'parada', linea)}
      >
        {enParada ? 'Finalizar parada' : 'Parada'}
      </Button>
      <Button
        variant="secondary"
        size="lg"
        block
        className={BOTON_FILA}
        onClick={() => onAccion('merma', linea)}
      >
        Merma
      </Button>
      <MenuLinea linea={linea} onAccion={onAccion} />
    </>
  );
}

function MenuLinea({
  linea,
  onAccion,
}: {
  linea: LineaEstado;
  onAccion: (accion: AccionLinea, linea: LineaEstado) => void;
}) {
  const conOrden = Boolean(linea.orden);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="lg"
          icon={<Icon name="dots-horizontal" size={20} />}
          iconPosition="only"
          aria-label={`Más acciones de ${linea.lineaCodigo}`}
          className="shrink-0"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onAccion('detalle', linea)}>
          <Icon name="eye" size={16} />
          Ver detalle
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAccion('velocidad', linea)}>
          <Icon name="gauge" size={16} />
          Registrar velocidad
        </DropdownMenuItem>
        {linea.estado === 'parada' && (
          <DropdownMenuItem onSelect={() => onAccion('finalizar-parada', linea)}>
            <Icon name="check" size={16} />
            Finalizar parada
          </DropdownMenuItem>
        )}
        {conOrden ? (
          <DropdownMenuItem onSelect={() => onAccion('finalizar-orden', linea)}>
            <Icon name="stop-circle" size={16} />
            Finalizar orden
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onAccion('iniciar-orden', linea)}>
            <Icon name="play-circle" size={16} />
            Iniciar orden
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Skeleton con la geometría real de las tarjetas ampliadas (9 líneas de planta). */
export function LineasGridSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 items-start gap-6 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex w-full flex-col gap-5 rounded-md border border-border bg-background-main p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-[21px] w-28 rounded-pill" />
          </div>
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-14 w-full" />
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full rounded-xs" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-12 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
