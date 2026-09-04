'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  Icon,
  Input,
  Pagination,
  ProgressBar,
  SectionTitle,
  Skeleton,
  SummaryCard,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  type FilterGroup,
} from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import {
  ESTADOS_ALERTA,
  ESTADO_ALERTA_LABEL,
  SEVERIDADES_ALERTA,
  SEVERIDAD_ALERTA_LABEL,
  TIPOS_ALERTA,
  TIPO_ALERTA_LABEL,
  type Alerta,
  type AlertaListQuery,
  type EstadoAlerta,
  type SeveridadAlerta,
  type TipoAlerta,
} from '@mes/types';
import { formatPct } from '@mes/shared';
import { useLineas } from '@/features/catalogs/hooks';
import { useAlertas, useAlertasResumen } from '../hooks';
import { AlertaDrawer } from './AlertaDrawer';
import { ConfirmarLoteModal } from './ConfirmarLoteModal';
import { UmbralesDrawer } from './UmbralesDrawer';
import {
  AciertoMark,
  ESTADO_BADGE,
  SEVERIDAD_BADGE,
  esperaConfirmacion,
  formatVentana,
  etiquetaLinea,
  toneProbabilidad,
} from './alerta-format';

const PAGE_SIZE = 8;

/** Vista rápida seleccionada desde las Summary card. */
type Vista = 'activas' | 'atendidas' | 'pendientes' | 'vencidas';

const VISTA_ESTADO: Record<Vista, EstadoAlerta[]> = {
  activas: ['activa'],
  atendidas: ['atendida'],
  pendientes: [],
  vencidas: ['vencida'],
};

/**
 * `Alertas / Bandeja` — Figma 2156:5417 (+ empty 2163:13378).
 * Page header con EP acumulada, 4 Summary card que filtran, filter bar apilada,
 * tabla de 9 columnas y paginación. La fila abre el drawer de detalle (`?id=`).
 */
