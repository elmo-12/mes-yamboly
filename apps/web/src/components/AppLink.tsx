import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@mes/ui';

export type AppLinkProps = ComponentProps<typeof Link>;

/** Enlace interno con el estilo de link del MDS (`text/link`, 14/500). */
export function AppLink({ className, ...props }: AppLinkProps) {
  return (
    <Link
      className={cn(
        'text-body-md text-text-link underline-offset-2 transition-colors duration-150 ease-standard',
        'hover:text-primary-hover hover:underline focus-visible:rounded-xs focus-visible:shadow-focus focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}
