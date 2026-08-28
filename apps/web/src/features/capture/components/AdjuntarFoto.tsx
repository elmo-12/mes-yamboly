'use client';

import * as React from 'react';
import { Button, Icon, Overline } from '@mes/ui';

export interface AdjuntarFotoProps {
  /** Overline de la zona (`EVIDENCIA (FOTO)`). */
  label: string;
  cta: string;
  value?: string;
  onChange: (nombre: string | undefined) => void;
  disabled?: boolean;
}

/**
 * Zona "Evidencia (foto)" de los modales de captura (Figma 2156:8367 y
 * 2163:16222): Button Secondary con icono `camera` sobre un input file oculto.
 * En el mock solo se guarda el nombre del archivo como `evidenciaUrl`.
 */
export function AdjuntarFoto({ label, cta, value, onChange, disabled }: AdjuntarFotoProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Overline>{label}</Overline>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          icon={<Icon name="camera" size={20} />}
          disabled={disabled}
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
        onChange={(e) => onChange(e.target.files?.[0]?.name)}
      />
    </div>
  );
}
