'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@mes/types';
import { setTokenGetter, setUnauthorizedHandler } from '@/services/api/client';

interface SessionState {
  token: string | null;
  user: User | null;
  /** `true` cuando zustand terminó de leer localStorage (evita parpadeos). */
  hidratado: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hidratado: false,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'mes-yamboly.session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => () => {
        useSessionStore.setState({ hidratado: true });
      },
    }
  )
);

/* El cliente HTTP lee el token desde aquí, sin importar el store en su módulo. */
setTokenGetter(() => useSessionStore.getState().token);
setUnauthorizedHandler(() => useSessionStore.getState().logout());
