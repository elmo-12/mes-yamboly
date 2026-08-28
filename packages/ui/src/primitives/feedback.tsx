'use client';

import * as React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../utils/cn';

/** Bloque de carga (`divider` como color de reposo, radio 8). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-sm bg-divider', className)} {...props} />;
}

/** Divisor 1 px horizontal (regla MDS: nunca vertical fuera de tablas densas). */
export function Divider({
  className,
  soft = false,
  ...props
}: React.HTMLAttributes<HTMLHRElement> & { soft?: boolean }) {
  return (
    <hr
      className={cn('h-px w-full border-0', soft ? 'bg-divider-soft' : 'bg-divider', className)}
      {...props}
    />
  );
}

/** Etiqueta Label/Overline (11/600, +0.55 px, mayúsculas). */
export function Overline({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('block text-overline text-text-secondary uppercase', className)} {...props}>
      {children}
    </span>
  );
}

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/** Spinner 14 px (medida MDS del estado Loading del Button). */
export function Spinner({ size = 14, className, ...props }: SpinnerProps) {
  return (
    <LoaderCircle
      width={size}
      height={size}
      className={cn('animate-spin text-current', className)}
      aria-hidden
      {...props}
    />
  );
}

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. */
  value: number;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  /** Alto de la barra en px (6 por defecto). */
  height?: number;
  label?: string;
}

const TONE = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  neutral: 'bg-border-strong',
} as const;

/** Barra de progreso delgada con color semántico. */
export function ProgressBar({
  value,
  tone = 'primary',
  height = 6,
  label,
  className,
  ...props
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-xs bg-divider', className)}
      style={{ height }}
      {...props}
    >
      <div
        className={cn('h-full rounded-xs transition-[width] duration-200 ease-standard', TONE[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export interface SectionTitleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Acción alineada a la derecha. */
  actions?: React.ReactNode;
  /** Regla `divider` a 12 px bajo el bloque (Figma `MES / Section title` 2149:59). */
  divider?: boolean;
  /** Nivel semántico del encabezado (`h2` por defecto). */
  as?: 'h2' | 'h3';
}

/** Título de sección: H4 + descripción opcional + acción a la derecha. */
export function SectionTitle({
  title,
  description,
  actions,
  divider = false,
  as: Heading = 'h2',
  className,
  ...props
}: SectionTitleProps) {
  return (
    <div className={cn('flex w-full flex-col gap-3', className)} {...props}>
      {/* `flex-wrap` + acciones a ancho completo por debajo de `sm`: en móvil
          la barra de acciones baja de línea en vez de desbordar la página. */}
      <div className="flex w-full flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading className="text-h4 text-text-primary">{title}</Heading>
          {description && <p className="text-body-sm text-text-secondary">{description}</p>}
        </div>
        {actions && (
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
            {actions}
          </div>
        )}
      </div>
      {divider && <hr className="h-px w-full border-0 bg-divider" />}
    </div>
  );
}
