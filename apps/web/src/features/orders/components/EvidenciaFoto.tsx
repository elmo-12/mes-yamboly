'use client';

import { toast } from 'sonner';
import { Icon } from '@mes/ui';
import { abrirArchivo, mensajeDeError } from '@/services/api';

export interface EvidenciaFotoProps {
  /** Ruta guardada en la parada, la merma o la orden; `null` si no hay foto. */
  url?: string | null;
}

/**
 * Enlace a la foto de evidencia de un registro. Abre en pestaña nueva en vez de
 * descargar: en planta se consulta desde la tablet y lo que se quiere es verla.
 *
 * No es un `<a href>` porque el endpoint va autenticado y una pestaña nueva no
 * lleva la cabecera `Authorization`: la imagen se pide con el token y se abre
 * desde un blob, igual que la descarga de exportaciones.
 */
export function EvidenciaFoto({ url }: EvidenciaFotoProps) {
  if (!url) return <span className="text-text-disabled">—</span>;

  const abrir = async () => {
    try {
      /* La API devuelve la ruta ya prefijada (`/api/v1/evidencias/…`) y
         `abrirArchivo` vuelve a anteponer la base, así que se quita aquí. */
      await abrirArchivo(url.replace(/^\/api\/v1/, ''));
    } catch (error) {
      toast.error('No se pudo abrir la foto', {
        description: mensajeDeError(error, 'El archivo ya no está en el servidor.'),
      });
    }
  };

  return (
    <button
      type="button"
      onClick={() => void abrir()}
      className="inline-flex items-center gap-1.5 text-primary hover:underline"
      title="Ver la foto de evidencia"
    >
      <Icon name="camera" size={16} />
      <span className="text-body-sm">Ver foto</span>
    </button>
  );
}
