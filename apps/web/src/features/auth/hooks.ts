'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { authApi } from './api';
import { useSessionStore } from './session-store';

export function useLogin() {
  const login = useSessionStore((s) => s.login);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => {
      login(data.accessToken, data.user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  });
}

export function useLogout() {
  const logout = useSessionStore((s) => s.logout);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
}

export function useMe(habilitado = true) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => authApi.me(),
    enabled: habilitado && Boolean(token),
  });
}
