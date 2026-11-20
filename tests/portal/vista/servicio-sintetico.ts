import type { FilaDiaRpc, RpcServicio, TramoRpc } from '../../../lib/sucursales/servicio';
import { diasEntre, sumarDias } from '../../../lib/sucursales/tiempo';

/**
 * Nivel de servicio SINTÉTICO para la prueba visual (?sucursales&gdl=1&portal=1&seccion=servicio): mismas formas que la
 * RPC sucursales_nivel_servicio, números inventados pero verosímiles (Namóra, normal y Turbo). &servicio=vacio: sin datos.
 */
const NORMAL = 'MX1930270777';
const TURBO = 'MX1930301156';
// Pseudoaleatorio estable por fecha: la vista no cambia al recargar.
const azar = (s: string, n: number) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h * (n + 7)) % 997) / 997;
};
const PRODUCTOS = [
  'Pumpkin Iced Latte',
  'True White',
  'Iced latte',
  'Crea tu The Coffee',
  'Croissant jamón y queso',
];
const COMENTARIOS = [
  'El vaso no venía bien sellado y se derramó más de la mitad',
  'Pedí leche de avena y llegó con leche entera',
  'Llegó tibio',
  null,
  'Faltó el croissant',
];
const MOTIVOS: [string, string][] = [
  ['wrong_item', 'totally_different_product'],
  ['missing_item', 'Not_arrived_bag_closed'],
  ['damaged_item', 'poorly_transported_not_edible'],
  ['damaged_item', 'incorrect_temperature'],
  ['missing_item', 'missing_ingredient'],
];

