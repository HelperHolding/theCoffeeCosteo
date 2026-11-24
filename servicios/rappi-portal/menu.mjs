// Menú/Carta del portal de Rappi Partners (docs/rappi-portal/09): convierte el GET
// partners-selfservice/selfservice/menu/{storeId} al lote de public.rappi_importar_menu. Funciones puras; el lector
// hace la consulta. SOLO LECTURA: los botones del menú (menu-update, menu-publish, item/{id}/active,
// topping/massive/deactivate, delete, cms) existen en el portal y no están en ninguna lista del lector.

/** Minúsculas, sin acentos y con espacios simples: para juntar el mismo producto entre tiendas (sus ids cambian). */
export const normalizarNombre = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const numero = (v) =>
  v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
/** Lo publicado manda; si el portal no lo trae, lo que está en edición. */
const datos = (x) => x?.published_data ?? x?.data ?? {};
const textoLimpio = (s) =>
  String(s ?? '')
    .replace(/^"+|"+$/g, '')
    .trim();

/**
 * Menú de UNA tienda → { tienda, productos, toppings }.
 * - Producto disponible = `available` Y `active_state` (el «apagado» del portal); `active` en false es otra cosa
 *   (inactivo o eliminado), se guarda aparte.
 * - Topping disponible = `active_state`. Un topping se repite en varios productos: se cuenta una vez por tienda con la
 *   unión de sus productos.
 * - `sin_opcion_obligatoria`: grupos con mínimo ≥ 1 donde ninguna opción está disponible (el producto aparece pero no
 *   se puede pedir).
 */
export function menuCompacto(tienda, j) {
  const corredores = j?.response?.corridors;
  if (!Array.isArray(corredores)) throw new Error(`Menú de ${tienda}: sin categorías.`);
  const productos = [];
  const toppings = new Map();
  for (const c of corredores) {
    const dc = datos(c);
    for (const p of c.products ?? []) {
      const dp = datos(p);
      const productoId = numero(dp.product_id ?? p.retail_id);
      if (productoId === null) continue;
      const sinOpcion = [];
      for (const g of p.topping_categories ?? []) {
        const dg = datos(g);
        const grupoId = numero(dg.topping_category_id ?? g.retail_id);
        const minimo = numero(dg.min_toppings_for_categories) ?? 0;
        let algunaDisponible = false;
        for (const t of g.toppings ?? []) {
          const dt = datos(t);
          const toppingId = numero(dt.topping_id ?? t.retail_id);
          if (toppingId === null) continue;
          const disponible = dt.active_state !== false && dt.active !== false;
          if (disponible) algunaDisponible = true;
          const previo = toppings.get(toppingId);
          if (previo) {
            if (!previo.productos.includes(productoId)) previo.productos.push(productoId);
          } else
            toppings.set(toppingId, {
              topping_id: toppingId,
              nombre: textoLimpio(dt.description),
              nombre_norm: normalizarNombre(textoLimpio(dt.description)),
              grupo_id: grupoId,
              grupo: textoLimpio(dg.description),
              grupo_minimo: minimo,
              grupo_maximo: numero(dg.max_toppings_for_categories),
              precio: numero(dt.price),
              disponible: dt.active_state !== false,
              activo: dt.active !== false,
              productos: [productoId],
            });
        }
        if (minimo >= 1 && (g.toppings ?? []).length && !algunaDisponible)
          sinOpcion.push(textoLimpio(dg.description));
      }
      productos.push({
        producto_id: productoId,
        nombre: textoLimpio(dp.name),
        nombre_norm: normalizarNombre(textoLimpio(dp.name)),
        categoria_id: numero(dc.corridor_id ?? c.retail_id),
        categoria: textoLimpio(dc.corridor_name),
        categoria_activa: dc.active_state !== false,
        precio: numero(dp.price),
        precio_anterior: numero(dp.old_price),
        disponible: dp.available !== false && dp.active_state !== false,
        activo: dp.active !== false,
        tiene_foto: !!dp.image,
        tiene_descripcion: textoLimpio(dp.description).length > 0,
        sku: dp.sku ?? null,
        combo: dp.combo === true,
        indice: numero(dp.index),
        sin_opcion_obligatoria: sinOpcion,
      });
    }
  }
  return { tienda, productos, toppings: [...toppings.values()] };
}

/**
 * ¿Esta corrida lee el menú? En vivo, cada 30 min en las corridas de :17 y :47 (no en la de :07, que ya trae los
 * indicadores de Nivel de servicio): 113 tiendas son unos 50 MB y 2–3 min. En manual, solo si se pide (`menu`).
 */
export const tocaMenu = ({ tipo, minuto, menu = false }) =>
  tipo === 'vivo'
    ? (minuto >= 10 && minuto < 20) || (minuto >= 40 && minuto < 50)
    : tipo === 'manual' && menu;
