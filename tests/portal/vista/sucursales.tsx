import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { SeccionesSucursal, type IdSeccion } from '../../../components/sucursales/secciones';
import { configDe } from '../../../lib/sucursales/config';
import {
  __reiniciarParaPruebas,
  construirConsumo,
  construirCosteo,
  construirPedidos,
  construirTendencias,
  construirProductos,
  construirVivo,
  sucursalInfo,
} from '../../../lib/sucursales/datos';
import { claveCosto, type DatosCosteo } from '../../../lib/sucursales/costeo';
import { claveConsumo, type DatosConsumo, type InsumoReceta } from '../../../lib/sucursales/consumo';
import { periodoDeUrl } from '../../../lib/sucursales/periodo';
import { construirRappiPortal, type RpcRappiPortal } from '../../../lib/sucursales/rappi-portal';
import { pedidoRappiAPos } from '../../../lib/sucursales/rappi-pos';
import type { FiltroOrigen } from '../../../lib/sucursales/metricas';
import { enZona, sumarDias } from '../../../lib/sucursales/tiempo';
import { apiFalsa, pedido, type PedidoApi } from '../sucursales-fixtures';

/**
 * Ventas POS con DATOS SINTÉTICOS: el mismo pipeline del servidor corre en el navegador sobre un
 * fetch falso (sin red, sin token, sin Auth). ?sucursales[&estado=error|parcial|vacio][&gdl=1][&seccion=…]
 * &gdl=1: una sucursal de Guadalajara SIN Rappi en la API (mismo fixture, sin pedidos Rappi).
 * &portal=1 (con gdl=1): además, Rappi leído del portal de Partners (pestaña Rappi, pedidos sintéticos).
 */
const parametros = new URLSearchParams(window.location.search);
const gdl = parametros.get('gdl') === '1';
const portal = gdl && parametros.get('portal') === '1';
const cfg = gdl
  ? {
      ...configDe(384)!,
      companyId: 612,
      lookerStoreId: 477,
      nombre: portal ? 'Namóra (sintética)' : 'Ventura (sintética)',
      rappiPortal: portal,
    }
  : configDe(612)!;

