import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../../config/env.validation';
import type { ConteoOrdenIot, EstadoLinealIot, LinealIot } from './sensores-iot.util';

/**
 * Cliente HTTP del servicio IoT (`iot-yambo`): conteo de producción en tiempo
 * real de los sensores ESP32 (MQTT → Postgres → API REST).
 *
 * **ESTRICTAMENTE DE SÓLO LECTURA.** El MES no escribe nada en el IoT: este
 * cliente sólo sabe hacer `GET` (el método va fijo en `pedir`) y no expone
 * ninguna operación de alta, baja o modificación. Por eso, a diferencia del
 * legado, no congela bases de conteo con `POST /api/lineales/:x/bases`: el
 * producido de la orden sale de `GET /api/lineales/:x/conteo?desde&hasta`.
 * Cualquier escritura nueva hacia el IoT tiene que ser una decisión explícita
 * del usuario, no un método más aquí (lo vigila `iot-api.client.spec.ts`).
 *
 * El IoT exige la cabecera `X-API-Key`, así que se consume siempre desde la API
 * y nunca desde el navegador. Variables de entorno:
 * - `IOT_API_URL`    base del API IoT (sin `/api` final).
 * - `IOT_API_KEY`    clave de la cabecera `X-API-Key`.
 * - `IOT_TIMEOUT_MS` timeout por petición.
 *
 * Sin URL o sin clave la integración queda desactivada y todos los métodos
 * devuelven `null` sin tocar la red.
 */
@Injectable()
export class IotApiClient {
  private readonly logger = new Logger(IotApiClient.name);
  /** Rutas con un fallo ya avisado: un IoT caído no debe inundar el log. */
  private readonly fallosAvisados = new Set<string>();

  constructor(private readonly config: ConfigService<EnvVars, true>) {}

  private base(): string | null {
    const url = this.config.get('IOT_API_URL', { infer: true })?.trim();
    return url ? url.replace(/\/+$/, '') : null;
  }

  private clave(): string | null {
    return this.config.get('IOT_API_KEY', { infer: true })?.trim() || null;
  }

  configurado(): boolean {
    return this.base() !== null && this.clave() !== null;
  }

  /** `IOT_LINEAS` tal cual (sin red): qué líneas del MES se enlazan al IoT. */
  lineasConfiguradas(): string | null {
    return this.config.get('IOT_LINEAS', { infer: true })?.trim() || null;
  }

  /** `GET /api/lineales`: catálogo de lineales con sus sensores asignados. */
  async lineales(): Promise<LinealIot[] | null> {
    const json = await this.pedir<{ ok: boolean; lineales: LinealIot[] }>('/api/lineales');
    if (!json?.ok || !Array.isArray(json.lineales)) return null;
    return json.lineales.filter((l) => typeof l?.nombre === 'string' && Array.isArray(l.sensores));
  }

  /** `GET /api/lineales/estado`: estado vivo de TODAS las lineales en una llamada. */
  async estado(): Promise<EstadoLinealIot[] | null> {
    const json = await this.pedir<{ ok: boolean; lineales: EstadoLinealIot[] }>(
      '/api/lineales/estado',
    );
    if (!json?.ok || !Array.isArray(json.lineales)) return null;
    return json.lineales;
  }

  /**
   * `GET /api/lineales/:lineal/conteo?desde&hasta`: unidades contadas por los
   * sensores de la lineal en el rango. El IoT toma como arranque el último
   * snapshot ANTERIOR a `desde` (`log_eventos_produccion`, uno por minuto) y,
   * si `hasta` no es pasado, el acumulado en vivo como fin.
   *
   * `total: null` es "sin dato" (ningún sensor tenía snapshot de referencia),
   * nunca cero. `null` como resultado = no configurado o sin respuesta.
   */
  async conteo(
    lineal: string,
    desdeIsoUtc: string,
    hastaIsoUtc: string,
  ): Promise<ConteoOrdenIot | null> {
    const json = await this.pedir<{
      ok: boolean;
      total: number | null;
      parcial?: boolean;
      sensores?: Array<{ linea_id: string; conteo: number | null }>;
    }>(
      `/api/lineales/${encodeURIComponent(lineal)}/conteo` +
        `?desde=${encodeURIComponent(desdeIsoUtc)}&hasta=${encodeURIComponent(hastaIsoUtc)}`,
    );
    if (!json?.ok) return null;
    const total = json.total === null || json.total === undefined ? NaN : Number(json.total);
    return {
      total: Number.isFinite(total) && total >= 0 ? total : null,
      parcial: json.parcial === true,
      sinReferencia: (json.sensores ?? []).filter((s) => s?.conteo === null).map((s) => s.linea_id),
    };
  }

  /** Única salida a la red: `GET` con API key y timeout. `null` ante cualquier fallo. */
  private async pedir<T>(ruta: string): Promise<T | null> {
    const base = this.base();
    const clave = this.clave();
    if (!base || !clave) return null;

    const timeout = Number(this.config.get('IOT_TIMEOUT_MS', { infer: true })) || 3000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    /* Ruta sin query ni nombre de lineal: agrupa los avisos del log. */
    const claveAviso = ruta
      .split('?')[0]
      .replace(/\/lineales\/[^/]+\/conteo$/, '/lineales/:lineal/conteo');

    try {
      const respuesta = await fetch(`${base}${ruta}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-API-Key': clave },
        signal: controller.signal,
      });
      if (!respuesta.ok) {
        this.avisarFallo(claveAviso, `HTTP ${respuesta.status}`);
        return null;
      }
      const json = (await respuesta.json()) as T;
      if (this.fallosAvisados.delete(claveAviso)) {
        this.logger.log(`IoT recuperado en GET ${claveAviso}`);
      }
      return json;
    } catch (e) {
      this.avisarFallo(claveAviso, e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private avisarFallo(claveAviso: string, motivo: string): void {
    if (this.fallosAvisados.has(claveAviso)) return;
    this.fallosAvisados.add(claveAviso);
    this.logger.warn(`IoT sin respuesta en GET ${claveAviso}: ${motivo}`);
  }
}
