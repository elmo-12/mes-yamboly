import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Escala tipográfica propia del MDS (`--text-*` de `theme.css`).
 *
 * Sin declararla, tailwind-merge no reconoce `text-btn-lg` / `text-h2` / … como
 * tamaños de fuente y los clasifica como color de texto: al combinar
 * `text-primary-foreground` con `text-btn-lg` en el mismo componente eliminaba
 * el color y el label del Button Primary quedaba en `text/primary`.
 */
const TEXT_SIZES = [
  'display',
  'h1',
  'h2',
  'h3',
  'h4',
  'body-lg',
  'body',
  'body-md',
  'body-sm',
  'label',
  'badge',
  'caption',
  'overline',
  'btn-sm',
  'btn-lg',
  'metric',
  'tv-clock',
  'tv-line',
  'tv-metric',
  'tv-value',
  'tv-state',
  'tv-note',
  'tv-sub',
] as const;

/** Sombras del MDS (`--shadow-*`), para que no se confundan con `shadow-<color>`. */
const SHADOWS = [
  'subtle',
  'dropdown',
  'modal',
  'drawer',
  'drawer-left',
  'floatingnav',
  'focus',
  'focus-error',
  'thumb',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TEXT_SIZES] }],
      shadow: [{ shadow: [...SHADOWS] }],
    },
  },
});

/** Une clases condicionales y resuelve conflictos de Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
