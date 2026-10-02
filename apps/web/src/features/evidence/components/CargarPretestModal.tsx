'use client';

import * as React from 'react';
import { Button, Modal, ModalClose, ModalContent, Textarea, toast } from '@mes/ui';
import { cargarPretestSchema } from '@mes/types';
import { formatMinutes } from '@mes/shared';
import { useCargarPretest } from '../hooks';

export interface CargarPretestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filas del pretest ya cargadas: si hay, se pide confirmación antes de reemplazarlas. */
  existentes?: number;
}

const EJEMPLO = `2026-08-24;Registro de producción OF-2026-0812 · Llenadora M2;08:12;3,1
2026-08-24;Registro de parada PM-01 · Llenadora M2;09:41;2,8`;

/**
 * Carga de la hoja de observación del pretest (TRI, Anexo 02). Acepta el CSV
 * pegado desde la hoja digitalizada: `fecha;evento;hora;minutos` por línea.
 */
export function CargarPretestModal({ open, onOpenChange, existentes = 0 }: CargarPretestModalProps) {
  const cargar = useCargarPretest();
  const [texto, setTexto] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  /* La carga **reemplaza** la línea base de la tesis: con filas previas se
     pide una segunda confirmación explícita. */
  const [confirmando, setConfirmando] = React.useState(false);

  React.useEffect(() => {
    if (!open) setConfirmando(false);
  }, [open]);

  const enviar = async () => {
    const registros = parsear(texto);
    const validado = cargarPretestSchema.safeParse({ registros });
    if (!validado.success) {
      const issue = validado.error.issues[0];
      const linea = issue?.path[0] === 'registros' && typeof issue.path[1] === 'number' ? issue.path[1] + 1 : null;
      setError(
        issue
          ? `${linea !== null ? `Línea ${linea}: ` : ''}${issue.message}`
          : 'Revisa el formato: fecha;evento;hora;minutos por línea.',
      );
      setConfirmando(false);
      return;
    }
    setError(null);
    if (existentes > 0 && !confirmando) {
      setConfirmando(true);
      return;
    }
    try {
      const respuesta = await cargar.mutateAsync(validado.data);
      toast.success(`${registros.length} eventos del pretest cargados`, {
        description: `TRI pretest recalculado: ${formatMinutes(respuesta.promedioPretest, 2)}.`,
      });
      setTexto('');
      setConfirmando(false);
      onOpenChange(false);
    } catch (e) {
      toast.error('No se pudo cargar la hoja', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Cargar hoja del pretest (Anexo 02)"
        description="Pega las filas de la hoja de observación digitalizada, una por línea."
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary" type="button">
                Cancelar
              </Button>
            </ModalClose>
            <Button
              variant={confirmando ? 'danger' : 'primary'}
              onClick={enviar}
              loading={cargar.isPending}
              disabled={cargar.isPending}
            >
              {confirmando ? `Reemplazar las ${existentes} filas` : 'Cargar hoja'}
            </Button>
          </>
        }
      >
        <Textarea
          label="Filas del pretest"
          required
          rows={8}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setConfirmando(false);
          }}
          destructive={Boolean(error)}
          hint={error ?? 'Formato por línea: fecha;evento registrado;hora inicio;tiempo (min).'}
          placeholder={EJEMPLO}
        />
        {confirmando && (
          <p role="alert" className="mt-4 rounded-md bg-warning-subtle px-4 py-3 text-body-sm text-warning-text">
            Esta carga reemplaza las {existentes} filas actuales del pretest (línea base de la tesis).
            Las anteriores no se pueden recuperar desde la web. Pulsa «Reemplazar» para confirmar.
          </p>
        )}
      </ModalContent>
    </Modal>
  );
}

interface FilaPretest {
  fecha: string;
  eventoRegistrado: string;
  horaInicioRegistro: string;
  tiempoMin: number;
}

function parsear(texto: string): FilaPretest[] {
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const [fecha = '', evento = '', hora = '', minutos = ''] = linea.split(/[;\t]/);
      return {
        fecha: fecha.trim(),
        eventoRegistrado: evento.trim(),
        horaInicioRegistro: hora.trim(),
        tiempoMin: Number(minutos.trim().replace(',', '.')),
      };
    });
}
