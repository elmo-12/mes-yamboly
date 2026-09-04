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

/**
 * "Día operativo" para módulos de tiempo real que buscan "la orden de hoy"
 * (`RealtimeService.contexto`): normalmente es la fecha real (`hoyIso()`),
 * pero los seeds de demostración congelan las órdenes en una fecha fija
 * (`HOY` de `database/seeds/data/seed.ts`), que deja de coincidir con el
 * reloj real fuera de ese día — sin esta regla ninguna orden calzaría con
 * "hoy" y las líneas nunca llegarían a `produciendo`/`parada`/`alerta`.
 *
 * Regla: si existe alguna orden fechada en el día real, ese es el día
 * operativo (así una orden creada hoy por la API se refleja de inmediato);
 * si no hay ninguna, se usa la fecha de la orden `en_curso` más reciente y,
 * en su defecto, la fecha más reciente con órdenes — de modo que el estado
 * calculado siga siendo consistente con los datos sembrados sin importar la
 * fecha real del servidor.
 */
export function diaOperativo(
  ordenes: readonly { fecha: string; estado: string }[],
  hoy: string = hoyIso(),
): string {
  if (ordenes.some((o) => o.fecha === hoy)) return hoy;
  const masRecienteEnCurso = ordenes
    .filter((o) => o.estado === 'en_curso')
    .reduce<{ fecha: string } | null>(
      (mejor, o) => (!mejor || o.fecha > mejor.fecha ? o : mejor),
      null,
    );
  if (masRecienteEnCurso) return masRecienteEnCurso.fecha;
  const masReciente = ordenes.reduce<{ fecha: string } | null>(
    (mejor, o) => (!mejor || o.fecha > mejor.fecha ? o : mejor),
    null,
  );
  return masReciente?.fecha ?? hoy;
}

/** Minutos entre dos marcas ISO (nunca negativo). */
export function minutosEntreIso(inicio: string, fin: string): number {
  return Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000));
}

export function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}
