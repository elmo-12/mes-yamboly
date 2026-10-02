'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  Icon,
  Input,
  Modal,
  ModalContent,
  Select,
  Tag,
  TimerChip,
  toast,
} from '@mes/ui';
import { puedeCapturar } from '@mes/types';
import { useCausasParada } from '@/features/catalogs/hooks';
import { useConfirmarDeteccion, useDescartarDeteccion } from '@/features/downtimes/hooks';
import { useSession } from '@/hooks/use-session';
import { ApiClientError } from '@/services/api/client';
import { mensajeDeError } from '@/services/api/form-errors';
import { etiquetaCausa, todasLasEspecificas } from '../causas';
import type { ContextoLinea } from '../tipos';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import { AdjuntarFoto } from './AdjuntarFoto';

/** Nº de causas ofrecidas como botón de un toque (spec 04.K). */
const N_CAUSAS_RAPIDAS = 4;

export interface IoTSugeridaModalProps {
  contexto: ContextoLinea;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * `IoT / Parada sugerida` (Figma 2163:11217): confirmación en un toque de la
 * detección del sensor. "No es parada" descarta y realimenta el modelo.
 *
 * Las causas rápidas son las **causas específicas** (hojas del árbol) más
 * frecuentes de la línea, sacadas del catálogo real; antes se buscaban códigos
 * fijos (`PM-01`…) que no existen y se enviaba el tipo, no la hoja.
 */
export function IoTSugeridaModal({ contexto, abierto, onOpenChange }: IoTSugeridaModalProps) {
  const [causaId, setCausaId] = React.useState('');
  const [numeroSolicitud, setNumeroSolicitud] = React.useState('');
  const [foto, setFoto] = React.useState<{ url: string; nombre: string }>();
  const [error, setError] = React.useState<string>();
  const enviandoRef = React.useRef(false);
  const tri = useTriTimer(abierto);
  const { user } = useSession();
  const { data: arbol } = useCausasParada(contexto.lineaId);
  const confirmar = useConfirmarDeteccion();
  const descartar = useDescartarDeteccion();

  const hojas = React.useMemo(
    () => todasLasEspecificas(arbol?.data ?? []).filter((c) => c.estado === 'activo'),
    [arbol],
  );
  const rapidas = React.useMemo(
    () =>
      [...hojas]
        .sort((a, b) => (b.paradasHistoricas ?? 0) - (a.paradasHistoricas ?? 0))
        .slice(0, N_CAUSAS_RAPIDAS),
    [hojas],
  );
  const causa = hojas.find((c) => c.id === causaId);
  const permitido = puedeCapturar(user, 'parada', contexto.lineaId);

  React.useEffect(() => {
    if (!abierto) return;
    setCausaId('');
    setNumeroSolicitud('');
    setFoto(undefined);
    setError(undefined);
  }, [abierto]);

  const deteccionId = contexto.deteccionId;
  const faltaSolicitud = Boolean(causa?.requiereSolicitud) && !numeroSolicitud.trim();
  const faltaFoto = Boolean(causa?.requiereEvidencia) && !foto;

  const onConfirmar = async () => {
    if (!deteccionId || !causaId || !permitido || enviandoRef.current) return;
    if (faltaSolicitud || faltaFoto) {
      setError(
        faltaSolicitud
          ? 'Esta causa exige el N.º de solicitud de mantenimiento'
          : 'Esta causa exige una foto de evidencia',
      );
      return;
    }
    enviandoRef.current = true;
    const segundos = tri.detener();
    try {
      await confirmar.mutateAsync({
        id: deteccionId,
        input: {
          causaId,
          accionTomada: 'Parada confirmada desde la detección del sensor IoT',
          numeroSolicitud: numeroSolicitud.trim() || undefined,
          evidenciaUrl: foto?.url,
          tiempoRegistroSeg: segundos,
        },
      });
      toast.success(`Parada registrada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      const detalle =
        e instanceof ApiClientError && e.statusCode === 422
          ? Object.values(e.details ?? {}).find((v): v is string => typeof v === 'string')
          : undefined;
      if (detalle) setError(detalle);
      toast.error(detalle ?? mensajeDeError(e, 'No se pudo confirmar la parada'));
    } finally {
      enviandoRef.current = false;
    }
  };

  const onDescartar = async () => {
    if (!deteccionId || !permitido) return;
    try {
      await descartar.mutateAsync(deteccionId);
      toast.success('Detección descartada · se realimenta el modelo');
      onOpenChange(false);
    } catch (e) {
      toast.error(mensajeDeError(e, 'No se pudo descartar la detección'));
    }
  };

  return (
    <Modal open={abierto} onOpenChange={onOpenChange}>
      <ModalContent
        size="sm"
        title={`Parada sugerida en ${contexto.lineaCodigo}`}
        aria-describedby={undefined}
        headerExtra={<TimerChip value={tri.etiqueta} />}
        footer={
          <>
            <Button
              variant="secondary"
              size="lg"
              loading={descartar.isPending}
              disabled={!permitido}
              onClick={() => void onDescartar()}
            >
              No es parada
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon={<Icon name="check" size={20} />}
              disabled={!causaId || !permitido || confirmar.isPending}
              loading={confirmar.isPending}
              onClick={() => void onConfirmar()}
            >
              Confirmar parada
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Badge color="informational" dot className="self-start">
            Detectada por sensor
          </Badge>
          <p className="text-body-lg text-text-primary">
            {contexto.deteccionTexto ??
              `El sensor de ${contexto.etiqueta} no registra movimiento.`}
          </p>
          {!permitido ? (
            <p className="text-body-sm text-warning-text">
              Tu rol no permite confirmar ni descartar paradas en esta línea.
            </p>
          ) : (
            <p className="text-body-sm text-text-secondary">
              Confirma la causa y la parada queda registrada en un toque.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {rapidas.map((c) => (
              <Tag
                key={c.id}
                size="lg"
                selected={causaId === c.id}
                onClick={() => {
                  setCausaId(c.id);
                  setError(undefined);
                }}
              >
                {etiquetaCausa(c)}
              </Tag>
            ))}
          </div>
          <Select
            label="Otra causa"
            placeholder="Busca la causa específica"
            hint="Catálogo codificado de paradas"
            options={hojas.map((c) => ({ value: c.id, label: etiquetaCausa(c) }))}
            value={causaId}
            onValueChange={(v) => {
              setCausaId(v);
              setError(undefined);
            }}
          />
          {causa?.requiereSolicitud && (
            <Input
              label="N.º de solicitud"
              placeholder="SM-4471"
              hint="Obligatorio para esta causa"
              maxLength={50}
              value={numeroSolicitud}
              onChange={(e) => {
                setNumeroSolicitud(e.target.value);
                setError(undefined);
              }}
            />
          )}
          {causa?.requiereEvidencia && (
            <AdjuntarFoto
              label="Evidencia (foto) · obligatoria"
              cta="Adjuntar foto"
              value={foto?.nombre}
              onChange={(evidencia) => {
                setFoto(evidencia);
                setError(undefined);
              }}
            />
          )}
          {error && <p className="text-body-sm text-error-text">{error}</p>}
          <p className="text-body-sm text-text-disabled">
            {[deteccionId ? `Evento ${deteccionId}` : '', contexto.etiqueta, `turno ${contexto.turnoLabel}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
