'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCard, Badge, Button, Input, Modal, ModalContent, Textarea, toast } from '@mes/ui';
import { finalizeOrdenSchema } from '@mes/types';
import type { FinalizeOrdenInput, OrdenListItem } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { useFinalizarOrden } from '../hooks';

export interface EditarOrdenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orden: OrdenListItem;
}

/**
 * "Editar" del page header. El contrato solo permite corregir los datos de
 * cierre mientras la OF está en curso (`POST /ordenes/:id/finalizar`); una vez
 * cerrada, las correcciones se hacen desde las pestañas Paradas y Mermas.
 */
export function EditarOrdenModal({ open, onOpenChange, orden }: EditarOrdenModalProps) {
  const enCurso = orden.estado === 'en_curso';
  const finalizar = useFinalizarOrden(orden.id);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FinalizeOrdenInput>({
    resolver: zodResolver(finalizeOrdenSchema),
    defaultValues: {
      producido: orden.producido,
      conteoCodificadora: orden.conteoCodificadora,
      comentario: orden.observacion ?? '',
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        producido: orden.producido,
        conteoCodificadora: orden.conteoCodificadora,
        comentario: orden.observacion ?? '',
      });
    }
  }, [open, orden.conteoCodificadora, orden.observacion, orden.producido, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      await finalizar.mutateAsync(valores);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.bitacora(orden.codigo) });
      toast.success(`Orden ${orden.codigo} cerrada`, {
        description: 'Pasa a "Por validar"; el jefe de producción puede validarla.',
      });
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo guardar el cierre', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    }
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Editar datos de cierre"
        description={`${orden.codigo} · ${orden.productoNombre}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="form-editar-orden"
              disabled={!enCurso}
              loading={isSubmitting}
            >
              Guardar y cerrar orden
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {!enCurso && (
            <AlertCard
              variant="info"
              title="La orden ya está cerrada"
              description="La producción declarada no se puede modificar. Corrige paradas y mermas desde sus pestañas: cada cambio queda en la bitácora."
              badge={<Badge color="informational">Informativa</Badge>}
            />
          )}
          <form
            id="form-editar-orden"
            onSubmit={onSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Total producido"
                type="number"
                inputMode="numeric"
                suffix="u"
                disabled={!enCurso}
                {...register('producido')}
                destructive={Boolean(errors.producido)}
                hint={errors.producido?.message}
              />
              <Input
                label="Conteo de la codificadora"
                type="number"
                inputMode="numeric"
                suffix="u"
                disabled={!enCurso}
                {...register('conteoCodificadora')}
                destructive={Boolean(errors.conteoCodificadora)}
                hint={errors.conteoCodificadora?.message}
              />
            </div>
            <Textarea
              label="Comentario de cierre"
              rows={3}
              disabled={!enCurso}
              placeholder="Incidencias del turno, observaciones de calidad…"
              {...register('comentario')}
              destructive={Boolean(errors.comentario)}
              hint={errors.comentario?.message}
            />
          </form>
        </div>
      </ModalContent>
    </Modal>
  );
}
