'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  EmptyState,
  FilterBar,
  Icon,
  Input,
  Pagination,
  ProgressBar,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  TooltipProvider,
  toast,
  type FilterGroup,
} from '@mes/ui';
import {
  TIPOS_FUENTE_EXTERNA,
  TIPOS_REGISTRO_TCI,
  TIPO_FUENTE_EXTERNA_LABEL,
  TIPO_REGISTRO_TCI_LABEL,
  TURNO_LABEL,
  type EvaluacionTCI,
  type EvaluacionTciQuery,
  type FuenteExternaResumen,
  type ResumenTCI,
  type TipoFuenteExterna,
  type TipoRegistroTci,
} from '@mes/types';
import { formatDate, formatDateTime, formatNumber, toIsoDate } from '@mes/shared';
import { useEvidenciaTci } from '../hooks';
import { evidenceApi } from '../api';
import { AnexoError, AnexoSkeleton, KpiAnexoCard, KpiRow, NotaAnexo } from './evidencia-format';
import { ImportarFuenteModal } from './ImportarFuenteModal';
import { RevisarEvaluacionDrawer } from './RevisarEvaluacionDrawer';
import { ValidarTciModal } from './ValidarTciModal';
import {
  CriterioIcono,
  FUENTE_DESCRIPCION,
  FUENTE_ICONO,
  TIPO_REGISTRO_BADGE,
} from './tci-format';

const PAGE_SIZE = 10;

interface FiltrosTci {
  tipo: TipoRegistroTci[];
  resultado: ('valido' | 'invalido')[];
  desde: string;
  hasta: string;
}

const FILTROS_VACIOS: FiltrosTci = { tipo: [], resultado: [], desde: '', hasta: '' };

/**
 * `Evidencia / TCI (Anexo 03)` — Figma 2163:10456, rediseñado para la
 * validación contra fuentes externas: KPI del instrumento, estado de las tres
 * importaciones (sensores, solicitudes y SAP), ejecución del motor de reglas y
 * ficha de evaluaciones con revisión manual por criterio.
 */
