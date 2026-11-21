/**
 * Ficha de receta SIN costo (F6, migración 91): lo que devuelve franq_ficha_recetas, armado por producto y tamaño.
 * Proyección explícita: solo se copian los campos nombrados aquí, así que un campo nuevo en la RPC (p. ej. un costo)
 * nunca llega a la pantalla sin pasar por este archivo.
 */
export interface RpcFicha {
  productos: { id: string; nombre: string; categoria: string | null; tamanos: string[] }[];
  subrecetas: { id: string; nombre: string; rendimiento: number | string; unidad: string }[];
  lineas: {
    receta_id: string;
    tamano: string | null;
    orden: number;
    insumo: string | null;
    subreceta_id: string | null;
    subreceta: string | null;
    unidad: string | null;
    cantidad: number | string;
  }[];
}

export interface LineaFicha {
  nombre: string;
  cantidad: number;
  unidad: string;
  /** Si es una sub-receta, su id (se abre con sus propias líneas). */
  subrecetaId?: string;
}
export interface ProductoFicha {
  id: string;
  nombre: string;
  categoria: string;
  tamanos: { tamano: string; lineas: LineaFicha[] }[];
}
export interface SubrecetaFicha {
  id: string;
  nombre: string;
  rendimiento: number;
  unidad: string;
  lineas: LineaFicha[];
}
export interface Ficha {
  productos: ProductoFicha[];
  subrecetas: Record<string, SubrecetaFicha>;
}

const linea = (l: RpcFicha['lineas'][number]): LineaFicha => ({
  nombre: l.insumo ?? l.subreceta ?? '—',
  cantidad: Number(l.cantidad),
  unidad: l.unidad ?? '',
  ...(l.subreceta_id ? { subrecetaId: l.subreceta_id } : {}),
});

export function armarFicha(r: RpcFicha): Ficha {
  const porProducto = new Map<string, Map<string, LineaFicha[]>>();
  const porSub = new Map<string, LineaFicha[]>();
  for (const l of r.lineas) {
    if (l.tamano === null) {
      (porSub.get(l.receta_id) ?? porSub.set(l.receta_id, []).get(l.receta_id)!).push(linea(l));
      continue;
    }
    const t = porProducto.get(l.receta_id) ?? porProducto.set(l.receta_id, new Map()).get(l.receta_id)!;
    (t.get(l.tamano) ?? t.set(l.tamano, []).get(l.tamano)!).push(linea(l));
  }
  return {
    productos: r.productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria ?? 'Sin categoría',
      tamanos: p.tamanos.map((t) => ({ tamano: t, lineas: porProducto.get(p.id)?.get(t) ?? [] })),
    })),
    subrecetas: Object.fromEntries(
      r.subrecetas.map((s) => [
        s.id,
        {
          id: s.id,
          nombre: s.nombre,
          rendimiento: Number(s.rendimiento),
          unidad: s.unidad,
          lineas: porSub.get(s.id) ?? [],
        },
      ]),
    ),
  };
}

/** Cantidad legible: hasta 2 decimales, sin ceros sobrantes. */
export const cantidadTexto = (n: number) =>
  n.toLocaleString('es-MX', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
