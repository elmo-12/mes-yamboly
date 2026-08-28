import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './client';

/** Defaults del proyecto: 30 s de frescura y un solo reintento (nunca en 4xx). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (intentos, error) => {
          if (error instanceof ApiClientError && error.statusCode < 500) return false;
          return intentos < 1;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}
