'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  Icon,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  Spinner,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  toast,
} from '@mes/ui';
import {
  COLUMNAS_FUENTE,
  TIPO_FUENTE_EXTERNA_LABEL,
  type ImportacionResultado,
  type MapeoImportacion,
  type TipoFuenteExterna,
} from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useImportarFuente } from '../hooks';
import { COLUMNAS_OPCIONALES, FUENTE_TITULO_IMPORTAR, mapeoAutomatico } from './tci-format';

export interface ImportarFuenteModalProps {
  tipo: TipoFuenteExterna | null;
  onOpenChange: (open: boolean) => void;
}

/** Extensiones aceptadas por la API (`xlsx`/`csv`, máximo 5 MB). */
const EXTENSIONES = ['.xlsx', '.xls', '.csv'];
const MAX_BYTES = 5 * 1024 * 1024;
/** Filas de datos que se muestran en la vista previa. */
const FILAS_PREVIA = 5;
/** Valor centinela del Select cuando la columna no se envía. */
const SIN_MAPEAR = '__sin_mapear__';

interface VistaPrevia {
  cabeceras: string[];
  filas: string[][];
}

/**
 * Importación de una fuente externa del TCI (sensores, solicitudes o SAP).
 * Lee las cabeceras y 5 filas en el navegador con SheetJS, propone el mapeo
 * automático cabecera → columna esperada, deja corregirlo y envía el archivo
 * como multipart junto con el mapeo.
 */
