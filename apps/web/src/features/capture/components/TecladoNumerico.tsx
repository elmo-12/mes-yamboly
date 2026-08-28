'use client';

import { Button, Icon } from '@mes/ui';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'] as const;

/**
 * Teclado numérico 3×4 de la captura de merma (Figma 2163:9376): botones
 * Secondary lg, la última tecla es el retroceso.
 */
export function TecladoNumerico({
  onTecla,
  onBorrar,
  disabled,
}: {
  onTecla: (tecla: string) => void;
  onBorrar: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid w-full grid-cols-3 gap-3" role="group" aria-label="Teclado numérico">
      {TECLAS.map((t) => (
        <Button
          key={t}
          type="button"
          variant="secondary"
          size="lg"
          disabled={disabled}
          onClick={() => onTecla(t)}
        >
          {t}
        </Button>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        aria-label="Borrar"
        disabled={disabled}
        icon={<Icon name="arrow-left" size={20} />}
        iconPosition="only"
        onClick={onBorrar}
      />
    </div>
  );
}