export function TciTab() {
  const [page, setPage] = React.useState(1);
  const [filtros, setFiltros] = React.useState<FiltrosTci>(FILTROS_VACIOS);
  const [fuenteAImportar, setFuenteAImportar] = React.useState<TipoFuenteExterna | null>(null);
  const [validarAbierto, setValidarAbierto] = React.useState(false);
  const [evaluacion, setEvaluacion] = React.useState<EvaluacionTCI | null>(null);

  const query: EvaluacionTciQuery = React.useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      tipo: filtros.tipo.length > 0 ? filtros.tipo : undefined,
      resultado: filtros.resultado.length === 1 ? filtros.resultado[0] : undefined,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
    }),
    [page, filtros],
  );

  const { data, isPending, isError, refetch } = useEvidenciaTci(query);

  const cambiarFiltros = (cambios: Partial<FiltrosTci>) => {
    setFiltros((prev) => ({ ...prev, ...cambios }));
    setPage(1);
  };

  const grupos: FilterGroup[] = React.useMemo(
    () => [
      {
        id: 'tipo',
        label: 'Tipo de registro',
        options: TIPOS_REGISTRO_TCI.map((t) => ({ value: t, label: TIPO_REGISTRO_TCI_LABEL[t] })),
      },
      {
        id: 'resultado',
        label: 'Resultado',
        options: [
          { value: 'valido', label: 'Válido' },
          { value: 'invalido', label: 'No válido' },
        ],
      },
    ],
    [],
  );

  if (isPending) return <AnexoSkeleton />;
  if (isError || !data) return <AnexoError anexo="Anexo 03 (TCI)" onRetry={() => void refetch()} />;

  const resumen = data.resumen;
  const evaluado = resumen.registrosTotales > 0;
  const hayFuentes = resumen.fuentes.some((f) => f.filas > 0);
  const hayFiltros =
    filtros.tipo.length + filtros.resultado.length > 0 || Boolean(filtros.desde || filtros.hasta);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <KpiRow>
          <KpiAnexoCard
            label="TCI postest"
            value={resumen.porcentaje === null ? null : `${formatNumber(resumen.porcentaje, 1)} %`}
            meta={resumen.meta}
            estado={resumen.estado}
            context={
              evaluado
                ? `${resumen.registrosCorrectos} de ${resumen.registrosTotales} registros válidos`
                : 'Se calcula al ejecutar la validación'
            }
          />
          <KpiAnexoCard
            label="Registros válidos (RC)"
            value={resumen.registrosCorrectos}
            meta={
              evaluado
                ? `Meta ≥ ${Math.ceil(resumen.registrosTotales * 0.9)} de ${resumen.registrosTotales}`
                : 'Meta ≥ 90 %'
            }
            estado={resumen.estado}
            context="cumplen todos los criterios de su tipo"
          />
          <KpiAnexoCard
            label="Registros evaluados (RT)"
            value={resumen.registrosTotales}
            meta="Capturas del postest"
            estado="referencia"
            context="paradas, mermas y velocidades del MES"
          />
          <KpiAnexoCard
            label="Última validación"
            value={
              resumen.ultimaValidacion ? (
                <span className="text-h3">{formatDate(resumen.ultimaValidacion.fecha)}</span>
              ) : null
            }
            meta={
              resumen.ultimaValidacion
                ? `${resumen.ultimaValidacion.evaluados} registros evaluados`
                : 'Sin ejecuciones'
            }
            estado={resumen.ultimaValidacion ? 'referencia' : 'sin_datos'}
            context={
              resumen.ultimaValidacion
                ? `Rango ${formatDate(resumen.ultimaValidacion.desde)} – ${formatDate(resumen.ultimaValidacion.hasta)}`
                : 'Ejecuta la validación para calcular el TCI'
            }
          />
        </KpiRow>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TIPOS_REGISTRO_TCI.map((tipo) => (
            <ResumenTipo key={tipo} tipo={tipo} datos={resumen.porTipo[tipo]} />
          ))}
        </div>

        <SectionTitle
          title="Fuentes externas de contraste"
          description="Sensores de línea, solicitudes de mantenimiento y transferencias de merma de SAP. Se importan como XLSX/CSV: no hay integración en vivo."
          className="border-b border-divider pb-3"
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIPOS_FUENTE_EXTERNA.map((tipo) => (
            <FuenteCard
              key={tipo}
              tipo={tipo}
              fuente={resumen.fuentes.find((f) => f.tipo === tipo)}
              onImportar={() => setFuenteAImportar(tipo)}
            />
          ))}
        </div>

        <SectionTitle
          title="Ficha de registro — Calidad de la información productiva (Anexo 03)"
          description="Cada captura del MES se contrasta con las fuentes externas. El registro es válido solo si cumple todos los criterios de su tipo."
          className="border-b border-divider pb-3"
          actions={
            <Button
              variant="primary"
              icon={<Icon name="shield-check" />}
              disabled={!hayFuentes}
              onClick={() => setValidarAbierto(true)}
            >
              Ejecutar validación
            </Button>
          }
        />

        {!hayFuentes ? (
          <EmptyState
            icon={<Icon name="database" size={40} />}
            title="Todavía no hay fuentes externas importadas"
            description="1) Descarga la plantilla de cada fuente e impórtala con los datos del periodo. 2) Ejecuta la validación para contrastar las capturas del MES y obtener el TCI."
          />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <FilterBar
                groups={grupos}
                value={{ tipo: filtros.tipo, resultado: filtros.resultado }}
                onChange={(next) =>
                  cambiarFiltros({
                    tipo: (next.tipo ?? []) as TipoRegistroTci[],
                    resultado: (next.resultado ?? []) as ('valido' | 'invalido')[],
                  })
                }
                onClear={() => cambiarFiltros(FILTROS_VACIOS)}
              />
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  type="date"
                  size="sm"
                  label="Desde"
                  aria-label="Evaluaciones desde"
                  value={filtros.desde}
                  max={filtros.hasta || undefined}
                  wrapperClassName="w-40"
                  onChange={(e) => cambiarFiltros({ desde: e.target.value })}
                />
                <Input
                  type="date"
                  size="sm"
                  label="Hasta"
                  aria-label="Evaluaciones hasta"
                  value={filtros.hasta}
                  min={filtros.desde || undefined}
                  wrapperClassName="w-40"
                  onChange={(e) => cambiarFiltros({ hasta: e.target.value })}
                />
              </div>
            </div>

            {data.data.length === 0 ? (
              <EmptyState
                variant={hayFiltros ? 'no-results' : 'empty'}
                icon={<Icon name={hayFiltros ? 'search-lg' : 'shield-check'} size={40} />}
                title={
                  hayFiltros
                    ? 'Sin evaluaciones con estos filtros'
                    : 'Las fuentes están importadas: falta validar'
                }
                description={
                  hayFiltros
                    ? 'Prueba con otro tipo de registro, otro resultado u otro rango de fechas.'
                    : 'Ejecuta la validación para contrastar las capturas del MES con las fuentes importadas y calcular el TCI.'
                }
                action={
                  hayFiltros ? (
                    <Button variant="secondary" onClick={() => cambiarFiltros(FILTROS_VACIOS)}>
                      Limpiar filtros
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setValidarAbierto(true)}>
                      Ejecutar validación
                    </Button>
                  )
                }
              />
            ) : (
              <div className="flex flex-col">
                <div className="overflow-x-auto">
                  <Table density="dense">
                    <THead>
                      <tr>
                        <TH className="w-14">N.º</TH>
                        <TH className="w-45">Fecha / Turno</TH>
                        <TH className="w-30">Tipo</TH>
                        <TH className="w-35">Línea</TH>
                        <TH>Registro</TH>
                        <TH className="w-40">Criterios</TH>
                        <TH className="w-30">¿Válido?</TH>
                        <TH className="w-25" />
                      </tr>
                    </THead>
                    <TBody>
                      {data.data.map((fila) => (
                        <TRow key={fila.id} plain>
                          <TCell muted>{fila.n}</TCell>
                          <TCell muted className="tabular">
                            {formatDate(fila.fecha)} · {TURNO_LABEL[fila.turno]}
                          </TCell>
                          <TCell>
                            <Badge color={TIPO_REGISTRO_BADGE[fila.tipoRegistro]}>
                              {TIPO_REGISTRO_TCI_LABEL[fila.tipoRegistro]}
                            </Badge>
                          </TCell>
                          <TCell muted>{fila.lineaCodigo}</TCell>
                          <TCell className="whitespace-normal">{fila.referencia}</TCell>
                          <TCell>
                            <span className="flex items-center gap-2">
                              {fila.criterios.map((criterio) => (
                                <CriterioIcono
                                  key={criterio.clave}
                                  criterio={criterio}
                                  contexto={`Registro ${fila.n}`}
                                />
                              ))}
                            </span>
                          </TCell>
                          <TCell>
                            <Badge color={fila.valido ? 'success' : 'critical'}>
                              {fila.valido ? 'Válido' : 'No válido'}
                            </Badge>
                          </TCell>
                          <TCell>
                            <Button variant="ghost" size="sm" onClick={() => setEvaluacion(fila)}>
                              Revisar
                            </Button>
                          </TCell>
                        </TRow>
                      ))}
                    </TBody>
                  </Table>
                </div>

                <Pagination
                  page={data.meta.page}
                  pageSize={data.meta.pageSize}
                  total={data.meta.total}
                  actions={
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={data.meta.page <= 1}
                        onClick={() => setPage(data.meta.page - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={data.meta.page >= data.meta.totalPages}
                        onClick={() => setPage(data.meta.page + 1)}
                      >
                        Siguiente
                      </Button>
                    </>
                  }
                />
              </div>
            )}
          </>
        )}

        <NotaAnexo
          titulo="Criterios aplicados por el motor de validación (RF15)"
          detalle="Paradas: campos obligatorios completos · tiempos coherentes con las lecturas de sensor de la línea · n.º de solicitud cuando la causa lo exige. Mermas: campos completos · transferencia SAP con la misma línea y producto, fecha y cantidad dentro de tolerancia · n.º de solicitud si aplica. Velocidades: campos completos · desviación respecto a la lectura de sensor más cercana dentro de tolerancia. Las tolerancias se configuran en Configuración › Umbrales de alerta."
        />

        <ImportarFuenteModal
          tipo={fuenteAImportar}
          onOpenChange={(abierto) => {
            if (!abierto) setFuenteAImportar(null);
          }}
        />
        <ValidarTciModal
          open={validarAbierto}
          onOpenChange={setValidarAbierto}
          desdeSugerido={resumen.ultimaValidacion?.desde}
          hastaSugerido={toIsoDate(new Date())}
        />
        <RevisarEvaluacionDrawer
          evaluacion={evaluacion}
          onOpenChange={(abierto) => {
            if (!abierto) setEvaluacion(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

/** Correctos / totales de un tipo de registro con su barra de avance. */
function ResumenTipo({
  tipo,
  datos,
}: {
  tipo: TipoRegistroTci;
  datos: ResumenTCI['porTipo'][TipoRegistroTci];
}) {
  const pct = datos.totales > 0 ? (datos.correctos / datos.totales) * 100 : 0;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background-main p-4">
      <p className="text-body-md font-medium text-text-primary">
        {TIPO_REGISTRO_TCI_LABEL[tipo]}
      </p>
      <p className="text-body-sm text-text-secondary tabular">
        {datos.totales === 0
          ? 'Sin registros evaluados'
          : `${datos.correctos} de ${datos.totales} válidos · ${formatNumber(pct, 1)} %`}
      </p>
      <ProgressBar
        value={pct}
        tone={datos.totales === 0 ? 'neutral' : pct >= 90 ? 'success' : 'warning'}
        label={`${TIPO_REGISTRO_TCI_LABEL[tipo]}: ${datos.correctos} de ${datos.totales} válidos`}
      />
    </div>
  );
}

/** Tarjeta de una fuente externa: filas acumuladas, periodo y última importación. */
function FuenteCard({
  tipo,
  fuente,
  onImportar,
}: {
  tipo: TipoFuenteExterna;
  fuente: FuenteExternaResumen | undefined;
  onImportar: () => void;
}) {
  const [descargando, setDescargando] = React.useState(false);
  const filas = fuente?.filas ?? 0;

  const descargar = async () => {
    setDescargando(true);
    try {
      await evidenceApi.descargarPlantilla(tipo);
      toast.success('Plantilla descargada', {
        description: `Complétala con los datos de ${TIPO_FUENTE_EXTERNA_LABEL[tipo].toLowerCase()} y vuelve a importarla.`,
      });
    } catch (e) {
      toast.error('No se pudo descargar la plantilla', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-background-main p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Icon name={FUENTE_ICONO[tipo]} size={20} className="shrink-0 text-text-secondary" />
          <span className="text-body-md font-semibold text-text-primary">
            {TIPO_FUENTE_EXTERNA_LABEL[tipo]}
          </span>
        </span>
        <Badge color={filas > 0 ? 'success' : 'neutral'}>
          {filas > 0 ? `${formatNumber(filas)} filas` : 'Sin datos'}
        </Badge>
      </div>

      <p className="text-body-sm text-text-secondary">{FUENTE_DESCRIPCION[tipo]}</p>

      <dl className="flex flex-col gap-1 text-body-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Periodo cubierto</dt>
          <dd className="tabular text-text-primary">
            {fuente?.periodo
              ? `${formatDate(fuente.periodo.desde)} – ${formatDate(fuente.periodo.hasta)}`
              : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-secondary">Última importación</dt>
          <dd className="min-w-0 truncate text-right text-text-primary">
            {fuente?.ultimaImportacion ? fuente.ultimaImportacion.archivo : '—'}
          </dd>
        </div>
        {fuente?.ultimaImportacion && (
          <p className="text-text-secondary">
            {formatDateTime(fuente.ultimaImportacion.fecha)} · {fuente.ultimaImportacion.usuario} ·{' '}
            {fuente.ultimaImportacion.filasOk} ok
            {fuente.ultimaImportacion.filasRechazadas > 0
              ? ` · ${fuente.ultimaImportacion.filasRechazadas} rechazadas`
              : ''}
          </p>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button variant="secondary" size="sm" icon={<Icon name="upload" />} onClick={onImportar}>
          Importar
        </Button>
        <Button variant="link" size="sm" onClick={() => void descargar()} loading={descargando}>
          Descargar plantilla
        </Button>
      </div>
    </div>
  );
}
