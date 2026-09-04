'use client';

import * as React from 'react';
import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { BajaLogicaResponse } from '@mes/types';
import { formatNumber } from '@mes/shared';

export interface EliminarCausaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  causa: { id: string; codigo: string; nombre: string };
  /** Registros históricos que conservarán el código tras la baja. */
  conservados: number;
  /** Texto en plural: `paradas históricas`, `mermas históricas`, … */
  etiquetaConservados: string;
  /** Baja lógica del catálogo correspondiente. */
  onConfirmar: (id: string) => Promise<BajaLogicaResponse>;
  /** Se ejecuta cuando la baja termina bien (la vista limpia su selección). */
  onEliminada: () => void;
  titulo?: string;
  descripcion?: string;
}

/**
 * `Configuración / Eliminar causa` (Figma 2165:13853) — Modal Kind=Danger
 * compartido por los catálogos de causas de parada y de merma. El `DELETE` del
 * contrato es una baja lógica: los registros históricos conservan el código
 * para no romper la trazabilidad.
 */
export function EliminarCausaModal({
  open,
  onOpenChange,
  causa,
  conservados,
  etiquetaConservados,
  onConfirmar,
  onEliminada,
  titulo,
  descripcion,
}: EliminarCausaModalProps) {
  const [enviando, setEnviando] = React.useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      const respuesta = await onConfirmar(causa.id);
      toast.success(`Causa ${respuesta.codigo} dada de baja`, { description: respuesta.mensaje });
      onEliminada();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo eliminar la causa', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={titulo ?? `¿Eliminar ${causa.codigo} · ${causa.nombre}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={enviando} onClick={confirmar}>
              Eliminar causa
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción no se puede deshacer</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            {descripcion ??
              `Hay ${formatNumber(conservados)} ${etiquetaConservados} registradas con esta causa; se conservarán con el código ${causa.codigo} para no romper la trazabilidad, pero la causa dejará de estar disponible para nuevos registros.`}
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
