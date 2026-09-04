'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DescriptionList,
  Divider,
  Drawer,
  DrawerClose,
  DrawerContent,
  Icon,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Overline,
  ProgressBar,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  toast,
} from '@mes/ui';
import {
  ESTADO_ALERTA_LABEL,
  SEVERIDAD_ALERTA_LABEL,
  TIPO_ALERTA_LABEL,
  type Alerta,
} from '@mes/types';
import { formatDateTime, formatPct } from '@mes/shared';
import { useAlerta, useAtenderAlerta, useConfirmarEvento, useDescartarAlerta } from '../hooks';
import {
  ESTADO_BADGE,
  SEVERIDAD_BADGE,
  esperaConfirmacion,
  formatVentana,
  etiquetaLinea,
  toneFactor,
  ventanaCerrada,
} from './alerta-format';

export interface AlertaDrawerProps {
  /** `?id=` de la bandeja. `undefined` = cerrado. */
  alertaId?: string;
  onClose: () => void;
}

const MOTIVOS = [
  { value: 'falso_positivo', label: 'Falso positivo del modelo' },
  { value: 'ya_atendida', label: 'La condición ya fue atendida' },
  { value: 'mantenimiento', label: 'Máquina en mantenimiento programado' },
  { value: 'sin_produccion', label: 'La línea no está produciendo' },
  { value: 'otro', label: 'Otro motivo' },
];

/**
 * `Alertas / Detalle (drawer)` — Figma 2163:8896.
 * Drawer 480: cabecera, badges de severidad y estado, meta de 6 filas, bloque
 * "Por qué el modelo lo predice" con barras de contribución, bloque "Atender la
 * alerta" y bloque "Resultado real" (alimenta el Anexo 06 / KPI EP).
 */
