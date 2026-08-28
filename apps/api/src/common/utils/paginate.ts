import type { Paginated } from '@mes/types';

/** Corta un arreglo en memoria y arma `{ data, meta }`. */
export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const desde = (page - 1) * pageSize;
  return {
    data: items.slice(desde, desde + pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}
