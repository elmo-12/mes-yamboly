'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Tabla integrada MDS: vive directamente sobre la página (nunca dentro de una card).
 * Cabecera 40 px con fondo `background/subtle` y Label/Overline; filas con altura por
 * densidad (`--row-h`); divisores 1 px horizontales; sin líneas verticales.
 */
export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** `dense` = 13 px (tablas de listado) · `default` = 14 px (tablas de dashboard). */
  density?: 'dense' | 'default';
}

export function Table({ className, density = 'default', ...props }: TableProps) {
  return (
    /* `relative`: sin bloque contenedor posicionado, los `sr-only`
       (position:absolute) de las cabeceras se colocaban respecto al body y
       provocaban scroll horizontal de la página cuando la tabla desborda. */
    <div className="relative w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse',
          density === 'dense' ? 'text-[13px] leading-5' : 'text-body',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export interface THeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /** Cabecera sobre `background/subtle` (variante MDS genérica). Por defecto, blanca. */
  subtle?: boolean;
}

export function THead({ className, subtle = false, ...props }: THeadProps) {
  return (
    <thead
      className={cn(
        'border-b border-border',
        subtle ? 'bg-background-subtle' : 'bg-background-main',
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export interface THeadCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Muestra el indicador de orden. */
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  numeric?: boolean;
}

export function TH({
  className,
  sortable = false,
  sortDirection = null,
  numeric = false,
  children,
  ...props
}: THeadCellProps) {
  return (
    <th
      scope="col"
      aria-sort={sortable ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none') : undefined}
      className={cn(
        'h-10 px-3 text-overline whitespace-nowrap text-text-disabled uppercase',
        numeric ? 'text-right' : 'text-left',
        sortable && 'cursor-pointer select-none hover:text-text-secondary',
        className,
      )}
      {...props}
    >
      <span className={cn('inline-flex items-center gap-1', numeric && 'justify-end')}>
        {children}
        {sortable &&
          (sortDirection === 'asc' ? (
            <ChevronUp className="size-3 text-text-secondary" aria-hidden />
          ) : sortDirection === 'desc' ? (
            <ChevronDown className="size-3 text-text-secondary" aria-hidden />
          ) : (
            <ChevronsUpDown className="size-3 text-text-disabled" aria-hidden />
          ))}
      </span>
    </th>
  );
}

export interface TRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  /** Deshabilita el hover (p. ej. filas de totales). */
  plain?: boolean;
}

export function TRow({ className, selected = false, plain = false, ...props }: TRowProps) {
  return (
    <tr
      data-selected={selected ? '' : undefined}
      className={cn(
        'h-(--row-h) border-b border-(--row-divider)',
        !plain && 'transition-colors duration-150 ease-standard hover:bg-background-subtle',
        selected && 'bg-primary-subtle hover:bg-primary-subtle',
        className,
      )}
      {...props}
    />
  );
}

export interface TCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  muted?: boolean;
}

export function TCell({ className, numeric = false, muted = false, ...props }: TCellProps) {
  return (
    <td
      className={cn(
        'px-3 align-middle',
        numeric ? 'tabular text-right' : 'text-left',
        muted ? 'text-text-secondary' : 'text-text-primary',
        className,
      )}
      {...props}
    />
  );
}

/** Celda de selección: 44 px de ancho fijo, según la retícula de tabla del MDS. */
export function TSelectCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('w-11 pl-3 align-middle', className)} {...props} />;
}

export function TSelectHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn('w-11 pl-3', className)} {...props} />;
}

/* -------------------------------------------------------------- Pagination */

export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  page: number;
  pageSize: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Botones de navegación (Button secondary sm). */
  actions?: React.ReactNode;
}

/** Separador de miles con espacio fino, como en el diseño ("1 248"). */
function nf(value: number): string {
  return new Intl.NumberFormat('es-PE').format(value).replace(/,/g, '\u202F');
}

/** Pie de tabla: "Mostrando 1–8 de 1 248" + Anterior/Siguiente. */
export function Pagination({
  page,
  pageSize,
  total,
  actions,
  className,
  ...props
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className={cn('flex items-center justify-between gap-4 pt-4', className)} {...props}>
      <p className="text-body-sm text-text-secondary">
        Mostrando <span className="tabular">{nf(from)}</span>–
        <span className="tabular">{nf(to)}</span> de{' '}
        <span className="tabular">{nf(total)}</span>
      </p>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