// Pedidos de Rappi SINTÉTICOS del portal (nombres del menú de Rappi; precios y cantidades inventados).
const MENU_RAPPI: [string, number, [string, string, number?][][]][] = [
  [
    'Pumpkin Iced Latte',
    122,
    [
      [['Elige el Tamaño ', 'Grande 590 ml.', 13]],
      [['Café', 'Double Shot (36ml)']],
      [
        ['Leche.', 'Deslactosada', 13],
        ['Leche.', 'Entera'],
      ],
    ],
  ],
  [
    'Iced latte',
    88,
    [
      [
        ['Elige el Tamaño ', 'Mediano 440  ml'],
        ['Elige el Tamaño ', 'Grande 590 ml.', 13],
      ],
      [
        ['Café', 'Double Shot (36ml)'],
        ['Café', 'Single Shot (18ml)'],
      ],
      [
        ['Leche.', 'Entera'],
        ['Leche.', 'Avena', 13],
      ],
      [
        ['Miel', 'Poco'],
        ['Miel', 'Sin'],
      ],
    ],
  ],
  [
    'Crea tu The Coffee ',
    199,
    [
      [['Elige Tu Sandwich', ' Croissant relleno de queso y jamón ']],
      [
        ['Elige tu Bebida ', 'True White', 10],
        ['Elige tu Bebida ', 'Iced Latte'],
      ],
      [
        ['Leche.', 'Entera'],
        ['Leche.', 'Deslactosada', 13],
      ],
    ],
  ],
  [
    'Matcha Iced Latte',
    110,
    [
      [
        ['Leche.', 'Avena', 13],
        ['Leche.', 'Entera'],
      ],
    ],
  ],
  ['Kouign Amann Hazelnut', 75, []],
];
function rappiPortalSintetico(desde: string, hasta: string): RpcRappiPortal {
  let s = 7;
  const azar = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const pedidos: RpcRappiPortal['pedidos'] = [];
  const conteos: RpcRappiPortal['conteos'] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    for (const [tienda, n] of [
      ['MXN', 6],
      ['MXT', 8],
    ] as const) {
      const total = Math.floor(n + azar() * 6);
      const devueltos = total - (azar() < 0.25 ? 1 : 0);
      conteos.push({ tienda, fecha: d, total_rows: total, devueltos });
      for (let i = 0; i < devueltos; i++) {
        const productos = MENU_RAPPI.filter(() => azar() < 0.35)
          .slice(0, 2)
          .map(([nombre, base, grupos]) => {
            const opciones = grupos.map((g) => g[Math.floor(azar() * g.length)]);
            const precio = base + opciones.reduce((a, o) => a + (o[2] ?? 0), 0);
            return {
              nombre,
              unidades: 1,
              precio,
              opciones: opciones.map(([categoria, descripcion, p]) => ({
                categoria,
                descripcion,
                precio: p ?? 0,
                unidades: 1,
              })),
            };
          });
        if (!productos.length) continue;
        const h = 7 + Math.floor(azar() * 13);
        const estadoP = azar() < 0.06 ? 'canceled' : azar() < 0.5 ? 'pending_review' : 'finished';
        pedidos.push({
          id: String(2_483_700_000 + pedidos.length * 977),
          tienda,
          creado: `${d}T${String(h).padStart(2, '0')}:${String(Math.floor(azar() * 60)).padStart(2, '0')}:00`,
          fecha: d,
          estado: estadoP,
          estado_nombre: estadoP === 'canceled' ? 'Cancelada' : 'Terminada',
          en_disputa: azar() < 0.04,
          estado_disputa: null,
          metodo_pago: azar() < 0.6 ? 'Tarjeta de Crédito' : 'Efectivo contraentrega',
          bruto: productos.reduce((a, x) => a + x.precio, 0),
          descuento_aliado: azar() < 0.3 ? 20 : null,
          estado_anterior: null,
          revisar: false,
          cambios: 0,
          productos,
        });
      }
    }
  }
  pedidos.sort((a, b) => b.creado.localeCompare(a.creado));
  return {
    tiendas: [
      { id: 'MXN', nombre: 'The Coffee Namóra (sintética)', canal: 'normal' },
      { id: 'MXT', nombre: 'The Coffee Namóra - Turbo (sintética)', canal: 'turbo' },
    ],
    ultima_corrida: {
      inicio: new Date(Date.now() - 4 * 60_000).toISOString(),
      tipo: 'vivo',
      estado: 'ok',
      mensaje: null,
    },
    ultima_ok: new Date(Date.now() - 4 * 60_000).toISOString(),
    conteos,
    pedidos,
  };
}
const estado = parametros.get('estado');

// Costeo SINTÉTICO (costos inventados). Tres recetas con tamaño verificado, una Único y una sin verificar;
// GHC queda sin enlace. ?costeo=0 simula un usuario sin permiso de costos (la respuesta no trae costeo).
const ID = {
  tw: 'a96339d6-80e7-440b-a33b-bca51440d8e6',
  il: 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8',
  mil: '9756eec9-1f09-45ee-a45b-21ac8c54bb22',
  bro: 'b0000000-0000-4000-8000-000000000001',
  pum: 'b0000000-0000-4000-8000-000000000002',
  cro: 'b0000000-0000-4000-8000-000000000003',
};
const costeo: DatosCosteo | null =
  new URLSearchParams(window.location.search).get('costeo') === '0'
    ? null
    : {
        leidoEn: new Date().toISOString(),
        iva: 0.16,
        enlaces: new Map([
          ['TW', { recetaId: ID.tw, receta: 'True White' }],
          ['5IL', { recetaId: ID.il, receta: 'Iced Latte' }],
          ['4MIL', { recetaId: ID.mil, receta: 'Matcha Iced Latte' }],
          ['BRO13', { recetaId: ID.bro, receta: 'Brownie' }],
          ['PUMPL', { recetaId: ID.pum, receta: 'Pumpkin Latte' }],
          // Códigos del menú real que usa el Rappi sintético del portal (combo «Crea tu The Coffee»).
          ['4TW', { recetaId: ID.tw, receta: 'True White' }],
          ['CROSTUAPP', { recetaId: ID.cro, receta: 'Croissant filled with cheese and ham' }],
        ]),
        costos: new Map(
          (
            [
              [ID.tw, 'Chica', 2100],
              [ID.tw, 'Grande', 2500],
              [ID.il, 'Chica', 1500],
              [ID.il, 'Grande', 1800],
              [ID.mil, 'Chica', 2600],
              [ID.mil, 'Grande', 3100],
              [ID.bro, 'Único', 2900],
              [ID.cro, 'Único', 3100],
              [ID.pum, 'Chica', 3000],
            ] as const
          ).map(([r, t, c]) => [claveCosto(r, t), { costoCent: c, usaInactivo: false }]),
        ),
        unicas: new Set([ID.bro, ID.cro]),
      };

