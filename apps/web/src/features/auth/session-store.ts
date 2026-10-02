'use client';

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { User } from '@mes/types';
import { setTokenGetter, setUnauthorizedHandler } from '@/services/api/client';

/**
 * «Recordarme»: con la casilla marcada la sesión se guarda en `localStorage`
 * (sobrevive al cierre del navegador); sin marcar, en `sessionStorage` (se
 * pierde al cerrar el navegador). Antes la casilla no tenía efecto.
 *
 * `sessionStorage` es por pestaña: una pestaña nueva (el Modo TV, un enlace
 * abierto aparte) nacería sin sesión. Por eso, si arranca sin token, se lo
 * pide por `BroadcastChannel` a las pestañas abiertas del mismo navegador y lo
 * copia a su propio `sessionStorage`. Nunca toca `localStorage`: sin
 * «Recordarme», al cerrar el navegador (todas las pestañas) la sesión se pierde.
 */
const CLAVE_RECORDAR = 'mes-yamboly.recordarme';

function recordar(): boolean {
  try {
    return localStorage.getItem(CLAVE_RECORDAR) !== 'false';
  } catch {
    return true;
  }
}

function fijarRecordar(valor: boolean): void {
  try {
    localStorage.setItem(CLAVE_RECORDAR, String(valor));
  } catch {
    /* Almacenamiento bloqueado: se queda el comportamiento por defecto. */
  }
}

const almacenSesion: StateStorage = {
  getItem: (clave) => {
    try {
      return sessionStorage.getItem(clave) ?? localStorage.getItem(clave);
    } catch {
      return null;
    }
  },
  setItem: (clave, valor) => {
    try {
      const [destino, otro] = recordar() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      destino.setItem(clave, valor);
      otro.removeItem(clave);
    } catch {
      /* Sin almacenamiento la sesión vive solo en memoria. */
    }
  },
  removeItem: (clave) => {
    try {
      localStorage.removeItem(clave);
      sessionStorage.removeItem(clave);
    } catch {
      /* nada que borrar */
    }
  },
};

interface SessionState {
  token: string | null;
  user: User | null;
  /** `true` mientras una pestaña nueva espera el token de las demás (guards en espera). */
  sincronizando: boolean;
  /** `true` cuando zustand terminó de leer localStorage (evita parpadeos). */
  hidratado: boolean;
  login: (token: string, user: User, recordarme?: boolean) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hidratado: false,
      sincronizando: false,
      login: (token, user, recordarme = true) => {
        fijarRecordar(recordarme);
        set({ token, user });
      },
      logout: () => set({ token: null, user: null }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'mes-yamboly.session',
      storage: createJSONStorage(() => almacenSesion),
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

/** Canal entre pestañas del mismo origen y navegador (no cruza perfiles ni ventanas privadas). */
const CANAL_SESION = 'mes-yamboly.sesion';
const ESPERA_SESION_MS = 800;

type MensajeSesion =
  | { tipo: 'pedir' }
  | { tipo: 'sesion'; token: string; user: User };

function compartirSesionEntrePestanas(): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  const canal = new BroadcastChannel(CANAL_SESION);

  canal.onmessage = (evento: MessageEvent<MensajeSesion>) => {
    const mensaje = evento.data;
    const { token, user } = useSessionStore.getState();
    if (mensaje?.tipo === 'pedir') {
      if (token && user) canal.postMessage({ tipo: 'sesion', token, user } satisfies MensajeSesion);
    } else if (mensaje?.tipo === 'sesion' && !token && mensaje.token && mensaje.user) {
      /* `persist` lo guarda donde corresponda: `sessionStorage` si no hay «Recordarme». */
      useSessionStore.setState({ token: mensaje.token, user: mensaje.user, sincronizando: false });
    }
  };

  if (useSessionStore.getState().token) return;
  useSessionStore.setState({ sincronizando: true });
  canal.postMessage({ tipo: 'pedir' } satisfies MensajeSesion);
  window.setTimeout(() => useSessionStore.setState({ sincronizando: false }), ESPERA_SESION_MS);
}

compartirSesionEntrePestanas();
