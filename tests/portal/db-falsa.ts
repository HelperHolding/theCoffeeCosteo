/**
 * Base en memoria con la parte de la API de supabase-js que usan las acciones de Comercializadora:
 * from(t).select/insert/update/delete + eq/in/limit/maybeSingle, y await sobre la consulta.
 * `fallar` hace que una operación sobre una tabla devuelva error (para probar compensaciones).
 */
type Fila = Record<string, unknown>;

export function dbFalsa(
  tablas: Record<string, Fila[]>,
  fallar: { tabla: string; op: string; veces?: number }[] = [],
  rpc?: (fn: string, args: unknown) => { data: unknown; error: unknown },
) {
  let sec = 1000;
  const consultas: { tabla: string; op: string; datos?: unknown }[] = [];
  const from = (tabla: string) => {
    let op = '';
    let datos: unknown;
    let unico = false;
    let tope = Infinity;
    const filtros: ((f: Fila) => boolean)[] = [];
    const ejecutar = () => {
      consultas.push({ tabla, op: op || 'select', datos });
      const falla = fallar.find(
        (x) => x.tabla === tabla && x.op === (op || 'select') && (x.veces ?? Infinity) > 0,
      );
      if (falla) {
        if (falla.veces !== undefined) falla.veces--;
        return { data: null, error: { code: 'XX000', message: 'falla simulada' } };
      }
      const t = (tablas[tabla] ??= []);
      const coinciden = () => t.filter((f) => filtros.every((p) => p(f)));
      if (op === 'insert') {
        const nuevas = (Array.isArray(datos) ? datos : [datos]).map((d) => ({
          id: String(sec++),
          ...(d as Fila),
        }));
        t.push(...nuevas);
        return { data: nuevas, error: null };
      }
      if (op === 'update') {
        const c = coinciden();
        c.forEach((f) => Object.assign(f, datos as Fila));
        return { data: c, error: null };
      }
      if (op === 'delete') {
        const c = coinciden();
        tablas[tabla] = t.filter((f) => !c.includes(f));
        return { data: c, error: null };
      }
      // Copias, como PostgREST: un update posterior no debe cambiar lo que ya se leyó.
      const c = coinciden()
        .slice(0, tope)
        .map((f) => structuredClone(f));
      return { data: unico ? (c[0] ?? null) : c, error: null };
    };
    const q = {
      select: () => q,
      insert: (d: unknown) => ((op = 'insert'), (datos = d), q),
      update: (d: unknown) => ((op = 'update'), (datos = d), q),
      delete: () => ((op = 'delete'), q),
      eq: (k: string, v: unknown) => (filtros.push((f) => String(f[k]) === String(v)), q),
      in: (k: string, vs: unknown[]) => (filtros.push((f) => vs.map(String).includes(String(f[k]))), q),
      gte: (k: string, v: unknown) => (filtros.push((f) => String(f[k]) >= String(v)), q),
      order: () => q,
      limit: (n: number) => ((tope = n), q),
      maybeSingle: () => ((unico = true), q),
      then: (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) =>
        Promise.resolve(ejecutar()).then(ok, mal),
    };
    return q;
  };
  return {
    db: {
      from,
      rpc: async (fn: string, args: unknown) => (rpc ? rpc(fn, args) : { data: null, error: null }),
    },
    tablas,
    consultas,
  };
}
