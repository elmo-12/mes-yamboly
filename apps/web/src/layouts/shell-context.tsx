'use client';

import * as React from 'react';
import type { Crumb } from '@mes/ui';

type Labels = Readonly<Record<string, string>>;
type Counts = Readonly<Record<string, number>>;

interface ShellContextValue {
  /** Sobrescritura completa del breadcrumb; `null` = se calcula desde la ruta. */
  crumbs: Crumb[] | null;
  setCrumbs: (crumbs: Crumb[] | null) => void;
  /** Etiquetas por segmento de ruta (p. ej. `{ 'of-2026-0815': 'OF-2026-0815' }`). */
  labels: Labels;
  setSegmentLabel: (segmento: string, label: string | undefined) => void;
  /** Contadores de la navegación, por `countKey` de `config/navigation.ts`. */
  counts: Counts;
  setNavCount: (key: string, valor: number | undefined) => void;
}

const ShellContext = React.createContext<ShellContextValue | null>(null);

/** Estado compartido del shell: breadcrumb dinámico y contadores del sidebar. */
export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = React.useState<Crumb[] | null>(null);
  const [labels, setLabels] = React.useState<Labels>({});
  const [counts, setCounts] = React.useState<Counts>({});

  const setSegmentLabel = React.useCallback((segmento: string, label: string | undefined) => {
    setLabels((prev) => {
      if (label === undefined) {
        if (!(segmento in prev)) return prev;
        const { [segmento]: _omitido, ...resto } = prev;
        return resto;
      }
      if (prev[segmento] === label) return prev;
      return { ...prev, [segmento]: label };
    });
  }, []);

  const setNavCount = React.useCallback((key: string, valor: number | undefined) => {
    setCounts((prev) => {
      if (valor === undefined) {
        if (!(key in prev)) return prev;
        const { [key]: _omitido, ...resto } = prev;
        return resto;
      }
      if (prev[key] === valor) return prev;
      return { ...prev, [key]: valor };
    });
  }, []);

  const value = React.useMemo<ShellContextValue>(
    () => ({ crumbs, setCrumbs, labels, setSegmentLabel, counts, setNavCount }),
    [crumbs, labels, setSegmentLabel, counts, setNavCount],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/**
 * Acceso al breadcrumb y a los contadores del shell. Fuera del `ShellProvider`
 * devuelve un valor inerte para que las páginas puedan renderizarse sueltas
 * (Modo TV, encuesta pública, tests).
 */
export function useBreadcrumb(): ShellContextValue {
  const ctx = React.useContext(ShellContext);
  return ctx ?? INERTE;
}

/**
 * Registra la etiqueta de un segmento dinámico mientras la página está montada.
 * `useBreadcrumbLabel(id, orden?.codigo)` en `/ordenes/[id]` convierte
 * `Inicio › Órdenes › of-2026-0815` en `Inicio › Órdenes › OF-2026-0815`.
 */
export function useBreadcrumbLabel(segmento: string, label: string | undefined): void {
  const { setSegmentLabel } = useBreadcrumb();
  React.useEffect(() => {
    if (!label) return;
    setSegmentLabel(segmento, label);
    return () => setSegmentLabel(segmento, undefined);
  }, [segmento, label, setSegmentLabel]);
}

/** Publica un contador en la navegación (Badge del ítem Alertas). */
export function useNavCount(key: string, valor: number | undefined): void {
  const { setNavCount } = useBreadcrumb();
  React.useEffect(() => {
    setNavCount(key, valor);
    return () => setNavCount(key, undefined);
  }, [key, valor, setNavCount]);
}

const INERTE: ShellContextValue = {
  crumbs: null,
  setCrumbs: () => undefined,
  labels: {},
  setSegmentLabel: () => undefined,
  counts: {},
  setNavCount: () => undefined,
};
