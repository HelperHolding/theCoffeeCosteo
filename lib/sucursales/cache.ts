/**
 * Caché en memoria del proceso con TTL, tope de entradas (sale la más antigua) y agrupación de
 * peticiones simultáneas por clave. Limitación: en serverless cada instancia tiene su propia caché y se
 * pierde al reiniciar; por eso los TTL son cortos y nada depende de que una entrada sobreviva.
 * Solo se consulta DESPUÉS de autorizar al usuario: la clave no lleva datos de sesión.
 */
export class CacheTtl<T> {
  private datos = new Map<string, { valor: T; creado: number; expira: number }>();
  private enVuelo = new Map<string, Promise<T>>();

  constructor(
    private readonly max = 100,
    private readonly reloj: () => number = Date.now,
  ) {}

  /**
   * Devuelve el valor vigente o lo carga una sola vez aunque lleguen varias peticiones a la vez.
   * `forzar` solo recarga si la entrada tiene al menos `edadMinima` ms (protege al proveedor).
   */
  async obtener(
    clave: string,
    cargar: () => Promise<T>,
    ttl: (valor: T) => number,
    { forzar = false, edadMinima = 15_000 }: { forzar?: boolean; edadMinima?: number } = {},
  ): Promise<T> {
    const ahora = this.reloj();
    const e = this.datos.get(clave);
    if (e && e.expira > ahora && !(forzar && ahora - e.creado >= edadMinima)) return e.valor;
    const pendiente = this.enVuelo.get(clave);
    if (pendiente) return pendiente;
    const p = cargar()
      .then((valor) => {
        const creado = this.reloj();
        this.datos.delete(clave);
        this.datos.set(clave, { valor, creado, expira: creado + ttl(valor) });
        while (this.datos.size > this.max) this.datos.delete(this.datos.keys().next().value!);
        return valor;
      })
      .finally(() => this.enVuelo.delete(clave));
    this.enVuelo.set(clave, p);
    return p;
  }

  get tamano() {
    return this.datos.size;
  }

  limpiar() {
    this.datos.clear();
    this.enVuelo.clear();
  }
}

/** Limita las llamadas simultáneas al proveedor dentro del proceso. */
export function semaforo(maximo: number) {
  let activas = 0;
  const cola: (() => void)[] = [];
  return async <R>(fn: () => Promise<R>): Promise<R> => {
    // El lugar se entrega directo al siguiente en cola: nunca hay más de `maximo` activas.
    if (activas >= maximo) await new Promise<void>((r) => cola.push(r));
    else activas++;
    try {
      return await fn();
    } finally {
      const siguiente = cola.shift();
      if (siguiente) siguiente();
      else activas--;
    }
  };
}
