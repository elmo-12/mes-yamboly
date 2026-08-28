import { cn } from '@mes/ui';

/**
 * Fila de contexto precargado de los overlays de captura (Figma 2156:8331):
 * `bg background/subtle`, radio 8, padding 12/10, Body/Small `text/secondary`.
 */
export function ContextoCaptura({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <div
      className={cn('w-full rounded-sm bg-background-subtle px-3 py-2.5', className)}
      data-testid="contexto-captura"
    >
      <p className="text-body-sm text-text-secondary">
        {items.filter(Boolean).join('   ·   ')}
      </p>
    </div>
  );
}
