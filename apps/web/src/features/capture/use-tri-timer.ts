'use client';

import * as React from 'react';

/** `23` → `00:23` (formato del chip TRI del header de los modales de captura). */
export function formatTri(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** `23` → `0:23` (texto del toast "Parada registrada en 0:23"). */
export function formatTriCorto(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export interface TriTimer {
  /** Segundos transcurridos desde que se abrió el overlay. */
  segundos: number;
  /** Valor para `<TimerChip value={…} />`. */
  etiqueta: string;
  /**
   * Detiene el cronómetro y devuelve el tiempo de registro definitivo.
   * Se llama justo antes de enviar la mutación: ese valor viaja en
   * `tiempoRegistroSeg` y alimenta el KPI TRI (Anexo 02).
   */
  detener: () => number;
}

/**
 * Cronómetro TRI (OE1). Arranca al abrir el overlay de captura y se detiene al
 * guardar; el valor se envía en `tiempoRegistroSeg` de cada mutación.
 */
export function useTriTimer(activo: boolean): TriTimer {
  const [segundos, setSegundos] = React.useState(0);
  const inicioRef = React.useRef<number | null>(null);
  const detenidoRef = React.useRef(false);

  React.useEffect(() => {
    if (!activo) {
      inicioRef.current = null;
      detenidoRef.current = false;
      setSegundos(0);
      return;
    }
    inicioRef.current = Date.now();
    detenidoRef.current = false;
    setSegundos(0);
    const id = window.setInterval(() => {
      if (detenidoRef.current || inicioRef.current === null) return;
      setSegundos(Math.floor((Date.now() - inicioRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [activo]);

  const detener = React.useCallback(() => {
    detenidoRef.current = true;
    if (inicioRef.current === null) return 0;
    const total = Math.round((Date.now() - inicioRef.current) / 1000);
    setSegundos(total);
    return total;
  }, []);

  return { segundos, etiqueta: formatTri(segundos), detener };
}
