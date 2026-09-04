'use client';

import * as React from 'react';
import { Badge, Button, DescriptionList } from '@mes/ui';
import type { DescriptionItem } from '@mes/ui';
import type { BajaLogicaResponse, EstadoCatalogo } from '@mes/types';
import { EliminarCausaModal } from './EliminarCausaModal';

export interface CausaDetalleShellProps {
  causa: { id: string; codigo: string; nombre: string };
  /** Línea de apoyo bajo el título: nivel, clasificación y nº de históricos. */
  subtitulo: string;
  /** Badges propios del catálogo, a la izquierda del badge de estado. */
  badges?: React.ReactNode;
  /** Id del `<form>`; el botón Primary lo envía desde el pie. */
  formId: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  /** Filas label/valor del patrón Settings. */
  items: readonly DescriptionItem[];
  /** Estado que muestra el formulario (puede diferir del guardado). */
  estado: EstadoCatalogo;
  onCambiarEstado: (estado: EstadoCatalogo) => void;
  hayCambios: boolean;
  guardando: boolean;
  /** Baja lógica: datos del modal Danger. */
  baja: {
    conservados: number;
    etiquetaConservados: string;
    onConfirmar: (id: string) => Promise<BajaLogicaResponse>;
  };
  onEliminada: () => void;
}

/**
 * Cabecera + filas + pie del panel de detalle de un catálogo de causas
 * (Figma 2163:18282), compartido por paradas y mermas: patrón Settings — filas
 * label/valor con divisores, Toggle para los cambios instantáneos y botonera
 * Danger «Eliminar causa» a la izquierda + Secondary «Desactivar/Activar» +
 * Primary «Guardar cambios».
 */
export function CausaDetalleShell({
  causa,
  subtitulo,
  badges,
  formId,
  onSubmit,
  items,
  estado,
  onCambiarEstado,
  hayCambios,
  guardando,
  baja,
  onEliminada,
}: CausaDetalleShellProps) {
  const [confirmarBaja, setConfirmarBaja] = React.useState(false);
  const activa = estado === 'activo';

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-h3 text-text-primary">{`${causa.codigo} · ${causa.nombre}`}</h2>
          <p className="text-body-sm text-text-secondary">{subtitulo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badges}
          <Badge color={activa ? 'success' : 'neutral'}>{activa ? 'Activa' : 'Inactiva'}</Badge>
        </div>
      </header>

      <form id={formId} onSubmit={onSubmit} noValidate>
        <DescriptionList labelWidth={260} items={items} />
      </form>

      {/* Figma 2163:18282: la acción destructiva va a la izquierda, separada
          del par Secundario/Primario, y siempre pasa por el modal Danger. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="danger" className="mr-auto" onClick={() => setConfirmarBaja(true)}>
          Eliminar causa
        </Button>
        <Button
          variant="secondary"
          onClick={() => onCambiarEstado(activa ? 'inactivo' : 'activo')}
        >
          {activa ? 'Desactivar' : 'Activar'}
        </Button>
        <Button
          variant="primary"
          type="submit"
          form={formId}
          disabled={!hayCambios}
          loading={guardando}
        >
          Guardar cambios
        </Button>
      </div>

      <EliminarCausaModal
        open={confirmarBaja}
        onOpenChange={setConfirmarBaja}
        causa={causa}
        conservados={baja.conservados}
        etiquetaConservados={baja.etiquetaConservados}
        onConfirmar={baja.onConfirmar}
        onEliminada={onEliminada}
      />
    </div>
  );
}

/** Etiqueta de dos líneas (título + apoyo) de las filas del patrón Settings. */
export function EtiquetaCampo({ titulo, apoyo }: { titulo: string; apoyo: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-body text-text-primary">{titulo}</span>
      <span className="text-body-sm text-text-secondary">{apoyo}</span>
    </span>
  );
}
