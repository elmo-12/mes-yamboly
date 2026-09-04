'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
  Tooltip,
  TooltipProvider,
} from '@mes/ui';
import { TIPOS_PROCESO_LINEA } from '@mes/types';
import type { Linea, Producto, TipoProcesoLinea, VelocidadEstandarListItem } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { EliminarVelocidadModal } from './EliminarVelocidadModal';
import { VelocidadEstandarModal } from './VelocidadEstandarModal';

/** Encabezado de grupo de columnas: «Llenadoras · 4 líneas». */
const GRUPO_LABEL: Record<TipoProcesoLinea, string> = {
  llenadora: 'Llenadoras',
  extrusora: 'Extrusoras',
  moldeadora: 'Moldeadoras',
};

const GUION = '—';

interface Grupo {
  tipoProceso: TipoProcesoLinea;
  lineas: readonly Linea[];
}

/** Las 9 líneas reales agrupadas por tipo de proceso, en el orden del catálogo. */
function agrupar(lineas: readonly Linea[]): readonly Grupo[] {
  return TIPOS_PROCESO_LINEA.map((tipoProceso) => ({
    tipoProceso,
    lineas: lineas.filter((l) => l.tipoProceso === tipoProceso),
  })).filter((g) => g.lineas.length > 0);
}

/** `null` → «—»; los minutos de CIP/arranque no están definidos en todo el maestro. */
function minutos(valor: number | null): string {
  return valor === null ? GUION : `${formatNumber(valor)} min`;
}

export interface MatrizVelocidadesProps {
  /** Producto cuyas velocidades se muestran: la fila de la matriz. */
  producto: Producto;
  /** Las 9 líneas reales (columnas), sin filtrar. */
  lineas: readonly Linea[];
  /** Pares del producto (`useVelocidadesEstandar`), ya filtrados por `productoId`. */
  pares: readonly VelocidadEstandarListItem[];
}

/**
 * `Configuración / Productos y velocidades` — matriz **producto × 9 líneas**,
 * cuerpo de `VelocidadesModal` (Figma 2165:11984 actualizado a modal).
 *
 * Las columnas son las líneas agrupadas por `tipoProceso` (llenadoras,
 * extrusoras, moldeadoras) y la única fila es el producto del modal: así el
 * par que falta se lee de un vistazo y se crea desde la propia celda vacía
 * (`VelocidadEstandarModal` con la línea precargada). El título, el resumen
 * «N de 9 líneas con par activo» y los estados de carga/vacío/error viven en
 * `VelocidadesModal`, que es quien decide cuándo montar esta matriz. La tabla
 * desborda a lo ancho con su propio scroll horizontal (`Table`), sin
 * arrastrar el modal.
 */
