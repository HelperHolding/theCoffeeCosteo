import type { Resumen, Alerta } from '../supabase/database.types';
export function indicadores(filas: Resumen[]) {
  const activos = filas.filter((f) => f.activo);
  const mostrador = activos.filter((f) => f.canal === 'Mostrador');
  const conPrecio = mostrador.filter((f) => f.food_cost !== null);
  const contar = (xs: Resumen[]) => new Set(xs.map((f) => f.producto_id)).size;
  return {
    productos: contar(activos),
    foodCost: conPrecio.length ? conPrecio.reduce((n, f) => n + f.food_cost!, 0) / conPrecio.length : null,
    bajoObjetivo: contar(
      mostrador.filter((f) => f.margen_pct !== null && f.margen_pct > 0 && f.margen_pct < f.margen_objetivo),
    ),
    sinPrecio: contar(mostrador.filter((f) => f.precio_lista === null)),
    pierdenDelivery: contar(
      activos.filter((f) => f.canal !== 'Mostrador' && f.margen !== null && f.margen < 0),
    ),
  };
}

// Agregaciones de presentación para el tablero. Solo leen filas ya calculadas por v_resumen.
export type Salud = 'ok' | 'bajo' | 'pierde' | 'sin-precio';
export function saludMenu(filas: Resumen[]): Record<Salud, number> {
  const porProducto = new Map<string, Resumen[]>();
  for (const f of filas.filter((f) => f.activo))
    porProducto.set(f.producto_id, [...(porProducto.get(f.producto_id) ?? []), f]);
  const conteo: Record<Salud, number> = { ok: 0, bajo: 0, pierde: 0, 'sin-precio': 0 };
  for (const xs of porProducto.values()) {
    const mostrador = xs.filter((f) => f.canal === 'Mostrador');
    if (mostrador.some((f) => f.precio_lista === null)) conteo['sin-precio']++;
    else if (xs.some((f) => f.margen !== null && f.margen < 0)) conteo.pierde++;
    else if (mostrador.some((f) => f.margen_pct !== null && f.margen_pct < f.margen_objetivo)) conteo.bajo++;
    else conteo.ok++;
  }
  return conteo;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function margenPor(filas: Resumen[], clave: 'categoria' | 'canal', soloMostrador: boolean) {
  const grupos = new Map<string, { orden: number; valores: number[] }>();
  for (const f of filas) {
    if (!f.activo || f.margen_pct === null || (soloMostrador && f.canal !== 'Mostrador')) continue;
    const g = grupos.get(f[clave]) ?? { orden: f.canal_orden, valores: [] };
    g.valores.push(f.margen_pct);
    grupos.set(f[clave], g);
  }
  return [...grupos.entries()]
    .map(([nombre, g]) => ({ nombre, orden: g.orden, margen: media(g.valores)!, n: g.valores.length }))
    .sort((a, b) => (clave === 'canal' ? a.orden - b.orden : b.margen - a.margen));
}

export function menorMargen(filas: Resumen[], n = 8) {
  return filas
    .filter((f) => f.activo && f.canal === 'Mostrador' && f.margen_pct !== null)
    .sort((a, b) => a.margen_pct! - b.margen_pct!)
    .slice(0, n);
}

export function alertasPorTipo(alertas: Alerta[], activos: Set<string>) {
  const grupos = new Map<string, Alerta[]>();
  for (const a of alertas) {
    if (!a.alerta || !activos.has(a.producto_id)) continue;
    grupos.set(a.alerta, [...(grupos.get(a.alerta) ?? []), a]);
  }
  return [...grupos.entries()]
    .map(([alerta, filas]) => ({ alerta, filas }))
    .sort((a, b) => b.filas.length - a.filas.length);
}
