'use client';

import * as React from 'react';
import { cn } from '../utils/cn';

/** Avatar de iniciales (MES-local; el MDS no publica componente). 24 · 32 · 36. */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: 24 | 32 | 36;
  tone?: 'primary' | 'neutral';
}

const AVATAR_SIZE = {
  24: 'size-6 text-[10px]',
  32: 'size-8 text-body-sm',
  36: 'size-9 text-body-sm',
} as const;

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function Avatar({ name, size = 32, tone = 'primary', className, ...props }: AvatarProps) {
  return (
    <span
      title={name}
      aria-label={name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-pill font-medium select-none',
        tone === 'primary' ? 'bg-primary-subtle text-info-text' : 'bg-divider text-neutral-text',
        AVATAR_SIZE[size],
        className,
      )}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
