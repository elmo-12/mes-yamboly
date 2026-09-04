'use client';

import * as React from 'react';
import { Button, EmptyState, Icon, Modal, ModalContent, Skeleton } from '@mes/ui';
import type { Linea, Producto, VelocidadEstandarListItem } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { MatrizVelocidades } from './MatrizVelocidades';
import { VelocidadEstandarModal } from './VelocidadEstandarModal';

export interface VelocidadesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Producto cuya matriz de velocidades se muestra. */
  producto: Producto;
  /** Las 9 líneas reales (columnas de la matriz). */
  lineas: readonly Linea[];
  /** Pares del producto (`useVelocidadesEstandar`), ya filtrados por `productoId`. */
  pares: readonly VelocidadEstandarListItem[];
  /** Trayendo los pares del producto (primera carga o refetch tras una mutación). */
  cargando?: boolean;
  /** La consulta de velocidades falló. */
  error?: boolean;
  onReintentar?: () => void;
}

/**
 * `Configuración / Productos y velocidades` — «Ver velocidades» abre este
 * modal (Figma 2165:11984, decisión 4-sep-2026 de reemplazar el panel fijo
 * bajo la tabla): título «Velocidades estándar · código nombre», subtítulo
 * con el resumen de líneas con par activo, y dentro la matriz producto × 9
 * líneas. Los altas/edición/baja por celda siguen viviendo en
 * `MatrizVelocidades`, que abre `VelocidadEstandarModal` / `EliminarVelocidadModal`
 * **sobre** este modal: ambos son `Dialog` de Radix con su propio `Portal`,
 * así que se apilan en `document.body` sin quedar atrapados dentro de este
 * `ModalContent` (mismo patrón ya usado en drawers sobre modales del resto
 * de la app). Ancho `lg` (640, el mayor del sistema): con 9 columnas la
 * tabla desborda con su propio scroll horizontal en vez de angostar el modal.
 */
export function VelocidadesModal({
  open,
  onOpenChange,
  producto,
  lineas,
  pares,
  cargando = false,
  error = false,
  onReintentar,
}: VelocidadesModalProps) {
  const [agregarSinLinea, setAgregarSinLinea] = React.useState(false);
  const activos = pares.filter((p) => p.estado === 'activo').length;
  const sinPares = !cargando && !error && pares.length === 0;

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent
          size="lg"
          title={`Velocidades estándar · ${producto.codigo} ${producto.nombre}`}
          description={
            cargando || error
              ? undefined
              : `${formatNumber(activos)} de ${formatNumber(
                  lineas.length,
                )} líneas con par activo · unid/hora y unid/min`
          }
          footer={
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          }
        >
          {cargando ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
            <EmptyState
              variant="error"
              icon={<Icon name="alert-circle" size={40} />}
              title="No se pudieron cargar las velocidades"
              description="El servicio de catálogos no respondió. Reintenta en unos segundos."
              action={
                onReintentar && (
                  <Button
                    variant="secondary"
                    icon={<Icon name="arrow-path" />}
                    onClick={onReintentar}
                  >
                    Reintentar
                  </Button>
                )
              }
            />
          ) : sinPares ? (
            <EmptyState
              icon={<Icon name="gauge" size={40} />}
              title="Este producto no tiene velocidad estándar en ninguna línea"
              description="Crea el primer par para que la línea pueda ofrecerlo al iniciar una orden."
              action={
                <Button
                  variant="secondary"
                  icon={<Icon name="plus" />}
                  onClick={() => setAgregarSinLinea(true)}
                >
                  Agregar en una línea
                </Button>
              }
            />
          ) : (
            <MatrizVelocidades producto={producto} lineas={lineas} pares={pares} />
          )}
        </ModalContent>
      </Modal>

      {agregarSinLinea && (
        <VelocidadEstandarModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setAgregarSinLinea(false);
          }}
          producto={producto}
        />
      )}
    </>
  );
}
