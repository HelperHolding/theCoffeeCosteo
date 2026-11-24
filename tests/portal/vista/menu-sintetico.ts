import type { ConfigSucursal } from '../../../lib/sucursales/config';
import type {
  ProductoMenuRpc,
  RpcMenuNacional,
  RpcMenuRappi,
  ToppingMenuRpc,
} from '../../../lib/sucursales/menu-rappi';
import muestra from './menu-essentia.json';

/**
 * Menú/Carta de Rappi SINTÉTICO para la prueba visual (docs/rappi-portal/09): el menú real de Essentia (normal y Turbo,
 * 2026-11-23) en la forma de las RPC, con lecturas desde hace 3 días, horas de apagado y cambios recientes.
 */
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const productos = muestra.productos as ProductoMenuRpc[];
const toppings = muestra.toppings as ToppingMenuRpc[];

export function menuSintetico(ahora = Date.now(), vacio = false): RpcMenuRappi {
  const primera = iso(ahora - 72 * H);
  if (vacio)
    return {
      tiendas: muestra.tiendas as RpcMenuRappi['tiendas'],
      productos: [],
      toppings: [],
      primera_lectura: null,
      corrida: null,
      cambios: [],
    };
  // De lo apagado: una parte desde la primera lectura, otra desde hace 30 h y otra desde hace 3 h.
  const ps = productos.map((p, i) =>
    p.disponible ? p : { ...p, desde: i % 3 === 0 ? null : iso(ahora - (i % 3 === 1 ? 30 : 3) * H) },
  );
  const ts = toppings.map((t, i) => (t.disponible ? t : { ...t, desde: i % 2 ? iso(ahora - 5 * H) : null }));
  const apagadosHoy = ps.filter((p) => p.desde && ahora - Date.parse(p.desde) < 24 * H);
  const prendido = productos.find((p) => p.disponible)!;
  return {
    tiendas: muestra.tiendas as RpcMenuRappi['tiendas'],
    productos: ps,
    toppings: ts,
    primera_lectura: primera,
    corrida: {
      inicio: iso(ahora - 14 * 60_000),
      fin: iso(ahora - 12 * 60_000),
      tiendas: 113,
      leidas: 113,
      fallidas: 0,
      completa: true,
      detalle: [],
    },
    cambios: [
      ...apagadosHoy.map((p) => ({
        tienda: p.tienda,
        tipo: 'producto' as const,
        item_id: p.id,
        disponible: false,
        desde: p.desde!,
        hasta: null,
      })),
      {
        tienda: prendido.tienda,
        tipo: 'producto',
        item_id: prendido.id,
        disponible: true,
        desde: iso(ahora - 2 * H),
        hasta: null,
      },
    ],
  };
}

/** Todas las sucursales con portal: el menú de Essentia con una parte distinta apagada en cada una. */
export function menuNacionalSintetico(sucursales: ConfigSucursal[], ahora = Date.now()): RpcMenuNacional {
  const tiendas: RpcMenuNacional['tiendas'] = [];
  const por_tienda: RpcMenuNacional['por_tienda'] = [];
  const apagados: RpcMenuNacional['apagados'] = [];
  const sin_opcion: RpcMenuNacional['sin_opcion'] = [];
  const presencia = new Map<string, number>();
  const normales = productos.filter((p) => p.tienda === muestra.tiendas[0].id);
  const tops = toppings.filter((t) => t.tienda === muestra.tiendas[0].id);
  sucursales
    .filter((s) => s.rappiPortal)
    .forEach((s, k) => {
      for (const canal of ['normal', 'turbo'] as const) {
        if (canal === 'turbo' && k % 3) continue;
        const id = `${canal === 'normal' ? 'N' : 'T'}${s.companyId}`;
        tiendas.push({
          id,
          company_id: s.companyId,
          nombre: `${s.nombre}${canal === 'turbo' ? ' Turbo' : ''}`,
          canal,
        });
        // Parte apagada distinta por sucursal (de 0 a ~25 %), con los mismos productos más seguido.
        const cada = 4 + ((s.companyId * 7) % 23);
        const off = normales.filter(
          (p, i) => (i * 13 + s.companyId) % cada === 0 || (!p.disponible && k % 4 === 0),
        );
        const topsOff = tops.filter((_, i) => (i + s.companyId) % 37 === 0);
        for (const p of normales) presencia.set(p.nombre_norm, (presencia.get(p.nombre_norm) ?? 0) + 1);
        por_tienda.push({
          tienda: id,
          productos: normales.length,
          apagados: off.length,
          toppings: tops.length,
          toppings_apagados: topsOff.length,
          sin_opcion: k % 9 === 0 ? 1 : 0,
          sin_foto: k % 11 === 0 ? 2 : 0,
          sin_descripcion: 0,
        });
        off.forEach((p, i) =>
          apagados.push({
            tienda: id,
            tipo: 'producto',
            id: p.id,
            nombre: p.nombre,
            nombre_norm: p.nombre_norm,
            categoria: p.categoria,
            desde: i % 3 === 0 ? null : iso(ahora - ((i * 11 + k) % 70) * H),
          }),
        );
        topsOff.forEach((t) =>
          apagados.push({
            tienda: id,
            tipo: 'topping',
            id: t.id,
            nombre: t.nombre,
            nombre_norm: t.nombre_norm,
            categoria: t.grupo,
            desde: iso(ahora - 6 * H),
          }),
        );
        if (k % 9 === 0)
          sin_opcion.push({
            tienda: id,
            nombre: 'The Perfect Match',
            categoria: 'Combos',
            grupos: ['Elige tu Match'],
          });
      }
    });
  return {
    tiendas,
    por_tienda,
    apagados,
    sin_opcion,
    presencia: [...presencia].map(([nombre_norm, n]) => ({ nombre_norm, tiendas: n })),
    primera_lectura: iso(ahora - 72 * H),
    corrida: {
      inicio: iso(ahora - 9 * 60_000),
      fin: iso(ahora - 7 * 60_000),
      tiendas: tiendas.length,
      leidas: tiendas.length - 1,
      fallidas: 1,
      completa: false,
      detalle: [{ tienda: tiendas[tiendas.length - 1]?.id ?? '', motivo: '403' }],
    },
  };
}