// Recetas SINTÉTICAS (cantidades inventadas) para el consumo teórico. Pumpkin Latte sin tamaño verificado.
const ins = (
  insumoId: string,
  insumo: string,
  unidad: string,
  categoria: string,
  cantidad: number,
): InsumoReceta => ({
  insumoId,
  insumo,
  unidad,
  categoria,
  cantidad,
});
const LECHE = (n: number) => ins('le', 'LECHE ENTERA', 'ml', 'LECHE', n);
const ALMENDRA = (n: number) => ins('la', 'LECHE ALMENDRA', 'ml', 'LECHE', n);
const DESLAC = (n: number) => ins('ld', 'LECHE DESLACTOSADAS', 'ml', 'LECHE', n);
const CAFE = (n: number) => ins('cf', 'CAFÉ ESPRESSO', 'gr', 'CAFÉ', n);
const HIELO = (n: number) => ins('hi', 'HIELO', 'gr', 'HIELO', n);
const VASO = ins('va', 'VASO FRÍO', 'pza', 'DESECHABLE', 1);
const consumo: DatosConsumo = {
  leidoEn: new Date().toISOString(),
  enlaces: costeo?.enlaces ?? new Map(),
  unicas: new Set([ID.bro, ID.cro]),
  recetas: new Map([
    [
      claveConsumo(ID.cro, 'Único'),
      [
        ins('cr', 'CROISSANT TRADICIONAL', 'pza', 'PANADERIA', 1),
        ins('jq', 'JAMÓN', 'gr', 'PERECEDEROS', 30),
      ],
    ],
    [
      claveConsumo(ID.tw, 'Chica'),
      [DESLAC(220), CAFE(9), ins('ch', 'CHOCOLATE BLANCO', 'gr', 'INGREDIENTES', 20), VASO],
    ],
    [
      claveConsumo(ID.tw, 'Grande'),
      [DESLAC(300), CAFE(18), ins('ch', 'CHOCOLATE BLANCO', 'gr', 'INGREDIENTES', 28), VASO],
    ],
    [claveConsumo(ID.il, 'Chica'), [LECHE(180), CAFE(18), HIELO(150), VASO]],
    [claveConsumo(ID.il, 'Grande'), [LECHE(260), CAFE(18), HIELO(200), VASO]],
    [
      claveConsumo(ID.mil, 'Chica'),
      [ALMENDRA(180), ins('ma', 'MATCHA', 'gr', 'POLVOS', 4), HIELO(150), VASO],
    ],
    [
      claveConsumo(ID.mil, 'Grande'),
      [ALMENDRA(250), ins('ma', 'MATCHA', 'gr', 'POLVOS', 6), HIELO(200), VASO],
    ],
    [claveConsumo(ID.bro, 'Único'), [ins('br', 'BROWNIE', 'pza', 'PANADERIA', 1)]],
  ]),
};

