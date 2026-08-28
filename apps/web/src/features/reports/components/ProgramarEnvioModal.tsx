'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Modal, ModalContent, Radio, RadioGroup, toast } from '@mes/ui';

const FRECUENCIAS = [
  { value: 'diaria', label: 'Diaria', ayuda: 'Todos los días a las 07:00' },
  { value: 'semanal', label: 'Semanal', ayuda: 'Cada lunes a las 07:00' },
  { value: 'mensual', label: 'Mensual', ayuda: 'El día 1 de cada mes a las 07:00' },
] as const;

const schema = z.object({
  correo: z.string().min(1, 'Indica un correo').email('Correo no válido'),
  frecuencia: z.enum(['diaria', 'semanal', 'mensual']),
});
type ProgramarEnvioInput = z.infer<typeof schema>;

export interface ProgramarEnvioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Correo sugerido (el del usuario en sesión). */
  correoSugerido?: string;
}

const FRECUENCIA_LABEL: Record<ProgramarEnvioInput['frecuencia'], string> = {
  diaria: 'todos los días',
  semanal: 'cada lunes',
  mensual: 'el día 1 de cada mes',
};

/** Modal "Programar envío" del page header de Reportes (RF13). */
export function ProgramarEnvioModal({ open, onOpenChange, correoSugerido }: ProgramarEnvioModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProgramarEnvioInput>({
    resolver: zodResolver(schema),
    defaultValues: { correo: correoSugerido ?? '', frecuencia: 'semanal' },
  });

  React.useEffect(() => {
    if (open) reset({ correo: correoSugerido ?? '', frecuencia: 'semanal' });
  }, [open, correoSugerido, reset]);

  const onSubmit = handleSubmit((valores) => {
    onOpenChange(false);
    toast.success('Envío programado', {
      description: `El reporte se enviará a ${valores.correo} ${FRECUENCIA_LABEL[valores.frecuencia]}.`,
    });
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="sm"
        title="Programar envío"
        description="El reporte del periodo seleccionado se enviará por correo con la frecuencia elegida."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void onSubmit()} loading={isSubmitting}>
              Programar
            </Button>
          </>
        }
      >
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-5"
          id="form-programar-envio"
          noValidate
        >
          <Input
            label="Correo de destino"
            type="email"
            placeholder="jefe@yamboly.lat"
            required
            {...register('correo')}
            destructive={Boolean(errors.correo)}
            hint={errors.correo?.message}
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-[13px] leading-4 font-medium text-neutral-text">
              Frecuencia
            </legend>
            <RadioGroup
              value={watch('frecuencia')}
              onValueChange={(v) => setValue('frecuencia', v as ProgramarEnvioInput['frecuencia'])}
            >
              {FRECUENCIAS.map((f) => (
                <Radio key={f.value} value={f.value} label={f.label} supporting={f.ayuda} />
              ))}
            </RadioGroup>
          </fieldset>
        </form>
      </ModalContent>
    </Modal>
  );
}
