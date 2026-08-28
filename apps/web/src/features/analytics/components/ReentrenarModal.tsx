'use client';

import * as React from 'react';
import { Button, DescriptionList, Modal, ModalContent } from '@mes/ui';
import { formatNumber } from '@mes/shared';

export interface ReentrenarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmar: () => void;
  cargando?: boolean;
  versionActual: string;
  eventos: number;
  algoritmo: string;
}

/**
 * Confirmación de "Reentrenar" (solo jefe de producción). El reentrenamiento
 * genera una versión nueva; la vigente no cambia hasta que termina.
 */
export function ReentrenarModal({
  open,
  onOpenChange,
  onConfirmar,
  cargando = false,
  versionActual,
  eventos,
  algoritmo,
}: ReentrenarModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="sm"
        title="Reentrenar el modelo"
        description="Se ejecutarán las fases 3 a 5 de CRISP-DM con todos los eventos registrados. La versión vigente sigue atendiendo las predicciones hasta que la nueva quede activa."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={onConfirmar} loading={cargando}>
              Reentrenar
            </Button>
          </>
        }
      >
        <DescriptionList
          labelWidth={180}
          items={[
            { label: 'Versión vigente', value: versionActual },
            { label: 'Eventos disponibles', value: formatNumber(eventos) },
            { label: 'Algoritmo', value: algoritmo },
            { label: 'Duración estimada', value: 'Menos de 1 minuto' },
          ]}
        />
      </ModalContent>
    </Modal>
  );
}
