'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCard, Badge, Button, Drawer, DrawerContent, Overline, toast } from '@mes/ui';
import type { CreateParadaInput, OrdenListItem, ParadaListItem, UpdateParadaInput } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { useActualizarParada, useCrearParada, useFinalizarParada } from '@/features/downtimes/hooks';
import { useCausasParada } from '@/features/catalogs/hooks';
import {
  ParadaForm,
  aIso,
  paradaFormSchema,
  valoresDeParada,
  type ParadaFormValues,
} from './ParadaForm';

const FORM_ID = 'form-parada-of';

export interface ParadaDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orden: OrdenListItem;
  /** Sin `parada` el drawer registra una parada retroactiva (spec 05.D). */
  parada?: ParadaListItem;
}

/**
 * `Órdenes / Editar parada (drawer)` (Figma 2163:14623) — mismos campos que el
 * paso 2 de la captura rápida + Alert Warning de trazabilidad. También sirve
 * para registrar una parada retroactiva desde la pestaña Paradas.
 */
export function ParadaDrawer({ open, onOpenChange, orden, parada }: ParadaDrawerProps) {
  const edicion = Boolean(parada);
  const queryClient = useQueryClient();
  const { data: causas } = useCausasParada(orden.lineaId);
  const crear = useCrearParada();
  const actualizar = useActualizarParada();
  const finalizar = useFinalizarParada();

  const form = useForm<ParadaFormValues>({
    resolver: zodResolver(paradaFormSchema),
    defaultValues: {
      horaInicio: '',
      horaFin: '',
      tipoCausaId: '',
      causaId: '',
      accionTomada: '',
      numeroSolicitud: '',
      responsableId: orden.maquinistaId,
      afectaOee: true,
    },
  });

  const { reset } = form;
  React.useEffect(() => {
    if (!open) return;
    reset(
      parada
        ? valoresDeParada(parada)
        : {
            horaInicio: '',
            horaFin: '',
            tipoCausaId: '',
            causaId: '',
            accionTomada: '',
            numeroSolicitud: '',
            responsableId: orden.maquinistaId,
            afectaOee: true,
          },
    );
  }, [open, parada, orden.maquinistaId, reset]);

  const invalidarBitacora = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.bitacora(orden.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.bitacora(orden.codigo) });
  }, [orden.codigo, orden.id, queryClient]);

  const onSubmit = React.useCallback(
    async (valores: ParadaFormValues) => {
      const inicio = aIso(orden.fecha, valores.horaInicio);
      const fin = valores.horaFin ? aIso(orden.fecha, valores.horaFin) : null;

      try {
        if (parada) {
          const input: UpdateParadaInput = {
            tipoCausaId: valores.tipoCausaId,
            causaId: valores.causaId,
            inicio,
            fin,
            accionTomada: valores.accionTomada,
            numeroSolicitud: valores.numeroSolicitud || undefined,
            responsableId: valores.responsableId,
            afectaOee: valores.afectaOee,
          };
          await actualizar.mutateAsync({ id: parada.id, input });
          toast.success('Parada actualizada', {
            description: 'El cambio quedó registrado en la bitácora de la orden.',
          });
        } else {
          const input: CreateParadaInput = {
            ordenId: orden.id,
            lineaId: orden.lineaId,
            tipoCausaId: valores.tipoCausaId,
            causaId: valores.causaId,
            inicio,
            accionTomada: valores.accionTomada,
            numeroSolicitud: valores.numeroSolicitud || undefined,
            afectaOee: valores.afectaOee,
            responsableId: valores.responsableId,
            origen: 'manual',
            tiempoRegistroSeg: 0,
          };
          const nueva = await crear.mutateAsync(input);
          if (fin) await finalizar.mutateAsync({ id: nueva.id, input: { fin } });
          toast.success('Parada registrada', {
            description: `${valores.horaInicio}${valores.horaFin ? ` – ${valores.horaFin}` : ''} · ${orden.codigo}`,
          });
        }
        invalidarBitacora();
        onOpenChange(false);
      } catch (error) {
        toast.error(edicion ? 'No se pudo guardar la parada' : 'No se pudo registrar la parada', {
          description:
            error instanceof Error ? error.message : 'Revisa los campos e inténtalo de nuevo.',
        });
      }
    },
    [
      actualizar,
      crear,
      edicion,
      finalizar,
      invalidarBitacora,
      onOpenChange,
      orden.codigo,
      orden.fecha,
      orden.id,
      orden.lineaId,
      parada,
    ],
  );

  const guardando = crear.isPending || actualizar.isPending || finalizar.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={
          parada
            ? `Editar parada · ${valoresDeParada(parada).horaInicio} – ${valoresDeParada(parada).horaFin || 'abierta'}`
            : 'Registrar parada retroactiva'
        }
        description={
          parada ? undefined : 'Para paradas detectadas después del turno; queda marcada como registro manual.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form={FORM_ID} loading={guardando}>
              {parada ? 'Guardar cambios' : 'Registrar parada'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Overline>{parada ? `Parada ${parada.id}` : 'Nueva parada'}</Overline>
            <Badge color="neutral">{orden.codigo}</Badge>
            <Badge color="informational">{`${orden.lineaCodigo} · ${orden.lineaNombre}`}</Badge>
          </div>

          <ParadaForm
            form={form}
            formId={FORM_ID}
            causas={causas?.data}
            onSubmit={onSubmit}
          />

          <AlertCard
            variant="warning"
            title="Los cambios quedan registrados en la bitácora"
            description="Se guardará la versión anterior junto con tu usuario, la fecha y el motivo del cambio (RF12)."
            badge={<Badge color="warning">Advertencia</Badge>}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