const PRODUCTOS = [
  ['PUMPL', 'Pumpkin Latte', 129],
  ['TW', 'True White', 78],
  ['5IL', 'Iced Latte', 80],
  ['4MIL', 'Matcha Iced Latte', 77],
  ['GHC', 'Grilled Ham & Cheese Sandwich', 98],
  ['BRO13', 'Brownie', 75],
] as const;
// Curva de demanda típica (pedidos por hora, 07–21).
const DEMANDA = [2, 10, 9, 8, 6, 6, 7, 5, 4, 3, 7, 8, 9, 6, 3];

function dia(fecha: string, hastaSegundo: number, semilla: number): PedidoApi[] {
  const ps: PedidoApi[] = [];
  let s = semilla;
  const azar = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  DEMANDA.forEach((n, i) => {
    const h = 7 + i;
    for (let k = 0; k < n; k++) {
      const seg = h * 3600 + Math.floor(azar() * 3600);
      if (seg > hastaSegundo) continue;
      const hora = `${String(h).padStart(2, '0')}:${String(Math.floor((seg % 3600) / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
      const lineas = PRODUCTOS.filter(() => azar() < 0.3).slice(0, 3);
      const usar = lineas.length ? lineas : [PRODUCTOS[Math.floor(azar() * PRODUCTOS.length)]];
      const conAvena = azar() < 0.3;
      const conShot = azar() < 0.4;
      const app = azar() < 0.07;
      const rappi = !gdl && !app && azar() < 0.3;
      const efectivo = !app && !rappi && azar() < 0.12;
      // Como en la API real: la App manda a veces defaultCode null (desde 2026-10-02, conciliacion-brasil/05).
      const sinCodigo = app && azar() < 0.6;
      const items: PedidoApi['items'] = usar.map(([defaultCode, productName, amount], j) => ({
        defaultCode: sinCodigo ? null : (defaultCode as string | null),
        productName,
        amount,
        discount: 0,
        itemsCustom: [
          ...(j === 0 && conAvena
            ? [{ defaultCode: 'LVG', productName: 'Oatmilk', amount: 13, discount: 0 }]
            : []),
          ...(j === 0 && conShot
            ? [{ defaultCode: 'ORCF', productName: 'Double shot (36ml)', amount: 0, discount: 0 }]
            : []),
          {
            defaultCode: 'TRADICAPP',
            productName: azar() < 0.5 ? 'Regular - 440ml' : 'Large - 600ml',
            amount: 0,
            discount: 0,
          },
        ],
      }));
      // Línea genérica del proveedor en algunos pedidos Rappi (sin nombre ni personalizaciones).
      if (rappi && azar() < 0.2)
        items.push({
          defaultCode: 'GENERIC',
          productName: 'Generic',
          amount: 111,
          discount: 0,
          itemsCustom: [],
        });
      const gross = items.reduce((t, x) => t + x.amount + x.itemsCustom.reduce((u, c) => u + c.amount, 0), 0);
      ps.push(
        pedido(fecha, hora, {
          items,
          // Rappi: número de orden sintético de 10 dígitos; los demás pagos conservan el UUID sintético del fixture.
          ...(rappi ? { refundId: String(2_400_000_000 + Math.floor(azar() * 99_999_999)) } : {}),
          grossAmount: gross,
          netAmout: rappi ? Math.round(gross * 92) / 100 : gross,
          fromSmartphone: app,
          paymentMethod: app ? 'VIRTUAL_WALLET' : rappi ? 'RAPPI' : efectivo ? 'DINHEIRO' : 'CARTAO',
          paymentType: app ? 'WALLET' : rappi ? 'CREDIT' : efectivo ? 'CONTINGENCY' : 'CONTACTLESS_EMV',
        }),
      );
    }
  });
  return ps;
}

const ahora = enZona(new Date(), cfg.zona);
const hoy = ahora.fecha;
const datos: Record<string, PedidoApi[]> =
  estado === 'vacio'
    ? { [sumarDias(hoy, -7)]: dia(sumarDias(hoy, -7), 86_399, 7) }
    : Object.fromEntries(
        Array.from({ length: 90 }, (_, i) => {
          const f = sumarDias(hoy, -i);
          return [f, dia(f, i === 0 ? ahora.segundo : 86_399, 11 + i)];
        }),
      );
const api = apiFalsa(datos);
const fetchProveedor: typeof fetch = async (u, init) => {
  if (estado === 'error') return new Response('', { status: 503 });
  if (estado === 'parcial' && String(u).includes(`dateStart=${sumarDias(hoy, -7)}`))
    return new Response('', { status: 503 });
  return api.fetch(u, init);
};
__reiniciarParaPruebas({
  fetch: fetchProveedor,
  esperar: async () => {},
  ahora: () => Date.now(),
  token: () => 'sintetico',
});

// Los route handlers del portal se sustituyen por el mismo pipeline en el navegador.
const fetchNavegador = window.fetch.bind(window);
window.fetch = async (entrada, init) => {
  const url = new URL(String(entrada), window.location.origin);
  const m =
    /^\/api\/sucursales\/(\d+)\/(vivo|tendencias|productos|pedidos|costeo|consumo|rappi-portal)$/.exec(
      url.pathname,
    );
  if (!m) return fetchNavegador(entrada, init);
  await new Promise((r) => setTimeout(r, 250));
  const q = url.searchParams;
  const origen = (q.get('origen') ?? 'todos') as FiltroOrigen;
  const desde = q.get('desde') ?? hoy;
  const hasta = q.get('hasta') ?? desde;
  if (m[2] === 'rappi-portal')
    return Response.json(construirRappiPortal(rappiPortalSintetico(desde, hasta), desde, hasta));
  if (m[2] === 'costeo' && !costeo)
    return Response.json({ error: 'No tienes acceso al Costeo de esta sucursal.' }, { status: 403 });
  // Namóra sintética: Rappi del portal traducido al POS, como en producción (fuenteRappi).
  const rappi = portal
    ? async (d: string, h: string) =>
        rappiPortalSintetico(d, h)
          .pedidos.map(pedidoRappiAPos)
          .filter((p) => p !== null)
    : undefined;
  if (m[2] === 'costeo')
    return Response.json(await construirCosteo(cfg, desde, hasta, origen, costeo!, null, rappi));
  if (m[2] === 'consumo')
    return Response.json(await construirConsumo(cfg, desde, hasta, origen, consumo, null, rappi));
  const cuerpo =
    m[2] === 'vivo'
      ? await construirVivo(cfg, origen, { forzar: q.get('fresco') === '1' })
      : m[2] === 'tendencias'
        ? await construirTendencias(cfg, Number(q.get('semanas') ?? 4) as 4 | 8 | 12, origen)
        : m[2] === 'productos'
          ? await construirProductos(cfg, desde, hasta, origen)
          : await construirPedidos(cfg, desde, hasta, origen, q.get('pago'), Number(q.get('pagina') ?? 1));
  return Response.json(cuerpo);
};

export function VistaSucursales() {
  return (
    <Marco
      perfil={{ nombre: 'Usuario Prueba', rol: 'admin' }}
      seccion="sucursales"
      visibles={['costeo', 'crm', 'sucursales']}
    >
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth, sin token y sin conexión a la API</p>
      <Encabezado
        titulo={cfg.nombre}
        migas={[{ href: '/sucursales', nombre: 'Sucursales' }]}
        descripcion={`${cfg.ubicacion ? `${cfg.ubicacion}, ` : ''}${cfg.ciudad} · tienda ${cfg.lookerStoreId} · ID API ${cfg.companyId}`}
      />
      <SeccionesSucursal
        sucursal={sucursalInfo(cfg)}
        puedeCostear={!!costeo}
        seccionInicial={(parametros.get('seccion') ?? 'ventas') as IdSeccion}
        tabInicial={parametros.get('tab') ?? 'vivo'}
        origenInicial="todos"
        periodoInicial={periodoDeUrl(parametros, 'hoy')}
      />
    </Marco>
  );
}
