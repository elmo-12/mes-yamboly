'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { formatDate, formatNumber } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { Forbidden } from '@/components/Forbidden';
import { PageSkeleton } from '@/components/PageSkeleton';
import { useRequireRole } from '@/hooks/use-require-role';
import { useSession } from '@/hooks/use-session';
import {
  useAnaliticaResumen,
  useEstadoDatos,
  useModelo,
  usePatrones,
  usePredicciones,
  useReentrenar,
} from '../hooks';
import { DatosInsuficientes } from './DatosInsuficientes';
import { ModeloTab } from './ModeloTab';
import { PatronesTab } from './PatronesTab';
import { PrediccionesTab } from './PrediccionesTab';
import { ReentrenarModal } from './ReentrenarModal';
import { ResumenTab } from './ResumenTab';

const ROLES = ['jefe', 'supervisor', 'investigador'] as const;

const TABS = ['resumen', 'patrones', 'predicciones', 'modelo'] as const;
type AnaliticaTab = (typeof TABS)[number];

const TAB_LABEL: Record<AnaliticaTab, string> = {
  resumen: 'Resumen',
  patrones: 'Patrones',
  predicciones: 'Predicciones',
  modelo: 'Modelo',
};

function esTab(v: string | null): v is AnaliticaTab {
  return v !== null && (TABS as readonly string[]).includes(v);
}

/**
 * `MES / Analítica IA` (Figma 2156:4301 · 4412 · 4523 · 4634 · 4745).
 * Page header + Tabs en `?tab=`; `?estado=insuficiente` pide al backend la
 * variante de la fase de acumulación de datos (estado E).
 */