export function servicioSintetico(desde: string, hasta: string, hoy: string, vacio: boolean): RpcServicio {
  const dias: FilaDiaRpc[] = [];
  const reclamos: RpcServicio['reclamos'] = [];
  if (!vacio)
    for (let i = 0; i <= diasEntre(desde, hasta); i++) {
      const fecha = sumarDias(desde, i);
      for (const [tienda, base] of [
        [NORMAL, 34],
        [TURBO, 9],
      ] as const) {
        const r = azar(fecha + tienda, i);
        const pedidos = Math.round(base * (0.7 + r * 0.6));
        const recl = r > 0.55 ? Math.round(r * 3) : 0;
        dias.push({
          tienda,
          fecha,
          pedidos,
          rech_cbpi: r > 0.9 ? 1 : 0,
          rech_cbpr: 0,
          rech_tienda_cerrada: r < 0.06 ? 1 : 0,
          rech_sin_stock: r > 0.8 ? 1 : 0,
          rech_demora: 0,
          finalizados: pedidos - (r > 0.9 ? 1 : 0),
          recl_mal_estado: recl > 1 ? 1 : 0,
          recl_faltante: recl > 0 ? 1 : 0,
          recl_incorrecto: recl > 2 ? 1 : 0,
          disponibilidad: Math.round((86 + r * 14) * 100) / 100,
          indisponibilidad: Math.round((14 - r * 14) * 100) / 100,
          cocina_pedidos: pedidos,
          cocina_demorada: Math.round(pedidos * r * 0.3),
          sin_disp_minutos: Math.round((1 - r) * 120),
          espera_repartidor: fecha === hoy ? null : Math.round((1 + r * 4) * 100) / 100,
        });
        for (let k = 0; k < recl; k++) {
          const [motivo, subtipo] = MOTIVOS[(i + k) % MOTIVOS.length];
          reclamos.push({
            pedido: String(2489000000 + i * 10 + k + (tienda === TURBO ? 5 : 0)),
            tienda,
            fecha,
            motivo,
            subtipo,
            producto: PRODUCTOS[(i * 3 + k) % PRODUCTOS.length],
            comentario: COMENTARIOS[(i + k * 2) % COMENTARIOS.length],
            monto: k % 2 ? null : Math.round(r * 15000) / 100,
          });
        }
      }
    }
  // Conectividad de los últimos 3 días (hora del centro): abre 7:00, se apaga 40 min al mediodía de antier, cierra 22:00.
  const t = (fecha: string, hh: string) => new Date(`${fecha}T${hh}:00-06:00`).toISOString();
  const conectividad: TramoRpc[] = [];
  for (const fecha of [sumarDias(hoy, -2), sumarDias(hoy, -1), hoy]) {
    if (vacio || fecha < desde || fecha > hasta) continue;
    for (const tienda of [NORMAL, TURBO]) {
      const fin = fecha === hoy ? new Date(Date.now() - 4 * 60_000).toISOString() : t(fecha, '22:00');
      if (fecha === sumarDias(hoy, -2) && tienda === NORMAL) {
        conectividad.push({
          tienda,
          estado: 'ACTIVE',
          motivo: null,
          cierra: null,
          desde: t(fecha, '07:00'),
          visto: t(fecha, '12:10'),
          hasta: t(fecha, '12:20'),
        });
        conectividad.push({
          tienda,
          estado: 'INACTIVE',
          motivo: 'Not ready to sell',
          cierra: null,
          desde: t(fecha, '12:20'),
          visto: t(fecha, '12:50'),
          hasta: t(fecha, '13:00'),
        });
        conectividad.push({
          tienda,
          estado: 'ACTIVE',
          motivo: null,
          cierra: null,
          desde: t(fecha, '13:00'),
          visto: t(fecha, '22:00'),
          hasta: t(fecha, '22:10'),
        });
      } else if (fecha === sumarDias(hoy, -1) && tienda === TURBO) {
        // Hueco de 1 h sin foto (el lector no corrió).
        conectividad.push({
          tienda,
          estado: 'ACTIVE',
          motivo: null,
          cierra: null,
          desde: t(fecha, '07:00'),
          visto: t(fecha, '15:00'),
          hasta: t(fecha, '16:10'),
        });
        conectividad.push({
          tienda,
          estado: 'ACTIVE',
          motivo: null,
          cierra: null,
          desde: t(fecha, '16:10'),
          visto: t(fecha, '22:00'),
          hasta: t(fecha, '22:10'),
        });
      } else {
        conectividad.push({
          tienda,
          estado: 'ACTIVE',
          motivo: null,
          cierra: t(fecha, '22:00'),
          desde: t(fecha, '07:00'),
          visto: fin,
          hasta: fecha === hoy ? null : t(fecha, '22:10'),
        });
      }
    }
  }
  const matriz = (corte: number) =>
    Object.fromEntries(
      Array.from({ length: 18 }, (_, i) => i + 6).map((h) => [
        `${String(h).padStart(2, '0')}:00`,
        Object.fromEntries(
          ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d, j) => [
            d,
            h < 7 || h > 21 ? 0 : h === 7 ? 0.4 + j * 0.05 : Math.min(1, corte + azar(`${h}${d}`, j) * 0.3),
          ]),
        ),
      ]),
    );
  const vigente = vacio ? [] : conectividad.filter((c) => !c.hasta);
  return {
    tiendas: [
      { id: NORMAL, nombre: 'The Coffee Namóra', canal: 'normal' },
      { id: TURBO, nombre: 'The Coffee Namóra - Turbo', canal: 'turbo' },
    ],
    dias,
    reclamos: reclamos.sort((a, b) => b.fecha.localeCompare(a.fecha)),
    conectividad,
    vigente,
    primera_foto: vacio ? null : t(sumarDias(hoy, -2), '07:00'),
    semana: vacio
      ? []
      : [
          { tienda: NORMAL, fecha: hoy, matriz: matriz(0.75) },
          { tienda: TURBO, fecha: hoy, matriz: matriz(0.6) },
        ],
    top: vacio
      ? []
      : [
          { tienda: NORMAL, fecha: hoy, categoria: '2. Top 20%', proxima: '1. Top 5%' },
          { tienda: TURBO, fecha: hoy, categoria: '4. Beginner', proxima: '4. Beginner' },
        ],
    leido_en: new Date().toISOString(),
  };
}
