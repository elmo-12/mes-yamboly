'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DescriptionList,
  Drawer,
  DrawerClose,
  DrawerContent,
  Switch,
  Textarea,
  toast,
} from '@mes/ui';
import {
  TIPO_REGISTRO_TCI_LABEL,
  TURNO_LABEL,
  overrideTciSchema,
  type ClaveCriterioTci,
  type EvaluacionTCI,
} from '@mes/types';
import { formatDate, formatDateTime } from '@mes/shared';
import { useRevisarEvaluacionTci } from '../hooks';
import { TIPO_REGISTRO_BADGE } from './tci-format';

export interface RevisarEvaluacionDrawerProps {
  /** Evaluación abierta; `null` cierra el drawer. */
  evaluacion: EvaluacionTCI | null;
  onOpenChange: (open: boolean) => void;
}

type MapaBool = Partial<Record<ClaveCriterioTci, boolean>>;

/**
 * Detalle de una evaluación del Anexo 03: cada criterio con la explicación de
 * la regla y un switch para forzar su resultado. Todo override exige una
 * justificación, que queda como observación de la fila.
 */
export function RevisarEvaluacionDrawer({ evaluacion, onOpenChange }: RevisarEvaluacionDrawerProps) {
  return (
    <Drawer open={Boolean(evaluacion)} onOpenChange={onOpenChange}>
      {evaluacion && (
        <ContenidoRevision
          key={evaluacion.id}
          evaluacion={evaluacion}
          onCerrar={() => onOpenChange(false)}
        />
      )}
    </Drawer>
  );
}

/** `true` si el criterio tiene un valor forzado a mano en la API. */
function esOverride(evaluacion: EvaluacionTCI, clave: ClaveCriterioTci): boolean {
  const criterio = evaluacion.criterios.find((c) => c.clave === clave);
  if (criterio?.override === true || criterio?.override === false) return true;
  return evaluacion.overrides?.[clave] !== undefined;
}