export function MatrizVelocidades({ producto, lineas, pares }: MatrizVelocidadesProps) {
  const [editar, setEditar] = React.useState<{ lineaId?: string; par?: VelocidadEstandarListItem }>();
  const [eliminar, setEliminar] = React.useState<VelocidadEstandarListItem>();

  const grupos = React.useMemo(() => agrupar(lineas), [lineas]);
  const porLinea = React.useMemo(
    () => new Map(pares.map((p) => [p.lineaId, p])),
    [pares],
  );

  return (
    <>
      <TooltipProvider>
        <Table density="dense">
          <THead>
            <tr>
              <TH rowSpan={2} className="w-[180px] align-bottom">
                Producto
              </TH>
              {grupos.map((g) => (
                <TH key={g.tipoProceso} colSpan={g.lineas.length} className="text-center">
                  {`${GRUPO_LABEL[g.tipoProceso]} · ${formatNumber(g.lineas.length)}`}
                </TH>
              ))}
            </tr>
            <tr>
              {grupos.flatMap((g) =>
                g.lineas.map((l) => (
                  <TH key={l.id} className="min-w-[164px]">
                    {l.codigo}
                  </TH>
                )),
              )}
            </tr>
          </THead>
          <TBody>
            <TRow plain className="align-top">
              <TCell className="py-3">
                <span className="block font-medium tabular">{producto.codigo}</span>
                <span className="block text-caption text-text-secondary">{producto.nombre}</span>
              </TCell>
              {grupos.flatMap((g) =>
                g.lineas.map((linea) => {
                  const par = porLinea.get(linea.id);
                  return (
                    <TCell key={linea.id} className="py-2">
                      {par ? (
                        <CeldaPar
                          linea={linea}
                          par={par}
                          onEditar={() => setEditar({ par })}
                          onEliminar={() => setEliminar(par)}
                        />
                      ) : (
                        <CeldaVacia
                          linea={linea}
                          onAgregar={() => setEditar({ lineaId: linea.id })}
                        />
                      )}
                    </TCell>
                  );
                }),
              )}
            </TRow>
          </TBody>
        </Table>
      </TooltipProvider>

      {editar && (
        <VelocidadEstandarModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setEditar(undefined);
          }}
          producto={producto}
          lineaId={editar.lineaId}
          velocidad={editar.par}
        />
      )}

      {eliminar && (
        <EliminarVelocidadModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setEliminar(undefined);
          }}
          producto={producto}
          velocidad={eliminar}
          onEliminada={() => setEliminar(undefined)}
        />
      )}
    </>
  );
}

/** Celda con par: u/min (magnitud del OEE), u/h y merma; CIP/arranque en tooltip. */
function CeldaPar({
  linea,
  par,
  onEditar,
  onEliminar,
}: {
  linea: Linea;
  par: VelocidadEstandarListItem;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  return (
    <div className="flex items-start gap-1">
      <Tooltip
        content={`${linea.codigo} · ${linea.nombre}`}
        supporting={`${formatNumber(par.velocidadUnidHora)} u/h · merma ${formatNumber(
          par.mermaEstandarPct,
          1,
        )} % · CIP ${minutos(par.cipMin)} · arranque ${minutos(par.arranqueMin)}`}
      >
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar la velocidad de ${par.productoCodigo} en ${linea.codigo}`}
          className="min-w-0 flex-1 rounded-sm px-1.5 py-1 text-left transition-colors duration-150 ease-standard hover:bg-background-subtle focus-visible:shadow-focus focus-visible:outline-none"
        >
          <span className="block font-medium tabular text-text-primary">
            {`${formatNumber(par.velocidadUnidMin, 1)} u/min`}
          </span>
          <span className="block text-caption tabular text-text-secondary">
            {`${formatNumber(par.velocidadUnidHora)} u/h · ${formatNumber(par.mermaEstandarPct, 1)} %`}
          </span>
          {par.estado === 'inactivo' && (
            <span className="mt-1 inline-flex">
              <Badge color="neutral">Inactivo</Badge>
            </span>
          )}
        </button>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones del par ${par.productoCodigo} × ${linea.codigo}`}
          className="grid size-8 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
        >
          <Icon name="dots-horizontal" size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onEditar}>
            <Icon name="edit" size={16} />
            Editar velocidad
          </DropdownMenuItem>
          <DropdownMenuItem danger onSelect={onEliminar}>
            <Icon name="archive" size={16} />
            Dar de baja
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Celda sin par: «—» + alta con la línea precargada. */
function CeldaVacia({ linea, onAgregar }: { linea: Linea; onAgregar: () => void }) {
  return (
    <div className="flex flex-col items-start gap-1 px-1.5 py-1">
      <span className="text-body-md text-text-disabled" aria-hidden>
        {GUION}
      </span>
      <Button
        variant="secondary"
        size="sm"
        icon={<Icon name="plus" />}
        aria-label={`Agregar velocidad estándar en ${linea.codigo}`}
        onClick={onAgregar}
      >
        Agregar
      </Button>
    </div>
  );
}
