/**
 * Cola en proceso que ejecuta las tareas de una en una.
 *
 * Las escrituras de la evidencia (importar una fuente, responder la encuesta,
 * emitir una invitación) leen el estado y luego escriben: dos peticiones
 * simultáneas veían el mismo estado y una acababa en 500 por clave duplicada.
 * La cola las ordena dentro de la instancia; entre instancias protegen la
 * transacción, el UPDATE condicional y el reintento ante clave duplicada.
 * (SQLite, que usan los e2e, además no admite transacciones solapadas en su
 * única conexión.)
 */
export class ColaSerial {
  private cola: Promise<unknown> = Promise.resolve();

  ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(tarea, tarea);
    this.cola = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado;
  }
}
