import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

/**
 * Limitador de intentos de inicio de sesión (A1).
 *
 * Dos contadores en memoria, con la misma política de bloqueo temporal:
 *
 * - **Por cuenta** (id del usuario o, si no existe, el identificador
 *   normalizado): tras `maxCuenta` fallos consecutivos la cuenta queda
 *   bloqueada `bloqueoMin` minutos, aunque luego llegue la contraseña correcta.
 *   Un acierto pone el contador a cero.
 * - **Por IP**: tras `maxIp` fallos dentro de la ventana de `bloqueoMin`
 *   minutos la IP queda bloqueada el mismo tiempo. Un acierto no lo reinicia
 *   (si no, una cuenta válida serviría para seguir probando otras).
 *
 * Si la IP no es fiable (`null`: ver `ip-cliente.ts`) no se aplica el contador
 * por IP —compartirlo bloquearía a toda la planta— y solo rige el de cuenta; se
 * avisa en el log (como máximo una vez por minuto).
 *
 * Se responde **429 `TOO_MANY_REQUESTS`** con `details.reintentarEnSeg`.
 *
 * Está en memoria a propósito: la API corre en una sola instancia; un
 * reinicio limpia los bloqueos (documentado en la entrega).
 */
export interface OpcionesLimitador {
  maxCuenta: number;
  maxIp: number;
  bloqueoMin: number;
}

interface Contador {
  fallos: number;
  /** Inicio de la ventana de conteo (ms). */
  desde: number;
  /** Fin del bloqueo (ms); 0 = sin bloqueo. */
  bloqueadoHasta: number;
}

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

export function opcionesDesdeEntorno(env: NodeJS.ProcessEnv = process.env): OpcionesLimitador {
  return {
    maxCuenta: entero(env.LOGIN_MAX_INTENTOS_CUENTA, 5),
    maxIp: entero(env.LOGIN_MAX_INTENTOS_IP, 20),
    bloqueoMin: entero(env.LOGIN_BLOQUEO_MIN, 15),
  };
}

@Injectable()
export class LoginLimiter {
  private readonly cuentas = new Map<string, Contador>();
  private readonly ips = new Map<string, Contador>();
  private readonly opciones: OpcionesLimitador;
  private readonly log = new Logger(LoginLimiter.name);
  private ultimoAvisoIp = 0;
  /** Reloj inyectable para las pruebas. */
  ahora: () => number = () => Date.now();

  constructor() {
    this.opciones = opcionesDesdeEntorno();
  }

  private get ventanaMs(): number {
    return this.opciones.bloqueoMin * 60_000;
  }

  /** Lanza 429 si la IP o la cuenta están bloqueadas. */
  verificar(ip: string | null, cuenta: string): void {
    const ahora = this.ahora();
    if (ip === null) this.avisarIpNoFiable(ahora);
    const bloqueos = [ip === null ? undefined : this.ips.get(ip), this.cuentas.get(cuenta)]
      .map((c) => c?.bloqueadoHasta ?? 0)
      .filter((hasta) => hasta > ahora);
    if (bloqueos.length === 0) return;
    const segundos = Math.ceil((Math.max(...bloqueos) - ahora) / 1000);
    const minutos = Math.max(1, Math.ceil(segundos / 60));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_REQUESTS',
        message: `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutos} min o contacta a Sistemas.`,
        details: { reintentarEnSeg: segundos },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  registrarFallo(ip: string | null, cuenta: string): void {
    if (ip !== null) this.sumar(this.ips, ip, this.opciones.maxIp);
    this.sumar(this.cuentas, cuenta, this.opciones.maxCuenta);
  }

  private avisarIpNoFiable(ahora: number): void {
    if (ahora - this.ultimoAvisoIp < 60_000) return;
    this.ultimoAvisoIp = ahora;
    this.log.warn(
      'IP del cliente no fiable (¿falta X-Forwarded-For con TRUST_PROXY_HOPS > 0?): se omite el límite por IP y rige solo el de cuenta',
    );
  }

  registrarAcierto(cuenta: string): void {
    this.cuentas.delete(cuenta);
  }

  private sumar(mapa: Map<string, Contador>, clave: string, maximo: number): void {
    const ahora = this.ahora();
    let c = mapa.get(clave);
    const bloqueoTerminado = c !== undefined && c.bloqueadoHasta > 0 && c.bloqueadoHasta <= ahora;
    const ventanaVencida = c !== undefined && c.bloqueadoHasta === 0 && ahora - c.desde > this.ventanaMs;
    if (!c || bloqueoTerminado || ventanaVencida) {
      c = { fallos: 0, desde: ahora, bloqueadoHasta: 0 };
    }
    c.fallos += 1;
    if (c.fallos >= maximo) c.bloqueadoHasta = ahora + this.ventanaMs;
    mapa.set(clave, c);
    if (mapa.size > 10_000) this.purgar(mapa, ahora);
  }

  /** Evita que el mapa crezca sin límite con identificadores inventados. */
  private purgar(mapa: Map<string, Contador>, ahora: number): void {
    for (const [clave, c] of mapa) {
      if (c.bloqueadoHasta <= ahora && ahora - c.desde > this.ventanaMs) mapa.delete(clave);
    }
  }
}
