/**
 * Normaliza un filtro que puede llegar repetido (`?lineaId=A&lineaId=B`)
 * o separado por comas (`?lineaId=A,B`).
 */
export function toList(valor: string | string[] | undefined): string[] {
  if (valor === undefined) return [];
  const bruto = Array.isArray(valor) ? valor : [valor];
  return bruto
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Minúsculas sin tildes, para búsquedas tolerantes. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** ISO local `YYYY-MM-DDTHH:mm:ss` (sin desplazamiento UTC). */
export function ahoraIso(fecha: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}`;
}

export function hoyIso(fecha: Date = new Date()): string {
  return ahoraIso(fecha).slice(0, 10);
}

/** Minutos entre dos marcas ISO (nunca negativo). */
export function minutosEntreIso(inicio: string, fin: string): number {
  return Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000));
}

export function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}
