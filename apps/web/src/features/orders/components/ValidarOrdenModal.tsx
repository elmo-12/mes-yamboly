'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCard, Button, Checkbox, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { OrdenListItem, ValidateOrdenInput } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { mensajeDeError } from '@/services/api/form-errors';
import { queryKeys } from '@/services/api/query-keys';
import { useOrdenMermas, useOrdenParadas, useValidarOrden } from '../hooks';

type ItemChecklist = keyof Omit<ValidateOrdenInput, 'observacion'>;

const ITEMS: ReadonlyArray<{ id: ItemChecklist; label: string }> = [
  { id: 'produccionRegistrada', label: 'Producción registrada' },
  { id: 'paradasConCausa', label: 'Paradas con causa y acción' },
  { id: 'mermasClasificadas', label: 'Mermas clasificadas' },
  { id: 'evidenciaEtiqueta', label: 'Evidencia de etiqueta adjunta' },
];

export interface ValidarOrdenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orden: OrdenListItem;
}

/**
 * `Órdenes / Validar orden (modal)` (Figma 2163:15629): checklist de 4 ítems;
 * el Primary permanece deshabilitado hasta marcarlos todos.
 */
export function ValidarOrdenModal({ open, onOpenChange, orden }: ValidarOrdenModalProps) {
  const [marcados, setMarcados] = React.useState<readonly ItemChecklist[]>([]);
  const validar = useValidarOrden(orden.id);
  const queryClient = useQueryClient();
  const paradas = useOrdenParadas(open ? orden.codigo : undefined);
  const mermas = useOrdenMermas(open ? orden.codigo : undefined);
  /* Bloqueo síncrono: el doble clic disparaba dos validaciones antes de que
     `isPending` deshabilitara el botón. */
  const enviando = React.useRef(false);
  const abiertas = paradas.data?.data.filter((p) => p.fin === null).length ?? 0;

  React.useEffect(() => {
    if (!open) setMarcados([]);
  }, [open]);

  const soporte: Record<ItemChecklist, string> = {
    produccionRegistrada: `${formatNumber(orden.producido)} u de ${formatNumber(orden.planificado)} u planificadas`,
    paradasConCausa: paradas.data
      ? `${paradas.data.resumen.cantidad} paradas · ${paradas.data.resumen.minutos} min${
          abiertas > 0 ? ` · ${abiertas} sin cerrar` : ' · todas cerradas y con causa codificada'
        }`
      : 'Cargando paradas…',
    mermasClasificadas: mermas.data
      ? `${mermas.data.resumen.cantidad} registros · ${formatNumber(mermas.data.resumen.kg, 1)} kg clasificados`
      : 'Cargando mermas…',
    evidenciaEtiqueta: 'Etiqueta, ficha técnica y control de peso de la OF',
  };

  const completo = ITEMS.every((i) => marcados.includes(i.id));

  const confirmar = async () => {
    if (enviando.current) return;
    enviando.current = true;
    try {
      await validar.mutateAsync({
        produccionRegistrada: true,
        paradasConCausa: true,
        mermasClasificadas: true,
        evidenciaEtiqueta: true,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.bitacora(orden.codigo) });
      toast.success(`Orden ${orden.codigo} validada`, {
        description: 'Queda sellada; la bitácora registra quién y cuándo la cerró.',
      });
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo validar la orden', {
        description: mensajeDeError(error, 'Inténtalo de nuevo.'),
      });
    } finally {
      enviando.current = false;
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`Validar orden ${orden.codigo}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={!completo || validar.isPending || abiertas > 0 || !paradas.data}
              loading={validar.isPending}
              onClick={confirmar}
            >
              Validar y cerrar orden
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {abiertas > 0 && (
            <AlertCard
              variant="warning"
              title="Cierra la parada abierta antes de validar"
              description="La orden tiene paradas sin hora de fin: ciérralas desde la pestaña Paradas."
            />
          )}
          <Overline>Checklist de cierre</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            Al validar, la orden se sella: no se podrán editar paradas, mermas ni producción sin
            reapertura del Jefe de producción. Todo queda trazado en la bitácora.
          </p>
          <div className="flex flex-col gap-3">
            {ITEMS.map((item) => (
              <Checkbox
                key={item.id}
                checked={marcados.includes(item.id)}
                onCheckedChange={(v) =>
                  setMarcados((prev) =>
                    v === true ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                  )
                }
                label={item.label}
                supporting={soporte[item.id]}
              />
            ))}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
