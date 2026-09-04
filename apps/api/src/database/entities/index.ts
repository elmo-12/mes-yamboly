/**
 * Registro único de entidades TypeORM.
 * B2 añade aquí sus entidades (Alerta, Prediccion, ModeloVersion, Umbrales,
 * RegistroTiempo, EvaluacionCalidad, EncuestaRespuesta, VerificacionFuncional,
 * RegistroEp, ExportJob) sin tocar el resto del archivo.
 */
export * from './user.entity';
export * from './turno.entity';
export * from './linea.entity';
export * from './sabor.entity';
export * from './producto.entity';
export * from './velocidad-estandar.entity';
export * from './causa-parada.entity';
export * from './causa-merma.entity';
export * from './orden-fabricacion.entity';
export * from './parada.entity';
export * from './merma.entity';
export * from './registro-velocidad.entity';
export * from './deteccion-iot.entity';
export * from './audit-event.entity';

/* --- Módulos de tesis (B2): reports · alerts · analytics · evidence --- */
export * from './indicador-diario.entity';
export * from './indicador-linea.entity';
export * from './indicador-turno.entity';
export * from './indicador-kpi.entity';
export * from './parada-agregada.entity';
export * from './parada-categoria.entity';
export * from './merma-agregada.entity';
export * from './merma-causa.entity';
export * from './export-job.entity';
export * from './alerta.entity';
export * from './umbrales.entity';
export * from './prediccion.entity';
export * from './modelo-version.entity';
export * from './registro-tiempo.entity';
export * from './evaluacion-calidad.entity';
export * from './encuesta-sesion.entity';
export * from './encuesta-respuesta.entity';
export * from './verificacion-funcional.entity';
export * from './registro-ep.entity';
