import { api } from '@/services/api';

/** Respuesta de `POST /evidencias` tras guardar la foto en el servidor. */
export interface EvidenciaGuardada {
  nombre: string;
  /** Ruta que se manda en `evidenciaUrl` al crear la parada o la merma. */
  url: string;
  nombreOriginal: string;
  bytes: number;
}

/**
 * Sube la foto de evidencia de una captura y devuelve la ruta con la que la
 * parada o la merma la referencian. El archivo se guarda antes de enviar el
 * formulario: así el asistente puede mostrar el nombre y, si la subida falla,
 * el maquinista se entera antes de perder lo que lleva escrito.
 */
export function subirEvidencia(archivo: File): Promise<EvidenciaGuardada> {
  const formData = new FormData();
  formData.append('archivo', archivo);
  return api.subirArchivo<EvidenciaGuardada>('/evidencias', formData);
}