export function AlertaDrawer({ alertaId, onClose }: AlertaDrawerProps) {
  const { data: alerta, isPending, isError } = useAlerta(alertaId);

  return (
    <Drawer open={Boolean(alertaId)} onOpenChange={(open) => !open && onClose()}>
      {alertaId && (
        <DrawerContent
          title={alerta ? `${tituloAlerta(alerta)}` : 'Detalle de la alerta'}
          footer={<PieDrawer alerta={alerta} />}
        >
          {isPending ? (
            <div className="flex flex-col gap-4" aria-busy="true">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : isError || !alerta ? (
            <p className="text-body text-error-text">
              No se pudo cargar la alerta. Cierra el panel y reintenta desde la bandeja.
            </p>
          ) : (
            <CuerpoAlerta alerta={alerta} onClose={onClose} />
          )}
        </DrawerContent>
      )}
    </Drawer>
  );
}

function tituloAlerta(alerta: Alerta): string {
  return `${TIPO_ALERTA_LABEL[alerta.tipo]} · ${alerta.lineaCodigo} ${alerta.lineaNombre}`;
}

/** El pie solo lleva "Cerrar": el Primary vive en el bloque activo del cuerpo. */
function PieDrawer({ alerta }: { alerta?: Alerta }) {
  return (
    <DrawerClose asChild>
      <Button variant="secondary" type="button">
        {alerta ? 'Cerrar' : 'Cerrar panel'}
      </Button>
    </DrawerClose>
  );
}

function CuerpoAlerta({ alerta, onClose }: { alerta: Alerta; onClose: () => void }) {
  /**
   * El bloque de resultado real aparece cuando la alerta ya salió de `activa`
   * y sigue sin confirmarse (o cuando su ventana ya se cerró): es lo que
   * alimenta el Anexo 06 / KPI EP.
   */
  const mostrarResultado = esperaConfirmacion(alerta) || (ventanaCerrada(alerta) && alerta.acierto === null && alerta.estado !== 'descartada');
  const puedeAtender = alerta.estado === 'activa';

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <Overline className="text-text-disabled">
          Alerta {alerta.id} · {TIPO_ALERTA_LABEL[alerta.tipo]}
        </Overline>
        <p className="text-body text-text-secondary">
          {alerta.prediccion}. El modelo evaluó la línea con los datos del turno y generó el aviso
          el {formatDateTime(alerta.generadaEn)}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={SEVERIDAD_BADGE[alerta.severidad]} dot>
            Severidad {SEVERIDAD_ALERTA_LABEL[alerta.severidad]} · {alerta.probabilidad} %
          </Badge>
          <Badge color={ESTADO_BADGE[alerta.estado]} dot>
            {ESTADO_ALERTA_LABEL[alerta.estado]}
          </Badge>
        </div>
      </section>

      <DescriptionList
        labelWidth={140}
        className="text-body-sm"
        items={[
          { label: 'Tipo', value: TIPO_ALERTA_LABEL[alerta.tipo] },
          { label: 'Línea', value: etiquetaLinea(alerta) },
          { label: 'Ventana', value: formatVentana(alerta.ventanaInicio, alerta.ventanaFin) },
          { label: 'Probabilidad', value: `${alerta.probabilidad} %` },
          { label: 'Generada', value: formatDateTime(alerta.generadaEn) },
          {
            label: 'Atendida por',
            value: alerta.atendidaPor ?? '—',
          },
        ]}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Overline className="text-text-disabled">Por qué el modelo lo predice</Overline>
          <p className="text-body-sm text-text-secondary">
            Contribución de cada factor a la probabilidad estimada.
          </p>
        </div>
        <ul className="flex flex-col">
          {alerta.factores.map((factor, i) => (
            <li key={factor.texto} className="flex flex-col gap-1.5 border-b border-divider py-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-body text-text-primary">{factor.texto}</span>
                <span className="shrink-0 text-body font-medium tabular text-text-primary">
                  {factor.contribucion} %
                </span>
              </div>
              <ProgressBar
                value={factor.contribucion}
                tone={toneFactor(i)}
                height={4}
                label={`Contribución ${factor.contribucion} %`}
              />
            </li>
          ))}
        </ul>
      </section>

      {alerta.accionTomada && (
        <section className="flex flex-col gap-1.5">
          <Overline className="text-text-disabled">Acción tomada</Overline>
          <p className="text-body text-text-primary">{alerta.accionTomada}</p>
        </section>
      )}

      {puedeAtender && <BloqueAtender alerta={alerta} />}

      {mostrarResultado && <BloqueResultado alerta={alerta} onConfirmado={onClose} />}

      {!puedeAtender && !mostrarResultado && alerta.acierto !== null && (
        <>
          <Divider />
          <p className="text-body-sm text-text-secondary">
            Resultado real ya confirmado: {alerta.acierto ? 'el evento ocurrió' : 'no ocurrió'}.
            {alerta.observacion ? ` ${alerta.observacion}` : ''}
          </p>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Atender / Descartar */

function BloqueAtender({ alerta }: { alerta: Alerta }) {
  const atender = useAtenderAlerta();
  const descartar = useDescartarAlerta();
  const [abierto, setAbierto] = React.useState(false);
  const [accion, setAccion] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [modalDescartar, setModalDescartar] = React.useState(false);
  const [motivo, setMotivo] = React.useState(MOTIVOS[0].value);
  const [detalle, setDetalle] = React.useState('');

  const confirmarAtender = async () => {
    if (accion.trim().length < 10) {
      setError('Describe la acción tomada (mínimo 10 caracteres)');
      return;
    }
    setError(null);
    try {
      await atender.mutateAsync({ id: alerta.id, input: { accionTomada: accion.trim() } });
      toast.success('Alerta atendida', {
        description: 'Se registró la acción tomada; confirma el resultado real al cerrar la ventana.',
      });
      setAbierto(false);
      setAccion('');
    } catch (e) {
      toast.error('No se pudo atender la alerta', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  const confirmarDescartar = async () => {
    const etiqueta = MOTIVOS.find((m) => m.value === motivo)?.label ?? 'Otro motivo';
    const texto = detalle.trim() ? `${etiqueta}: ${detalle.trim()}` : etiqueta;
    try {
      await descartar.mutateAsync({ id: alerta.id, input: { motivo: texto } });
      toast.success('Alerta descartada', { description: texto });
      setModalDescartar(false);
    } catch (e) {
      toast.error('No se pudo descartar la alerta', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <Divider />
      <Overline className="text-text-disabled">Atender la alerta</Overline>

      {abierto ? (
        <div className="flex flex-col gap-3">
          <Input
            label="Acción tomada"
            required
            autoFocus
            value={accion}
            maxLength={300}
            onChange={(e) => setAccion(e.target.value)}
            destructive={Boolean(error)}
            hint={error ?? 'Qué se hizo para evitar el evento previsto (mínimo 10 caracteres).'}
            placeholder="Se adelanta el mantenimiento preventivo de la envolvedora"
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={confirmarAtender} loading={atender.isPending}>
              Confirmar acción
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setAbierto(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="primary" icon={<Icon name="check" />} onClick={() => setAbierto(true)}>
            Atender
          </Button>
          <Button variant="secondary" onClick={() => setModalDescartar(true)}>
            Descartar
          </Button>
        </div>
      )}

      <Modal open={modalDescartar} onOpenChange={setModalDescartar}>
        <ModalContent
          title="Descartar la alerta"
          description="Queda registrada como descartada y no se contabiliza en la exactitud del modelo."
          size="sm"
          footer={
            <>
              <ModalClose asChild>
                <Button variant="secondary" type="button">
                  Cancelar
                </Button>
              </ModalClose>
              <Button variant="primary" onClick={confirmarDescartar} loading={descartar.isPending}>
                Descartar alerta
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Select
              label="Motivo"
              options={MOTIVOS}
              value={motivo}
              onValueChange={setMotivo}
            />
            <Input
              label="Detalle (opcional)"
              value={detalle}
              maxLength={280}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="La envolvedora entró a mantenimiento a las 14:10"
            />
          </div>
        </ModalContent>
      </Modal>
    </section>
  );
}

/* -------------------------------------------------------------- Resultado real */

function BloqueResultado({ alerta, onConfirmado }: { alerta: Alerta; onConfirmado: () => void }) {
  const confirmar = useConfirmarEvento();
  const [ocurrio, setOcurrio] = React.useState<string>('');
  const [observacion, setObservacion] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const enviar = async () => {
    if (ocurrio === '') {
      setError('Indica si el evento ocurrió');
      return;
    }
    setError(null);
    try {
      const respuesta = await confirmar.mutateAsync({
        id: alerta.id,
        input: {
          ocurrio: ocurrio === 'si',
          observacion: observacion.trim() || undefined,
        },
      });
      toast.success('Resultado real confirmado', {
        description:
          typeof respuesta.ep === 'number'
            ? `EP acumulada: ${formatPct(respuesta.ep)} · registrado en el Anexo 06.`
            : 'Registrado en el Anexo 06 (KPI EP).',
      });
      onConfirmado();
    } catch (e) {
      toast.error('No se pudo confirmar el resultado', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <Divider />
      <div className="flex flex-wrap items-center gap-2">
        <Overline className="text-text-disabled">Resultado real</Overline>
        <Badge color="informational">Alimenta KPI EP</Badge>
      </div>
      <p className="text-body-sm text-text-secondary">
        Confirma qué pasó al cerrar la ventana ({formatVentana(alerta.ventanaInicio, alerta.ventanaFin)}
        ). Cada confirmación se registra en el Anexo 06 y recalcula la exactitud de predicciones (EP).
      </p>
      <RadioGroup
        value={ocurrio}
        onValueChange={setOcurrio}
        aria-label="Resultado real de la predicción"
      >
        <Radio value="si" label={`Sí, ocurrió (${alerta.prediccion})`} />
        <Radio value="no" label="No ocurrió (falso positivo)" />
      </RadioGroup>
      {error && <p className="text-body-sm text-error-text">{error}</p>}
      <Input
        label="Observación"
        value={observacion}
        maxLength={300}
        onChange={(e) => setObservacion(e.target.value)}
        placeholder="La parada duró 9 min; se cambió la banda"
      />
      <div>
        <Button variant="primary" onClick={enviar} loading={confirmar.isPending}>
          Confirmar acierto
        </Button>
      </div>
    </section>
  );
}
