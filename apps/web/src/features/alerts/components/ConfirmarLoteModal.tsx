'use client';

import * as React from 'react';
import {
  Button,
  Modal,
  ModalClose,
  ModalContent,
  Overline,
  Radio,
  RadioGroup,
  Skeleton,
  TBody,
  THead,
  TH,
  TCell,
  TRow,
  Table,
  toast,
} from '@mes/ui';
import type { Alerta } from '@mes/types';
import { formatPct } from '@mes/shared';
import { useAlertas, useConfirmarLote } from '../hooks';
import { esperaConfirmacion, etiquetaLinea, formatVentana } from './alerta-format';

export interface ConfirmarLoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Respuesta = 'si' | 'no';

/**
 * `Alertas / Confirmar evento real (modal)` — Figma 2163:11719.
 * Tabla de alertas vencidas con Radio Sí/No por fila; al guardar escribe el
 * Anexo 06 (KPI EP) en lote.
 */
export function ConfirmarLoteModal({ open, onOpenChange }: ConfirmarLoteModalProps) {
  const { data, isPending, isError } = useAlertas({ pageSize: 100 });
  const confirmarLote = useConfirmarLote();
  const [respuestas, setRespuestas] = React.useState<Record<string, Respuesta>>({});

  const pendientes: Alerta[] = React.useMemo(
    () => (data?.data ?? []).filter(esperaConfirmacion),
    [data],
  );

  const respondidas = pendientes.filter((a) => respuestas[a.id]).length;
  const faltan = pendientes.length - respondidas;

  const guardar = async () => {
    const confirmaciones = pendientes
      .filter((a) => respuestas[a.id])
      .map((a) => ({ alertaId: a.id, ocurrio: respuestas[a.id] === 'si' }));

    if (confirmaciones.length === 0) {
      toast.warning('Marca al menos una alerta antes de guardar');
      return;
    }

    try {
      const resultado = await confirmarLote.mutateAsync({ confirmaciones });
      toast.success(`${confirmaciones.length} confirmaciones guardadas`, {
        description: `EP acumulada recalculada: ${formatPct(resultado.ep)} · registradas en el Anexo 06.`,
      });
      setRespuestas({});
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudieron guardar las confirmaciones', {
        description: error instanceof Error ? error.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={
          pendientes.length > 0
            ? `Confirmar el resultado real de ${pendientes.length} alertas`
            : 'Confirmar el resultado real'
        }
        size="lg"
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary" type="button">
                Cancelar
              </Button>
            </ModalClose>
            <Button
              variant="primary"
              type="button"
              onClick={guardar}
              loading={confirmarLote.isPending}
              disabled={isPending || isError || respondidas === 0}
            >
              Guardar confirmaciones
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Overline className="text-text-disabled">Confirmación de eventos · KPI EP</Overline>
            <p className="text-body text-text-secondary">
              Marca si cada predicción se cumplió en su ventana. Las confirmaciones quedan
              registradas en el Anexo 06 y recalculan la exactitud del modelo.
            </p>
          </div>

          {isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : isError ? (
            <p className="text-body text-error-text">
              No se pudo cargar la lista de alertas pendientes. Cierra el modal y reintenta.
            </p>
          ) : pendientes.length === 0 ? (
            <p className="rounded-md bg-background-subtle px-3.5 py-3 text-body text-text-secondary">
              No hay alertas pendientes de confirmar. El modelo pedirá confirmación al cerrarse la
              ventana de cada predicción.
            </p>
          ) : (
            <>
              <Table density="dense">
                <THead>
                  <tr>
                    <TH>Alerta</TH>
                    <TH className="w-[120px]">Ventana</TH>
                    <TH className="w-16 text-center">Sí</TH>
                    <TH className="w-16 text-center">No</TH>
                  </tr>
                </THead>
                <TBody>
                  {pendientes.map((alerta) => {
                    const valor = respuestas[alerta.id];
                    return (
                      <TRow
                        key={alerta.id}
                        className={valor ? undefined : 'bg-warning-subtle'}
                        plain
                      >
                        <TCell>
                          <span className="font-medium text-text-primary">{alerta.prediccion}</span>
                          <span className="block text-caption text-text-secondary">
                            {etiquetaLinea(alerta)}
                          </span>
                        </TCell>
                        <TCell muted>{formatVentana(alerta.ventanaInicio, alerta.ventanaFin)}</TCell>
                        <TCell colSpan={2} className="px-0">
                          <RadioGroup
                            className="flex flex-row gap-0"
                            aria-label={`Resultado real de ${alerta.prediccion}`}
                            value={valor ?? ''}
                            onValueChange={(v) =>
                              setRespuestas((prev) => ({ ...prev, [alerta.id]: v as Respuesta }))
                            }
                          >
                            <span className="grid w-16 place-items-center">
                              <Radio value="si" size="sm" aria-label="Sí ocurrió" />
                            </span>
                            <span className="grid w-16 place-items-center">
                              <Radio value="no" size="sm" aria-label="No ocurrió" />
                            </span>
                          </RadioGroup>
                        </TCell>
                      </TRow>
                    );
                  })}
                </TBody>
              </Table>

              <p className="rounded-md bg-background-subtle px-3.5 py-3 text-body-sm text-text-secondary">
                {faltan > 0
                  ? `Faltan ${faltan} de ${pendientes.length} confirmaciones. `
                  : `Las ${pendientes.length} confirmaciones están marcadas. `}
                Al guardar se registran en el Anexo 06 y se recalcula la EP acumulada del modelo.
              </p>
            </>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
