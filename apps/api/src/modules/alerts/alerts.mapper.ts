import type { Alerta as AlertaDto } from '@mes/types';
import type { Alerta } from '../../database/entities';

/** Entidad → DTO público de `@mes/types` (quita los `null` de columnas opcionales). */
export function aAlertaDto(alerta: Alerta): AlertaDto {
  return {
    id: alerta.id,
    tipo: alerta.tipo,
    severidad: alerta.severidad,
    lineaId: alerta.lineaId,
    lineaCodigo: alerta.lineaCodigo,
    lineaNombre: alerta.lineaNombre,
    prediccion: alerta.prediccion,
    probabilidad: alerta.probabilidad,
    ventanaInicio: alerta.ventanaInicio,
    ventanaFin: alerta.ventanaFin,
    estado: alerta.estado,
    acierto: alerta.acierto,
    factores: alerta.factores ?? [],
    accionTomada: alerta.accionTomada ?? undefined,
    observacion: alerta.observacion ?? undefined,
    generadaEn: alerta.generadaEn,
    atendidaPor: alerta.atendidaPor ?? undefined,
    atendidaEn: alerta.atendidaEn ?? undefined,
  };
}
