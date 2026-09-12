'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button, Icon, Overline } from '@mes/ui';
import { mensajeDeError } from '@/services/api';
import { subirEvidencia } from '../api';

export interface AdjuntarFotoProps {
  /** Overline de la zona (`EVIDENCIA (FOTO)`). */
  label: string;
  cta: string;
  /** Nombre del archivo elegido, para mostrarlo junto al botón. */
  value?: string;
  /**
   * Se invoca con la ruta que devolvió el servidor (`/api/v1/evidencias/…`) y
   * el nombre original, o con `undefined` si se descarta la foto.
   */
  onChange: (evidencia: { url: string; nombre: string } | undefined) => void;
  disabled?: boolean;
}

/**
 * Zona "Evidencia (foto)" de los modales de captura (Figma 2156:8367 y
 * 2163:16222): Button Secondary con icono `camera` sobre un input file oculto.
 *
 * La foto **se sube en cuanto se elige** (`POST /evidencias`) y lo que viaja en
 * el formulario es la ruta que devuelve el servidor. Antes sólo se guardaba
 * `file.name`, así que la evidencia que exigen algunas causas no existía en
 * ninguna parte; subirla aquí, y no al enviar, hace que un fallo de red se vea
 * antes de que el maquinista pierda lo que lleva escrito.
 */
export function AdjuntarFoto({ label, cta, value, onChange, disabled }: AdjuntarFotoProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = React.useState(false);

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) {
      onChange(undefined);
      return;
    }
    setSubiendo(true);
    try {
      const guardada = await subirEvidencia(archivo);
      onChange({ url: guardada.url, nombre: guardada.nombreOriginal });
    } catch (error) {
      onChange(undefined);
      toast.error('No se pudo subir la foto', {
        description: mensajeDeError(error, 'Vuelve a intentarlo o continúa sin evidencia.'),
      });
    } finally {
      setSubiendo(false);
      /* Se limpia el input para poder reintentar con el mismo archivo. */
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Overline>{label}</Overline>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          icon={<Icon name="camera" size={20} />}
          disabled={disabled || subiendo}
          loading={subiendo}
          onClick={() => inputRef.current?.click()}
        >
          {cta}
        </Button>
        {value && (
          <span className="min-w-0 truncate text-body-sm text-text-secondary" title={value}>
            {value}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void elegir(e.target.files?.[0])}
      />
    </div>
  );
}