function ContenidoRevision({
  evaluacion,
  onCerrar,
}: {
  evaluacion: EvaluacionTCI;
  onCerrar: () => void;
}) {
  const revisar = useRevisarEvaluacionTci();
  const [valores, setValores] = React.useState<MapaBool>(() =>
    Object.fromEntries(evaluacion.criterios.map((c) => [c.clave, c.cumple])),
  );
  const [manuales, setManuales] = React.useState<MapaBool>(() =>
    Object.fromEntries(evaluacion.criterios.map((c) => [c.clave, esOverride(evaluacion, c.clave)])),
  );
  const [observacion, setObservacion] = React.useState(evaluacion.observacion ?? '');
  const [error, setError] = React.useState<string | null>(null);

  const criteriosCambiados = evaluacion.criterios.some((criterio) => {
    const eraManual = esOverride(evaluacion, criterio.clave);
    const esManual = manuales[criterio.clave] === true;
    if (eraManual !== esManual) return true;
    return esManual && valores[criterio.clave] !== criterio.cumple;
  });
  const dirty = criteriosCambiados || observacion !== (evaluacion.observacion ?? '');
  const validoPrevisto = evaluacion.criterios.every((c) => valores[c.clave] === true);

  const alternar = (clave: ClaveCriterioTci, valor: boolean) => {
    setValores((prev) => ({ ...prev, [clave]: valor }));
    setManuales((prev) => ({ ...prev, [clave]: true }));
    setError(null);
  };

  const volverALaRegla = (clave: ClaveCriterioTci) => {
    setManuales((prev) => ({ ...prev, [clave]: false }));
    setError(null);
  };

  const guardar = async () => {
    const overrides: Record<string, boolean | null> = {};
    for (const criterio of evaluacion.criterios) {
      const esManual = manuales[criterio.clave] === true;
      if (esManual) overrides[criterio.clave] = valores[criterio.clave] ?? criterio.cumple;
      else if (esOverride(evaluacion, criterio.clave)) overrides[criterio.clave] = null;
    }

    const hayOverrides = Object.values(overrides).some((v) => v !== null);
    if (hayOverrides && observacion.trim().length === 0) {
      setError('Justifica la revisión manual: la observación es obligatoria.');
      return;
    }

    const validado = overrideTciSchema.safeParse({
      overrides,
      observacion: observacion.trim() || undefined,
    });
    if (!validado.success) {
      setError(validado.error.issues[0]?.message ?? 'Revisa los criterios y la justificación.');
      return;
    }
    setError(null);

    try {
      await revisar.mutateAsync({ id: evaluacion.id, input: validado.data });
      toast.success(`Evaluación ${evaluacion.n} actualizada`, {
        description: `${evaluacion.registroId}: ${validoPrevisto ? 'registro válido' : 'registro no válido'}.`,
      });
      onCerrar();
    } catch (e) {
      toast.error('No se pudo guardar la revisión', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <DrawerContent
      title={`Evaluación ${evaluacion.n} · ${TIPO_REGISTRO_TCI_LABEL[evaluacion.tipoRegistro]}`}
      description={`${evaluacion.registroId} · ${evaluacion.lineaCodigo}`}
      headerExtra={
        <Badge color={validoPrevisto ? 'success' : 'critical'}>
          {validoPrevisto ? 'Válido' : 'No válido'}
        </Badge>
      }
      footer={
        <>
          <DrawerClose asChild>
            <Button variant="secondary" type="button">
              Cerrar
            </Button>
          </DrawerClose>
          <Button variant="primary" onClick={guardar} disabled={!dirty} loading={revisar.isPending}>
            Guardar revisión
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <DescriptionList
          labelWidth={150}
          items={[
            {
              label: 'Fecha / turno',
              value: `${formatDate(evaluacion.fecha)} · ${TURNO_LABEL[evaluacion.turno]}`,
            },
            {
              label: 'Tipo',
              value: (
                <Badge color={TIPO_REGISTRO_BADGE[evaluacion.tipoRegistro]}>
                  {TIPO_REGISTRO_TCI_LABEL[evaluacion.tipoRegistro]}
                </Badge>
              ),
            },
            { label: 'Línea', value: evaluacion.lineaCodigo },
            { label: 'Registro', value: evaluacion.referencia },
            { label: 'Última validación', value: formatDateTime(evaluacion.validadoEn) },
          ]}
        />

        <div className="flex flex-col gap-3">
          <p className="text-body-md font-semibold text-text-primary">Criterios evaluados</p>
          {evaluacion.criterios.map((criterio) => {
            const manual = manuales[criterio.clave] === true;
            const valor = valores[criterio.clave] ?? criterio.cumple;
            return (
              <div
                key={criterio.clave}
                className="flex flex-col gap-2 rounded-md border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-body-md font-medium text-text-primary">{criterio.label}</p>
                    <p className="text-body-sm text-text-secondary">{criterio.detalle}</p>
                  </div>
                  <Badge color={valor ? 'success' : 'critical'}>
                    {valor ? 'Cumple' : 'No cumple'}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Switch
                    size="sm"
                    checked={valor}
                    aria-label={`Forzar ${criterio.label}`}
                    label={manual ? 'Revisado a mano' : 'Resultado de la regla'}
                    onCheckedChange={(nuevo) => alternar(criterio.clave, nuevo)}
                  />
                  {manual && (
                    <button
                      type="button"
                      onClick={() => volverALaRegla(criterio.clave)}
                      className="text-body-sm font-medium text-primary hover:underline"
                    >
                      Volver a la regla
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Textarea
          label="Justificación de la revisión"
          rows={4}
          maxLength={300}
          value={observacion}
          onChange={(e) => {
            setObservacion(e.target.value);
            if (error) setError(null);
          }}
          destructive={Boolean(error)}
          hint={error ?? 'Obligatoria cuando fuerzas el resultado de algún criterio (máx. 300).'}
          placeholder="Ej.: el sensor de la Llenadora M2 estuvo fuera de servicio ese turno; la parada se verificó en el parte físico."
        />
      </div>
    </DrawerContent>
  );
}
