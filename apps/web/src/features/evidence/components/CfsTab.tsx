'use client';

import * as React from 'react';
import {
  Input,
  SectionTitle,
  Switch,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  toast,
} from '@mes/ui';
import type { EvidenciaCFS, VerificacionCFS } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { useActualizarCfs } from '../hooks';
import { KpiAnexoCard, KpiRow, PieAnexo } from './evidencia-format';

/**
 * `Evidencia / CFS (Anexo 05)` — Figma 2163:17616.
 * Checklist de las 9 funcionalidades planificadas (RF1–RF9): Cumple (Sí/No),
 * observación editable y enlace a la pantalla que evidencia el requisito.
 */
export function CfsTab({ cfs }: { cfs: EvidenciaCFS }) {
  const hayVerificadas = cfs.cumplidas > 0;
  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        <KpiAnexoCard
          label="CFS · Cumplimiento"
          value={hayVerificadas ? `${formatNumber(cfs.porcentaje, 0)} %` : null}
          meta={cfs.meta}
          estado={cfs.estado}
          context={
            hayVerificadas
              ? `${cfs.cumplidas}/${cfs.totales} funcionalidades`
              : 'Marca cada funcionalidad verificada en la ficha'
          }
        />
        <KpiAnexoCard
          label="Implementadas (FRI)"
          value={cfs.cumplidas}
          meta={`Meta ≥ ${cfs.totales} de ${cfs.totales}`}
          estado={cfs.estado}
          context="verificadas en planta"
        />
        <KpiAnexoCard
          label="Planificadas (FRP)"
          value={cfs.totales}
          meta="Alcance definido"
          estado="referencia"
          context="RF1–RF9 · alcance de la tesis"
        />
        <KpiAnexoCard
          label="Pendientes"
          value={cfs.totales - cfs.cumplidas}
          meta="Meta = 0 pendientes"
          estado={cfs.totales === cfs.cumplidas ? 'cumple' : 'en_riesgo'}
          context="sin evidencia registrada"
        />
      </KpiRow>

      <SectionTitle
        title="Ficha de verificación funcional del Sistema MES (Anexo 05)"
        description="Cada funcionalidad se marca como Cumple (Sí/No) y se documenta con una observación y la pantalla que la evidencia (RF17)."
        className="border-b border-divider pb-3"
      />

      <div className="flex flex-col">
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-14">N.º</TH>
              <TH>Funcionalidad</TH>
              <TH className="w-30">Cumple (Sí / No)</TH>
              <TH className="w-[420px]">Observación</TH>
              <TH className="w-35">Evidencia</TH>
            </tr>
          </THead>
          <TBody>
            {cfs.items.map((item) => (
              <FilaCfs key={item.id} item={item} />
            ))}
          </TBody>
        </Table>

        <PieAnexo
          texto={`FRI = ${cfs.cumplidas} · FRP = ${cfs.totales} · CFS = (${cfs.cumplidas} / ${
            cfs.totales
          }) × 100 = ${formatNumber(cfs.porcentaje, 0)} % · Meta ${cfs.meta}. Los cambios se guardan al marcar la casilla o al salir del campo de observación.`}
        />
      </div>
    </div>
  );
}

function FilaCfs({ item }: { item: VerificacionCFS }) {
  const actualizar = useActualizarCfs();
  const [observacion, setObservacion] = React.useState(item.observacion);

  React.useEffect(() => setObservacion(item.observacion), [item.observacion]);

  const guardar = async (cambios: { cumple: boolean; observacion: string }) => {
    try {
      await actualizar.mutateAsync({ id: item.id, input: cambios });
      toast.success(`${item.rf} actualizado`, {
        description: `${item.funcionalidad}: ${cambios.cumple ? 'cumple' : 'no cumple'}.`,
      });
    } catch (e) {
      toast.error('No se pudo guardar el checklist', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <TRow plain className="align-top">
      <TCell muted className="py-2.5">
        {item.n}
      </TCell>
      <TCell className="py-2.5 font-medium">
        {item.rf} · {item.funcionalidad}
      </TCell>
      <TCell className="py-2.5">
        <Switch
          size="sm"
          checked={item.cumple}
          disabled={actualizar.isPending}
          aria-label={`${item.rf} cumple`}
          label={item.cumple ? 'Sí' : 'No'}
          onCheckedChange={(valor) => void guardar({ cumple: valor, observacion })}
        />
      </TCell>
      <TCell className="py-2">
        <Input
          size="sm"
          value={observacion}
          maxLength={300}
          aria-label={`Observación de ${item.rf}`}
          onChange={(e) => setObservacion(e.target.value)}
          onBlur={() => {
            if (observacion !== item.observacion) {
              void guardar({ cumple: item.cumple, observacion });
            }
          }}
        />
      </TCell>
      <TCell className="py-2.5">
        <AppLink href={item.ruta} className="text-body-sm">
          Ver pantalla
        </AppLink>
      </TCell>
    </TRow>
  );
}
