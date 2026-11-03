// Convierte lo que devuelve el historial del portal de Rappi Partners (rests-stores-config/orders/by-stores y el detalle
// /orders/{id}) al lote de public.rappi_importar (docs/rappi-portal/02 §5). Sin datos personales: se descartan
// application_user_full_name y application_user_id.

/** Fecha local AAAA-MM-DD en México, desplazada `dias`. */
export function fechaMX(dias = 0, ahora = new Date()) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(ahora);
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde, hasta) {
  const out = [];
  for (
    let d = new Date(`${desde}T12:00:00Z`);
    d.toISOString().slice(0, 10) <= hasta;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    out.push(d.toISOString().slice(0, 10));
  return out;
}

/**
 * Corre `fn` sobre cada elemento con a lo más `n` a la vez y devuelve los resultados en el orden de entrada. Al primer
 * error deja de tomar elementos, espera a los que ya corrían y lo lanza: no queda nada corriendo al cerrar el navegador.
 * @template T, R
 * @param {T[]} elementos
 * @param {number} n
 * @param {(x: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function enParalelo(elementos, n, fn) {
  const res = new Array(elementos.length);
  let siguiente = 0;
  let fallo = null;
  const trabajador = async () => {
    while (!fallo && siguiente < elementos.length) {
      const i = siguiente++;
      try {
        res[i] = await fn(elementos[i]);
      } catch (e) {
        fallo ??= { e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, elementos.length)) }, trabajador));
  if (fallo) throw fallo.e;
  return res;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/**
 * Un pedido del listado (y su detalle, si se leyó) en el formato del lote. `created_at` es hora local con etiqueta
 * +00:00 (doc 01 §4): se conserva la hora tal cual, sin convertir.
 * @param {any} o pedido del listado (by-stores)
 * @param {string} tienda ID de la tienda en Rappi (MX…)
 * @param {{ discount_info?: any } | null} [detalle] respuesta del detalle, si se leyó
 */
export function pedidoDeListado(o, tienda, detalle = null) {
  const id = String(o?.id ?? '').replace(/^MX/, '');
  if (!/^\d{5,20}$/.test(id)) throw new Error(`Pedido sin ID válido: ${o?.id}`);
  const creado = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(String(o.created_at ?? ''));
  if (!creado) throw new Error(`Pedido ${id}: fecha ilegible "${o.created_at}".`);
  const bruto = num(o.order_product_total_price);
  if (bruto === null) throw new Error(`Pedido ${id}: sin total de productos.`);
  const productos = (o.order_product_details ?? []).map((p, i) => ({
    linea: i + 1,
    rappi_producto_id: p.id ?? null,
    nombre: String(p.product_name ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
    unidades: Number(p.units),
    precio: num(p.total_price),
    precio_con_desc_aliado: num(p.total_price_with_partner_discount),
    descuento_rappi_pct: num(p.discount_percentage_by_rappi),
    opciones: (p.toppings ?? []).map((t) => ({
      categoria: String(t.topping_category_name ?? '').trim(),
      descripcion: String(t.description ?? '').trim(),
      precio: num(t.price) ?? 0,
      unidades: Number(t.units) || 1,
    })),
  }));
  if (
    productos.some((p) => !p.nombre || !Number.isInteger(p.unidades) || p.unidades < 1 || p.precio === null)
  )
    throw new Error(`Pedido ${id}: productos incompletos.`);
  const d = detalle?.discount_info;
  return {
    id,
    tienda,
    creado: `${creado[1]}T${creado[2]}`,
    estado: String(o.state ?? ''),
    estado_nombre: String(o.state_name ?? ''),
    en_disputa: o.is_dispute === true,
    estado_disputa: o.dispute_status || null,
    metodo_pago: o.payment_method ?? null,
    prime: typeof o.prime === 'boolean' ? o.prime : null,
    bruto,
    descuento_aliado: d ? num(d.total_discount_by_partner) : null,
    descuentos: d ? (d.discounts ?? []) : null,
    productos,
  };
}

/** Huella barata para decidir si vale la pena volver a leer el detalle (descuentos) de un pedido. */
export const huellaListado = (o) =>
  JSON.stringify([o.state, o.is_dispute, o.dispute_status, o.order_product_total_price]);
