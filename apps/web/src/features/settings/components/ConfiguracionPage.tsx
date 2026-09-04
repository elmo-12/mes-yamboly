'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { Forbidden } from '@/components/Forbidden';
import { PageSkeleton } from '@/components/PageSkeleton';
import { useRequireRole } from '@/hooks/use-require-role';
import { CausasMermaTab } from './CausasMermaTab';
import { CausasParadaTab } from './CausasParadaTab';
import { LineasTab } from './LineasTab';
import { ProductosVelocidadesTab } from './ProductosVelocidadesTab';
import { UmbralesTab } from './UmbralesTab';
import { UsuariosTab } from './UsuariosTab';

const TABS = [
  { id: 'causas-parada', label: 'Causas de parada' },
  { id: 'causas-merma', label: 'Causas de merma' },
  { id: 'lineas', label: 'Líneas' },
  { id: 'productos', label: 'Productos y velocidades' },
  { id: 'umbrales', label: 'Umbrales de alerta' },
  { id: 'usuarios', label: 'Usuarios' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Compatibilidad de enlaces guardados: la pestaña «Máquinas» pasó a «Líneas»
 * (la línea es la máquina física) y «Sedes y usuarios» a «Usuarios» (la app
 * opera una única sede).
 */
const ALIAS_TAB: Record<string, TabId> = {
  maquinas: 'lineas',
  sedes: 'usuarios',
};

/** Configuración es catálogo maestro: solo jefatura y supervisión (RNF14). */
const ROLES = ['jefe', 'supervisor'] as const;

/** `MES / Configuración` (Figma 2163:18282 · 2165:11984 · 2165:13218). */
export function ConfiguracionPage() {
  const { listo, permitido } = useRequireRole(ROLES);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tabParam = params.get('tab');
  const tabResuelto = tabParam ? (ALIAS_TAB[tabParam] ?? tabParam) : null;
  const tab: TabId = TABS.some((t) => t.id === tabResuelto)
    ? (tabResuelto as TabId)
    : 'causas-parada';

  const cambiarTab = React.useCallback(
    (valor: string) => {
      const next = new URLSearchParams(params.toString());
      if (valor === 'causas-parada') next.delete('tab');
      else next.set('tab', valor);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  if (!listo) return <PageSkeleton kpis={0} bloques={2} />;
  if (!permitido) return <Forbidden recurso="Configuración" />;

  return (
    <>
      <AppPageHeader
        title="Configuración"
        subtitle="Catálogos maestros · codificación uniforme de causas, líneas, productos y usuarios"
      />

      <Tabs value={tab} onValueChange={cambiarTab}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="causas-parada">
          <CausasParadaTab />
        </TabsContent>
        <TabsContent value="causas-merma">
          <CausasMermaTab />
        </TabsContent>
        <TabsContent value="lineas">
          <LineasTab />
        </TabsContent>
        <TabsContent value="productos">
          <ProductosVelocidadesTab />
        </TabsContent>
        <TabsContent value="umbrales">
          <UmbralesTab />
        </TabsContent>
        <TabsContent value="usuarios">
          <UsuariosTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
