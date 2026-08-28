const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-08-28` → `28 ago` (etiqueta de los ejes X). */
export function etiquetaFecha(isoFecha: string): string {
  const d = new Date(`${isoFecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/** Normaliza `?lineaId=A&lineaId=B` y `?lineaId=A,B` a `['A','B']`. */
export function toList(valor: string | string[] | undefined): string[] {
  if (valor === undefined) return [];
  const bruto = Array.isArray(valor) ? valor : [valor];
  return bruto
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

/** ISO local `YYYY-MM-DDTHH:mm:ss` (sin desplazamiento UTC). */
export function ahoraIso(fecha: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}`;
}

/** `1 048 576` → `1,0 MB`. */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