export function ImportarFuenteModal({ tipo, onOpenChange }: ImportarFuenteModalProps) {
  const importar = useImportarFuente();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [previa, setPrevia] = React.useState<VistaPrevia | null>(null);
  const [mapeo, setMapeo] = React.useState<MapeoImportacion>({});
  const [error, setError] = React.useState<string | null>(null);
  const [leyendo, setLeyendo] = React.useState(false);
  const [resultado, setResultado] = React.useState<ImportacionResultado | null>(null);
  const [rechazosAbiertos, setRechazosAbiertos] = React.useState(false);

  const abierto = tipo !== null;

  const limpiar = React.useCallback(() => {
    setArchivo(null);
    setPrevia(null);
    setMapeo({});
    setError(null);
    setResultado(null);
    setRechazosAbiertos(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const columnas = tipo ? COLUMNAS_FUENTE[tipo] : [];
  const opcionales = tipo ? COLUMNAS_OPCIONALES[tipo] : [];
  const faltantes = columnas.filter((c) => !opcionales.includes(c) && !mapeo[c]);

  const elegirArchivo = async (nuevo: File | undefined) => {
    if (!nuevo || !tipo) return;
    setResultado(null);
    setError(null);

    const extension = nuevo.name.slice(nuevo.name.lastIndexOf('.')).toLowerCase();
    if (!EXTENSIONES.includes(extension)) {
      setArchivo(null);
      setPrevia(null);
      setError('Formato no admitido. Sube la plantilla en XLSX o CSV.');
      return;
    }
    if (nuevo.size > MAX_BYTES) {
      setArchivo(null);
      setPrevia(null);
      setError('El archivo supera los 5 MB. Divide la exportación por periodos.');
      return;
    }

    setArchivo(nuevo);
    setLeyendo(true);
    try {
      const leida = await leerCabeceras(nuevo);
      if (leida.cabeceras.length === 0) {
        setPrevia(null);
        setError('La primera hoja no tiene cabeceras. Usa la plantilla descargable.');
        return;
      }
      setPrevia(leida);
      setMapeo(mapeoAutomatico(tipo, leida.cabeceras));
    } catch {
      setPrevia(null);
      setError('No se pudo leer el archivo. Comprueba que sea la plantilla en XLSX o CSV.');
    } finally {
      setLeyendo(false);
    }
  };

  const enviar = async () => {
    if (!tipo || !archivo) return;
    if (faltantes.length > 0) {
      setError(`Asigna una columna a: ${faltantes.join(', ')}.`);
      return;
    }
    setError(null);
    try {
      const respuesta = await importar.mutateAsync({ tipo, archivo, mapeo });
      setResultado(respuesta);
      toast.success(`${formatNumber(respuesta.filasOk)} filas importadas`, {
        description:
          respuesta.filasRechazadas > 0
            ? `${respuesta.filasRechazadas} filas rechazadas · revisa el detalle en el modal.`
            : `${TIPO_FUENTE_EXTERNA_LABEL[tipo]} listas para validar.`,
      });
    } catch (e) {
      toast.error('No se pudo importar el archivo', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <Modal
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) limpiar();
        onOpenChange(valor);
      }}
    >
      <ModalContent
        size="lg"
        title={tipo ? FUENTE_TITULO_IMPORTAR[tipo] : 'Importar fuente externa'}
        description="Sube la plantilla en XLSX o CSV (máximo 5 MB). Las filas se acumulan y los duplicados exactos se ignoran."
        footer={
          resultado ? (
            <>
              <Button variant="secondary" onClick={limpiar}>
                Importar otro archivo
              </Button>
              <ModalClose asChild>
                <Button variant="primary" type="button">
                  Listo
                </Button>
              </ModalClose>
            </>
          ) : (
            <>
              <ModalClose asChild>
                <Button variant="secondary" type="button">
                  Cancelar
                </Button>
              </ModalClose>
              <Button
                variant="primary"
                onClick={enviar}
                disabled={!archivo || !previa || leyendo}
                loading={importar.isPending}
              >
                Importar
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-5">
          {!resultado && (
            <div className="flex flex-col gap-2">
              <label className="text-body-md font-medium text-text-primary" htmlFor="archivo-fuente">
                Archivo de la fuente
              </label>
              <input
                ref={inputRef}
                id="archivo-fuente"
                type="file"
                accept={EXTENSIONES.join(',')}
                onChange={(e) => void elegirArchivo(e.target.files?.[0])}
                className="block w-full rounded-md border border-border bg-background-main px-3 py-2 text-body-sm text-text-primary file:mr-3 file:rounded-sm file:border-0 file:bg-background-subtle file:px-3 file:py-1.5 file:text-body-sm file:font-medium file:text-text-primary"
              />
              <p className={error ? 'text-body-sm text-error-text' : 'text-body-sm text-text-secondary'}>
                {error ?? 'Columnas esperadas: ' + columnas.join(', ') + '.'}
              </p>
            </div>
          )}

          {leyendo && (
            <p className="flex items-center gap-2 text-body-sm text-text-secondary">
              <Spinner /> Leyendo el archivo…
            </p>
          )}

          {previa && !resultado && (
            <>
              <div className="flex flex-col gap-3">
                <p className="text-body-md font-semibold text-text-primary">
                  Mapeo de columnas ({previa.cabeceras.length} cabeceras detectadas)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {columnas.map((columna) => (
                    <Select
                      key={columna}
                      size="sm"
                      label={opcionales.includes(columna) ? `${columna} (opcional)` : columna}
                      value={mapeo[columna] ?? SIN_MAPEAR}
                      destructive={faltantes.includes(columna)}
                      placeholder="Sin asignar"
                      options={[
                        { value: SIN_MAPEAR, label: 'Sin asignar' },
                        ...previa.cabeceras.map((c) => ({ value: c, label: c })),
                      ]}
                      onValueChange={(valor) =>
                        setMapeo((prev) => {
                          const siguiente = { ...prev };
                          if (valor === SIN_MAPEAR) delete siguiente[columna];
                          else siguiente[columna] = valor;
                          return siguiente;
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-body-md font-semibold text-text-primary">
                  Vista previa ({Math.min(previa.filas.length, FILAS_PREVIA)} primeras filas)
                </p>
                <div className="overflow-x-auto">
                  <Table density="dense">
                    <THead>
                      <tr>
                        {previa.cabeceras.map((cabecera) => (
                          <TH key={cabecera}>{cabecera}</TH>
                        ))}
                      </tr>
                    </THead>
                    <TBody>
                      {previa.filas.map((fila, i) => (
                        <TRow key={i} plain>
                          {previa.cabeceras.map((cabecera, j) => (
                            <TCell key={cabecera} muted>
                              {fila[j] ?? ''}
                            </TCell>
                          ))}
                        </TRow>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </div>
            </>
          )}

          {resultado && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="success">{formatNumber(resultado.filasOk)} filas importadas</Badge>
                {resultado.filasDuplicadas > 0 && (
                  <Badge color="neutral">
                    {formatNumber(resultado.filasDuplicadas)} duplicadas ignoradas
                  </Badge>
                )}
                {resultado.filasRechazadas > 0 && (
                  <Badge color="critical">
                    {formatNumber(resultado.filasRechazadas)} rechazadas
                  </Badge>
                )}
              </div>

              <p className="text-body-sm text-text-secondary">
                {resultado.archivo}
                {resultado.periodo
                  ? ` · periodo cubierto ${resultado.periodo.desde} → ${resultado.periodo.hasta}`
                  : ''}
              </p>

              {resultado.rechazos.length > 0 && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setRechazosAbiertos((v) => !v)}
                    className="flex w-fit items-center gap-1.5 text-body-sm font-medium text-primary hover:underline"
                  >
                    <Icon name={rechazosAbiertos ? 'chevron-up' : 'chevron-down'} size={16} />
                    {rechazosAbiertos ? 'Ocultar' : 'Ver'} las {resultado.rechazos.length} filas
                    rechazadas
                  </button>
                  {rechazosAbiertos && (
                    <Table density="dense">
                      <THead>
                        <tr>
                          <TH className="w-20">Fila</TH>
                          <TH>Motivo del rechazo</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {resultado.rechazos.map((rechazo) => (
                          <TRow key={`${rechazo.fila}-${rechazo.motivo}`} plain>
                            <TCell muted className="tabular">
                              {rechazo.fila}
                            </TCell>
                            <TCell>{rechazo.motivo}</TCell>
                          </TRow>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </div>
              )}

              <p className="rounded-md bg-background-subtle px-4 py-3 text-body-sm text-text-secondary">
                Siguiente paso: ejecuta la validación para reevaluar los registros del periodo con
                esta fuente.
              </p>
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}

/**
 * Cabeceras y primeras filas de la hoja 1 con SheetJS. La librería se carga
 * bajo demanda para no engordar el bundle de la ruta de Evidencia.
 */
async function leerCabeceras(archivo: File): Promise<VistaPrevia> {
  const XLSX = await import('xlsx');
  const buffer = await archivo.arrayBuffer();
  const libro = XLSX.read(buffer, { type: 'array', sheetRows: FILAS_PREVIA + 1 });
  const nombreHoja = libro.SheetNames[0];
  if (!nombreHoja) return { cabeceras: [], filas: [] };
  const hoja = libro.Sheets[nombreHoja];
  if (!hoja) return { cabeceras: [], filas: [] };

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  const [cabeceras = [], ...resto] = matriz;
  return {
    cabeceras: cabeceras.map((c) => String(c ?? '').trim()).filter((c) => c.length > 0),
    filas: resto.slice(0, FILAS_PREVIA).map((fila) => fila.map((celda) => String(celda ?? ''))),
  };
}
