import { http, HttpResponse } from 'msw';
import { ROLES_SUBIR_EVIDENCIA } from '@mes/types';
import { API, errores, preludio } from './_utils';
import { exigeRoles } from './auth';

/**
 * Subida de fotos de evidencia en modo demostración.
 *
 * El mock no guarda el binario —no hay servidor detrás—, pero sí devuelve una
 * ruta con la misma forma que la real (`/api/v1/evidencias/EV-…`), de modo que
 * el asistente y la validación de causas con `requiereEvidencia` se comportan
 * igual con API que sin ella. La foto se recupera del `objectURL` del navegador
 * mientras dure la sesión.
 */
const objectUrls = new Map<string, string>();

export const attachmentsHandlers = [
  http.post(`${API}/evidencias`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;

    const { respuesta } = exigeRoles(request, ROLES_SUBIR_EVIDENCIA);
    if (respuesta) return respuesta;

    const formData = await request.formData();
    const archivo = formData.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) {
      return errores.validacion({ archivo: 'Adjunta una foto' });
    }
    const extension = archivo.name.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? '.jpg';
    const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nombre = `EV-${hoy}-${Math.random().toString(16).slice(2, 10)}${extension}`;
    objectUrls.set(nombre, URL.createObjectURL(archivo));

    return HttpResponse.json(
      {
        nombre,
        url: `${API}/evidencias/${nombre}`,
        nombreOriginal: archivo.name,
        bytes: archivo.size,
      },
      { status: 201 },
    );
  }),

  http.get(`${API}/evidencias/:archivo`, ({ params }) => {
    const objectUrl = objectUrls.get(String(params.archivo));
    if (!objectUrl) return errores.noEncontrado('Foto de evidencia');
    /* Se redirige al blob del navegador: el mock no tiene los bytes a mano. */
    return HttpResponse.redirect(objectUrl, 302);
  }),
];