export function AnaliticaPage() {
  const { listo, permitido } = useRequireRole(ROLES);
  const { rol } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: AnaliticaTab = esTab(searchParams.get('tab')) ? (searchParams.get('tab') as AnaliticaTab) : 'resumen';
  const estadoForzado = searchParams.get('estado') ?? undefined;

  const irA = React.useCallback(
    (siguiente: AnaliticaTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (siguiente === 'resumen') params.delete('tab');
      else params.set('tab', siguiente);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const estadoDatos = useEstadoDatos(estadoForzado);
  const resumen = useAnaliticaResumen();
  const patrones = usePatrones();
  const predicciones = usePredicciones();
  const modelo = useModelo();
  const reentrenar = useReentrenar();
  const [confirmarReentrenar, setConfirmarReentrenar] = React.useState(false);

  const entrenando = modelo.data?.reentrenamiento?.estado === 'entrenando';
  const versionEntrenando = modelo.data?.reentrenamiento?.version;

  /* Avisa cuando el reentrenamiento termina y la nueva versión queda vigente. */
  const anteriorEntrenando = React.useRef(false);
  React.useEffect(() => {
    if (anteriorEntrenando.current && !entrenando && modelo.data?.reentrenamiento?.estado === 'listo') {
      toast.success('Reentrenamiento terminado', {
        description: modelo.data.reentrenamiento.mensaje,
      });
    }
    anteriorEntrenando.current = entrenando;
  }, [entrenando, modelo.data?.reentrenamiento]);

  if (!listo) return <PageSkeleton kpis={4} bloques={2} />;
  if (!permitido) return <Forbidden recurso="Analítica inteligente" />;

  if (estadoDatos.isPending) return <PageSkeleton kpis={4} bloques={2} />;
  if (estadoDatos.isError) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo consultar el estado del modelo"
        description="El servicio de analítica no respondió. Vuelve a intentarlo en unos segundos."
        action={
          <Button variant="secondary" onClick={() => void estadoDatos.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  const info = resumen.data?.modelo;
  const subtitulo = info
    ? `Modelo ${info.version} · Entrenado el ${formatDate(info.entrenadoEn)} con ${formatNumber(info.eventos)} eventos · CRISP-DM`
    : 'Metodología CRISP-DM · patrones, predicciones y versiones';

  const insuficiente = !estadoDatos.data.suficiente;

  return (
    <>
      <AppPageHeader
        title="Analítica inteligente"
        subtitle={
          insuficiente
            ? 'Fase de acumulación de datos · Metodología CRISP-DM'
            : subtitulo
        }
        breadcrumb={[
          { label: 'Inicio', href: '/' },
          { label: 'Analítica IA', href: '/analitica' },
          { label: insuficiente ? 'Datos insuficientes' : TAB_LABEL[tab] },
        ]}
        linkComponent={AppLink}
        titleSlot={
          entrenando ? (
            <Badge color="warning" dot>
              Entrenando {versionEntrenando}
            </Badge>
          ) : undefined
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => irA('modelo')}>
              {insuficiente ? 'Ver metodología' : 'Ver modelo'}
            </Button>
            {!insuficiente && rol === 'jefe' && (
              <Button
                variant="primary"
                icon={<Icon name="arrow-path" />}
                disabled={entrenando}
                loading={reentrenar.isPending}
                onClick={() => setConfirmarReentrenar(true)}
              >
                {entrenando ? 'Entrenando…' : 'Reentrenar'}
              </Button>
            )}
          </>
        }
      />

      {insuficiente && tab === 'modelo' ? (
        /* La metodología CRISP-DM es documentación: se consulta aunque todavía
           no haya datos suficientes para entrenar. */
        modelo.isPending ? (
          <PageSkeleton kpis={0} bloques={2} />
        ) : modelo.isError ? (
          <ErrorTab onReintentar={() => void modelo.refetch()} />
        ) : (
          <ModeloTab modelo={modelo.data} entrenando={entrenando} />
        )
      ) : insuficiente ? (
        <DatosInsuficientes estado={estadoDatos.data} onVerMetodologia={() => irA('modelo')} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => irA(v as AnaliticaTab)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {TAB_LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="resumen">
            {resumen.isPending ? (
              <PageSkeleton kpis={4} bloques={2} />
            ) : resumen.isError ? (
              <ErrorTab onReintentar={() => void resumen.refetch()} />
            ) : (
              <ResumenTab resumen={resumen.data} />
            )}
          </TabsContent>

          <TabsContent value="patrones">
            {patrones.isPending ? (
              <PageSkeleton kpis={0} bloques={2} />
            ) : patrones.isError ? (
              <ErrorTab onReintentar={() => void patrones.refetch()} />
            ) : (
              <PatronesTab patrones={patrones.data} />
            )}
          </TabsContent>

          <TabsContent value="predicciones">
            {predicciones.isPending ? (
              <PageSkeleton kpis={0} bloques={2} />
            ) : predicciones.isError ? (
              <ErrorTab onReintentar={() => void predicciones.refetch()} />
            ) : (
              <PrediccionesTab predicciones={predicciones.data} />
            )}
          </TabsContent>

          <TabsContent value="modelo">
            {modelo.isPending ? (
              <PageSkeleton kpis={0} bloques={2} />
            ) : modelo.isError ? (
              <ErrorTab onReintentar={() => void modelo.refetch()} />
            ) : (
              <ModeloTab modelo={modelo.data} entrenando={entrenando} />
            )}
          </TabsContent>
        </Tabs>
      )}

      {info && (
        <ReentrenarModal
          open={confirmarReentrenar}
          onOpenChange={setConfirmarReentrenar}
          cargando={reentrenar.isPending}
          versionActual={info.version}
          eventos={estadoDatos.data.eventos}
          algoritmo={info.algoritmo}
          onConfirmar={() => {
            setConfirmarReentrenar(false);
            reentrenar.mutate(undefined, {
              onSuccess: (job) =>
                toast.success('Reentrenamiento iniciado', {
                  description: `${job.mensaje} · la versión ${job.version} quedará vigente al terminar.`,
                }),
              onError: () => toast.error('No se pudo iniciar el reentrenamiento'),
            });
          }}
        />
      )}
    </>
  );
}

function ErrorTab({ onReintentar }: { onReintentar: () => void }) {
  return (
    <EmptyState
      variant="error"
      icon={<Icon name="alert-circle" size={40} />}
      title="No se pudieron cargar los datos"
      description="El servicio de analítica no respondió. Vuelve a intentarlo en unos segundos."
      action={
        <Button variant="secondary" onClick={onReintentar}>
          Reintentar
        </Button>
      }
    />
  );
}
