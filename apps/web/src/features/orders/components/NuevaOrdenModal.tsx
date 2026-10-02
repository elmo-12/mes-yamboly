'use client';

import { IniciarOrdenWizard } from '@/features/capture/components/IniciarOrdenWizard';

export interface NuevaOrdenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Nueva orden" de /ordenes: el mismo wizard que Tiempo real (orden SAP →
 * equipo → confirmar), con selector de línea, el mismo vencimiento sugerido y
 * el maquinista/supervisor elegidos por la persona —antes se asignaban en
 * silencio el primer maquinista de la línea, el primer supervisor y 5 operarios—.
 * No mide TRI: el alta desde el repositorio no es un registro de planta.
 */
export function NuevaOrdenModal({ open, onOpenChange }: NuevaOrdenModalProps) {
  return (
    <IniciarOrdenWizard
      abierto={open}
      onOpenChange={onOpenChange}
      titulo="Nueva orden de fabricación"
      medirTri={false}
    />
  );
}
