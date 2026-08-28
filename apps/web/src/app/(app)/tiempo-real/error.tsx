'use client';

import { RouteError, type RouteErrorProps } from '@/components/RouteError';

export default function Error(props: RouteErrorProps) {
  return <RouteError {...props} />;
}
