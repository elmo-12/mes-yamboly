/**
 * Evento interno que alimenta el KPI TRI (Anexo 02 · postest).
 * Lo emite B1 en cada registro de parada, merma, velocidad u orden;
 * B2 lo escucha desde `evidence` para crear la fila de `RegistroTiempo`.
 *
 * @example
 * ```ts
 * this.events.emit(TRI_REGISTRO_EVENT, {
 *   tipo: 'parada', segundos: 74, usuarioId: 'USR-02', fecha: '2026-08-28',
 * } satisfies TriRegistroEvent);
 * ```
 */
export const TRI_REGISTRO_EVENT = 'evidence.tri.registro';

export type TriTipoRegistro = 'parada' | 'merma' | 'velocidad' | 'orden';

export interface TriRegistroEvent {
  /** Qué se registró en la app. */
  tipo: TriTipoRegistro;
  /** Segundos que tardó el registro (campo `tiempoRegistroSeg`). */
  segundos: number;
  /** Autor del registro. */
  usuarioId: string;
  /** `YYYY-MM-DD` del registro. */
  fecha: string;
  /** Id del registro creado (parada, merma, velocidad u orden). */
  referenciaId?: string;
  /** Texto legible para el Anexo 02. */
  descripcion?: string;
}