export function AlertasPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [umbralesAbierto, setUmbralesAbierto] = React.useState(false);
  const [loteAbierto, setLoteAbierto] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState(params.get('search') ?? '');

  const { data: resumen } = useAlertasResumen();
  const { data: lineas } = useLineas();

  const vista = (params.get('vista') as Vista | null) ?? null;
  const page = Number(params.get('page')) > 0 ? Number(params.get('page')) : 1;
  const alertaId = params.get('id') ?? undefined;

  const filtros = React.useMemo(
    () => ({
      tipo: leerLista(params.get('tipo')),
      severidad: leerLista(params.get('severidad')),
      lineaId: leerLista(params.get('lineaId')),
      estado: leerLista(params.get('estado')),
    }),
    [params],
  );

  const estadoConsulta = React.useMemo(() => {
    if (vista && VISTA_ESTADO[vista].length > 0) return VISTA_ESTADO[vista] as string[];
    return filtros.estado;
  }, [vista, filtros.estado]);

  const query: AlertaListQuery = React.useMemo(
    () => ({
      page: vista === 'pendientes' ? 1 : page,
      // "Pendientes de confirmar" no es un filtro de la API: se trae la bandeja
      // completa y se acota en cliente (ver `filas`).
      pageSize: vista === 'pendientes' ? 100 : PAGE_SIZE,
      tipo: filtros.tipo.length ? (filtros.tipo as TipoAlerta[]) : undefined,
      severidad: filtros.severidad.length ? (filtros.severidad as SeveridadAlerta[]) : undefined,
      lineaId: filtros.lineaId.length ? filtros.lineaId : undefined,
      estado: estadoConsulta.length ? (estadoConsulta as EstadoAlerta[]) : undefined,
      search: params.get('search') ?? undefined,
    }),
    [page, vista, filtros, estadoConsulta, params],
  );

  const { data, isPending, isError, refetch } = useAlertas(query);

  /** La vista "Pendientes de confirmar" no tiene filtro en la API: se acota aquí. */
  const pendientesFiltradas: Alerta[] = React.useMemo(
    () => (data?.data ?? []).filter(esperaConfirmacion),
    [data],
  );

  const filas: Alerta[] =
    vista === 'pendientes'
      ? pendientesFiltradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      : (data?.data ?? []);

  const total = vista === 'pendientes' ? pendientesFiltradas.length : (data?.meta.total ?? 0);
  const totalPaginas =
    vista === 'pendientes'
      ? Math.max(1, Math.ceil(pendientesFiltradas.length / PAGE_SIZE))
      : (data?.meta.totalPages ?? 1);
  const hayFiltros =
    filtros.tipo.length + filtros.severidad.length + filtros.lineaId.length + filtros.estado.length >
      0 || Boolean(params.get('search'));

  const actualizar = React.useCallback(
    (cambios: Record<string, string | null>) => {
      const siguiente = new URLSearchParams(params.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '') siguiente.delete(clave);
        else siguiente.set(clave, valor);
      }
      if (!('page' in cambios)) siguiente.delete('page');
      router.replace(`/alertas${siguiente.size ? `?${siguiente}` : ''}`, { scroll: false });
    },
    [params, router],
  );

  const grupos: FilterGroup[] = React.useMemo(
    () => [
      {
        id: 'tipo',
        label: 'Tipo',
        options: TIPOS_ALERTA.map((t) => ({ value: t, label: TIPO_ALERTA_LABEL[t] })),
      },
      {
        id: 'severidad',
        label: 'Severidad',
        options: SEVERIDADES_ALERTA.map((s) => ({ value: s, label: SEVERIDAD_ALERTA_LABEL[s] })),
      },
      {
        id: 'lineaId',
        label: 'Línea',
        options: (lineas?.data ?? []).map((l) => ({
          value: l.id,
          label: `${l.codigo} ${l.nombre}`,
        })),
      },
      {
        id: 'estado',
        label: 'Estado',
        options: ESTADOS_ALERTA.filter((e) => e !== 'descartada').map((e) => ({
          value: e,
          label: ESTADO_ALERTA_LABEL[e],
        })),
      },
    ],
    [lineas],
  );

  const ep = resumen ? formatPct(resumen.epAcumulada) : '—';
  const pendientes = resumen?.pendientesConfirmar ?? 0;

  return (
    <>
      <AppPageHeader
        title="Alertas y predicciones"
        subtitle={`Generadas por el modelo de analítica y reglas de umbral · EP acumulada ${ep}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Icon name="sliders" />}
              onClick={() => setUmbralesAbierto(true)}
            >
              Configurar umbrales
            </Button>
            <Button
              variant="primary"
              disabled={pendientes === 0}
              onClick={() => setLoteAbierto(true)}
            >
              Confirmar pendientes ({pendientes})
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Activas"
          value={resumen?.activas ?? '—'}
          active={vista === 'activas'}
          onClick={() => actualizar({ vista: vista === 'activas' ? null : 'activas', estado: null })}
        />
        <SummaryCard
          label="Atendidas hoy"
          value={resumen?.atendidasHoy ?? '—'}
          active={vista === 'atendidas'}
          onClick={() =>
            actualizar({ vista: vista === 'atendidas' ? null : 'atendidas', estado: null })
          }
        />
        <SummaryCard
          label="Pendientes de confirmar"
          value={resumen?.pendientesConfirmar ?? '—'}
          active={vista === 'pendientes'}
          onClick={() =>
            actualizar({ vista: vista === 'pendientes' ? null : 'pendientes', estado: null })
          }
        />
        <SummaryCard
          label="Vencidas"
          value={resumen?.vencidas ?? '—'}
          active={vista === 'vencidas'}
          onClick={() =>
            actualizar({ vista: vista === 'vencidas' ? null : 'vencidas', estado: null })
          }
        />
      </div>

      <FilterBar
        stacked
        groups={grupos}
        value={filtros}
        onChange={(next) =>
          actualizar({
            tipo: next.tipo.join(',') || null,
            severidad: next.severidad.join(',') || null,
            lineaId: next.lineaId.join(',') || null,
            estado: next.estado.join(',') || null,
            vista: next.estado.length ? null : (vista ?? null),
          })
        }
        onClear={() =>
          actualizar({ tipo: null, severidad: null, lineaId: null, estado: null, search: null, vista: null })
        }
      />

      <SectionTitle
        title="Alertas del turno"
        description={
          isPending
            ? 'Cargando alertas del modelo…'
            : filas.length === 0
              ? 'El modelo no ha detectado condiciones de riesgo con los umbrales actuales'
              : `${total} alertas en el periodo · el modelo reevalúa cada 5 min con datos de la línea`
        }
        className="border-b border-divider pb-3"
        actions={
          <form
            className="w-65"
            onSubmit={(e) => {
              e.preventDefault();
              actualizar({ search: busqueda.trim() || null });
            }}
          >
            <Input
              leadingIcon={<Icon name="search" />}
              placeholder="Buscar alerta o línea"
              aria-label="Buscar alerta o línea"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </form>
        }
      />

      {isPending ? (
        <TablaSkeleton />
      ) : isError ? (
        <EmptyState
          variant="error"
          icon={<Icon name="alert-circle" size={40} />}
          title="No se pudieron cargar las alertas"
          description="El servicio de alertas no respondió. Reintenta; si continúa, avisa al área de sistemas."
          action={
            <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={() => void refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : filas.length === 0 ? (
        hayFiltros || vista ? (
          <EmptyState
            variant="no-results"
            icon={<Icon name="search-lg" size={40} />}
            title="Sin resultados con estos filtros"
            description="Prueba con otra severidad, línea o estado, o limpia los filtros para ver la bandeja completa."
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  actualizar({
                    tipo: null,
                    severidad: null,
                    lineaId: null,
                    estado: null,
                    search: null,
                    vista: null,
                  })
                }
              >
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Icon name="inbox" size={40} />}
            title="Sin alertas activas"
            description="El modelo reevalúa cada 5 minutos. Puedes ajustar los umbrales si esperabas recibir avisos antes."
            action={
              <Button
                variant="secondary"
                icon={<Icon name="sliders" />}
                onClick={() => setUmbralesAbierto(true)}
              >
                Configurar umbrales
              </Button>
            }
          />
        )
      ) : (
        <div className="flex w-full flex-col">
          <Table density="dense">
            <THead>
              <tr>
                <TH className="w-25">Severidad</TH>
                <TH className="w-[150px]">Tipo</TH>
                <TH className="w-[150px]">Línea</TH>
                <TH className="w-60">Predicción</TH>
                <TH className="w-32">Probabilidad</TH>
                <TH className="w-28">Ventana</TH>
                <TH className="w-25">Estado</TH>
                <TH className="w-16 text-center">Acierto</TH>
                <TH className="w-11" aria-label="Acciones" />
              </tr>
            </THead>
            <TBody>
              {filas.map((alerta) => (
                <FilaAlerta
                  key={alerta.id}
                  alerta={alerta}
                  onAbrir={() => actualizar({ id: alerta.id, page: String(page) })}
                />
              ))}
            </TBody>
          </Table>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => actualizar({ page: String(page - 1) })}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPaginas}
                  onClick={() => actualizar({ page: String(page + 1) })}
                >
                  Siguiente
                </Button>
              </>
            }
          />
        </div>
      )}

      <AlertaDrawer alertaId={alertaId} onClose={() => actualizar({ id: null, page: String(page) })} />
      <UmbralesDrawer open={umbralesAbierto} onOpenChange={setUmbralesAbierto} />
      {loteAbierto && <ConfirmarLoteModal open={loteAbierto} onOpenChange={setLoteAbierto} />}
    </>
  );
}

/* --------------------------------------------------------------------- Fila */

function FilaAlerta({ alerta, onAbrir }: { alerta: Alerta; onAbrir: () => void }) {
  return (
    <TRow className="cursor-pointer" onClick={onAbrir}>
      <TCell>
        <Badge color={SEVERIDAD_BADGE[alerta.severidad]}>
          {SEVERIDAD_ALERTA_LABEL[alerta.severidad]}
        </Badge>
      </TCell>
      <TCell muted className="whitespace-nowrap">
        {TIPO_ALERTA_LABEL[alerta.tipo]}
      </TCell>
      <TCell className="text-[12.5px] font-medium">
        <span className="block max-w-[126px] truncate" title={etiquetaLinea(alerta)}>
          {etiquetaLinea(alerta)}
        </span>
      </TCell>
      <TCell className="text-body">
        <span className="block max-w-[216px] truncate" title={alerta.prediccion}>
          {alerta.prediccion}
        </span>
      </TCell>
      <TCell>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <ProgressBar
            value={alerta.probabilidad}
            tone={toneProbabilidad(alerta.probabilidad)}
            className="w-14 shrink-0"
            label={`Probabilidad ${alerta.probabilidad} %`}
          />
          <span className="shrink-0 font-medium tabular">{alerta.probabilidad} %</span>
        </span>
      </TCell>
      <TCell muted className="whitespace-nowrap tabular">
        {formatVentana(alerta.ventanaInicio, alerta.ventanaFin)}
      </TCell>
      <TCell>
        <Badge color={ESTADO_BADGE[alerta.estado]}>{ESTADO_ALERTA_LABEL[alerta.estado]}</Badge>
      </TCell>
      <TCell className="text-center">
        <AciertoMark acierto={alerta.acierto} />
      </TCell>
      <TCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              iconPosition="only"
              icon={<Icon name="dots-horizontal" />}
              aria-label={`Acciones de ${alerta.prediccion}`}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onAbrir}>Ver detalle</DropdownMenuItem>
            <DropdownMenuItem onSelect={onAbrir} disabled={alerta.estado !== 'activa'}>
              Atender
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAbrir} disabled={alerta.estado !== 'activa'}>
              Descartar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TCell>
    </TRow>
  );
}

function TablaSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2" aria-busy="true">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

function leerLista(valor: string | null): string[] {
  return valor ? valor.split(',').filter(Boolean) : [];
}
