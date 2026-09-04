'use client';

import * as React from 'react';
import { Button, Checkbox, Input, Modal, ModalClose, ModalContent, toast } from '@mes/ui';
import {
  TIPOS_REGISTRO_TCI,
  TIPO_REGISTRO_TCI_LABEL,
  validarTciSchema,
  type TipoRegistroTci,
} from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useValidarTci } from '../hooks';

export interface ValidarTciModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `YYYY-MM-DD` del primer registro del postest; por defecto el rango completo. */
  desdeSugerido?: string;
  hastaSugerido: string;
}

/**
 * Ejecuta el motor de validación del TCI sobre un rango y unos tipos de
 * registro. Reemplaza las evaluaciones existentes del rango, así que el modal
 * lo advierte antes de lanzar.
 */
export function ValidarTciModal({
  open,
  onOpenChange,
  desdeSugerido,
  hastaSugerido,
}: ValidarTciModalProps) {
  const validar = useValidarTci();
  const [desde, setDesde] = React.useState(desdeSugerido ?? '');
  const [hasta, setHasta] = React.useState(hastaSugerido);
  const [tipos, setTipos] = React.useState<TipoRegistroTci[]>([...TIPOS_REGISTRO_TCI]);
  const [error, setError] = React.useState<string | null>(null);

  /* Al abrir, los campos vuelven al rango que propone la API. */
  React.useEffect(() => {
    if (!open) return;
    setDesde(desdeSugerido ?? '');
    setHasta(hastaSugerido);
    setTipos([...TIPOS_REGISTRO_TCI]);
    setError(null);
  }, [open, desdeSugerido, hastaSugerido]);

  const alternar = (tipo: TipoRegistroTci, marcado: boolean) =>
    setTipos((prev) => (marcado ? [...new Set([...prev, tipo])] : prev.filter((t) => t !== tipo)));

  const ejecutar = async () => {
    const validado = validarTciSchema.safeParse({
      desde: desde || undefined,
      hasta: hasta || undefined,
      tipos: tipos.length > 0 ? tipos : undefined,
    });
    if (!validado.success) {
      setError(validado.error.issues[0]?.message ?? 'Revisa el rango y los tipos.');
      return;
    }
    if (tipos.length === 0) {
      setError('Selecciona al menos un tipo de registro.');
      return;
    }
    if (desde && hasta && desde > hasta) {
      setError('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    setError(null);

    try {
      const resumen = await validar.mutateAsync(validado.data);
      toast.success('Validación ejecutada', {
        description:
          resumen.registrosTotales === 0
            ? 'No había registros del postest en el rango indicado.'
            : `${resumen.registrosCorrectos} de ${resumen.registrosTotales} registros válidos · TCI ${formatNumber(
                resumen.porcentaje ?? 0,
                1,
              )} %.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error('No se pudo ejecutar la validación', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Ejecutar validación de calidad (TCI)"
        description="Compara las capturas del MES con las fuentes externas importadas y reescribe las evaluaciones del rango."
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary" type="button">
                Cancelar
              </Button>
            </ModalClose>
            <Button variant="primary" onClick={ejecutar} loading={validar.isPending}>
              Ejecutar validación
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="date"
              label="Desde"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              hint="Por defecto, el primer registro del postest."
            />
            <Input
              type="date"
              label="Hasta"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              hint="Por defecto, hoy."
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="pb-2 text-body-md font-semibold text-text-primary">
              Tipos de registro a evaluar
            </legend>
            {TIPOS_REGISTRO_TCI.map((tipo) => (
              <Checkbox
                key={tipo}
                size="sm"
                checked={tipos.includes(tipo)}
                onCheckedChange={(valor) => alternar(tipo, valor === true)}
                label={TIPO_REGISTRO_TCI_LABEL[tipo]}
              />
            ))}
          </fieldset>

          {error && <p className="text-body-sm text-error-text">{error}</p>}

          <p className="rounded-md bg-warning-subtle px-4 py-3 text-body-sm text-warning-text">
            La validación reemplaza las evaluaciones que ya existan en este rango, incluidos los
            criterios revisados a mano.
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
