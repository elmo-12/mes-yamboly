'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DescriptionList,
  Divider,
  Modal,
  ModalContent,
  Overline,
  SectionTitle,
  Stepper,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  tagVariants,
  toast,
  type Step,
} from '@mes/ui';
import type { EstadoFase, Modelo, VersionModelo } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { useActivarVersionModelo } from '../hooks';

export interface ModeloTabProps {
  modelo: Modelo;
  /** `true` mientras hay un reentrenamiento en curso. */
  entrenando?: boolean;
}

const ESTADO_STEP: Record<EstadoFase, Step['status']> = {
  completada: 'done',
  en_curso: 'current',
  pendiente: 'pending',
};

const ESTADO_FASE_LABEL: Record<EstadoFase, string> = {
  completada: 'Completada',
  en_curso: 'En curso',
  pendiente: 'Pendiente',
};

/** `Analítica / Modelo` (Figma 2156:4634 + Stepper CRISP-DM 2163:16124). */
export function ModeloTab({ modelo, entrenando = false }: ModeloTabProps) {
  const activar = useActivarVersionModelo();
  const [aActivar, setAActivar] = React.useState<VersionModelo | null>(null);

  const fases = [...modelo.fasesCrispDm].sort((a, b) => a.orden - b.orden);
  const pasos: Step[] = fases.map((f) => ({
    label: f.nombre,
    description: ESTADO_FASE_LABEL[f.estado],
    status: ESTADO_STEP[f.estado],
  }));

  const confirmarActivacion = () => {
    if (!aActivar) return;
    const version = aActivar.version;
    setAActivar(null);
    activar.mutate(version, {
      onSuccess: () =>
        toast.success(`Modelo ${version} activado`, {
          description: 'Las nuevas predicciones se generarán con esta versión.',
        }),
      onError: () => toast.error('No se pudo activar la versión'),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Ciclo CRISP-DM del modelo predictivo"
        description="Metodología aplicada para construir el modelo de predicción de paradas (OT2)"
      />
      <div className="overflow-x-auto pb-2">
        <Stepper steps={pasos} itemWidth={150} className="min-w-[1000px]" />
      </div>

      <Divider />

      <SectionTitle
        title="Detalle por fase"
        description="Entregables y métricas de cada fase de la metodología CRISP-DM aplicada al MES de Yamboly"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fases.map((f) => (
          <article
            key={f.id}
            className="flex flex-col gap-2 rounded-md border border-border bg-background-main p-4"
          >
            <Overline className="text-primary">Fase {f.orden}</Overline>
            <h3 className="text-h4 text-text-primary">{f.nombre}</h3>
            <p className="text-body-sm text-text-secondary">{f.descripcion}</p>
            <Divider className="my-1" />
            <DescriptionList
              labelWidth={140}
              items={f.metricas.map((m) => ({ label: m.label, value: m.valor }))}
            />
          </article>
        ))}
      </div>

      <Divider />

      <SectionTitle
        title="Métricas del modelo vigente"
        description="Conjunto de entrenamiento y desempeño en la evaluación (fase 5)"
      />
      <DescriptionList
        items={[
          { label: 'Registros', value: formatNumber(modelo.metricas.registros) },
          { label: 'Variables (features)', value: formatNumber(modelo.metricas.features) },
          { label: 'Algoritmo', value: modelo.metricas.algoritmo },
          { label: 'AUC', value: formatNumber(modelo.metricas.auc, 2) },
          { label: 'F1', value: formatNumber(modelo.metricas.f1, 2) },
        ]}
      />

      <SectionTitle
        title="Versiones del modelo"
        description="Historial de entrenamientos · solo una versión puede estar vigente en producción"
      />
      <Table density="dense">
        <THead>
          <TRow plain>
            <TH>Versión</TH>
            <TH>Fecha</TH>
            <TH numeric>Registros</TH>
            <TH numeric>AUC</TH>
            <TH numeric>F1</TH>
            <TH>Estado</TH>
            <TH>Acción</TH>
          </TRow>
        </THead>
        <TBody>
          {modelo.versiones.map((v) => (
            <TRow key={v.version} plain={v.estado === 'vigente'} className={v.estado === 'vigente' ? 'bg-background-subtle' : undefined}>
              <TCell className="font-semibold tabular">{v.version}</TCell>
              <TCell muted className="whitespace-nowrap">
                {formatDate(v.entrenadoEn)}
              </TCell>
              <TCell numeric>{formatNumber(v.eventos)}</TCell>
              <TCell numeric>{formatNumber(v.auc, 2)}</TCell>
              <TCell numeric>{formatNumber(v.f1, 2)}</TCell>
              <TCell>
                {v.estado === 'vigente' ? (
                  <Badge color="success" dot>
                    Vigente
                  </Badge>
                ) : (
                  <Badge color="neutral">Archivada</Badge>
                )}
              </TCell>
              <TCell>
                {v.estado === 'vigente' ? (
                  <span className="text-body-sm text-text-secondary">Versión en producción</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={entrenando || activar.isPending}
                    onClick={() => setAActivar(v)}
                  >
                    Activar
                  </Button>
                )}
              </TCell>
            </TRow>
          ))}
        </TBody>
      </Table>

      <SectionTitle
        title={`Variables de entrada (${formatNumber(modelo.variablesEntrada.length)})`}
        description="Predictores usados por el modelo vigente · derivados del registro operativo del MES"
      />
      <ul className="flex flex-wrap gap-2">
        {modelo.variablesEntrada.map((v) => (
          <li key={v.id} className={tagVariants({ size: 'md', selected: false })}>
            {v.nombre}
          </li>
        ))}
      </ul>

      <Modal open={aActivar !== null} onOpenChange={(o) => !o && setAActivar(null)}>
        <ModalContent
          size="sm"
          title={`Activar el modelo ${aActivar?.version ?? ''}`}
          description="La versión vigente pasará a archivada y las próximas predicciones usarán la versión seleccionada."
          footer={
            <>
              <Button variant="secondary" onClick={() => setAActivar(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarActivacion} loading={activar.isPending}>
                Activar versión
              </Button>
            </>
          }
        >
          {aActivar && (
            <DescriptionList
              labelWidth={160}
              items={[
                { label: 'Versión', value: aActivar.version },
                { label: 'Entrenada el', value: formatDate(aActivar.entrenadoEn) },
                { label: 'Registros', value: formatNumber(aActivar.eventos) },
                { label: 'AUC / F1', value: `${formatNumber(aActivar.auc, 2)} / ${formatNumber(aActivar.f1, 2)}` },
              ]}
            />
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
