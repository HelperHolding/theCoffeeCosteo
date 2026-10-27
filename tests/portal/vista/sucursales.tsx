import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { VentasPos } from '../../../components/sucursales/ventas-pos';
import { configDe } from '../../../lib/sucursales/config';
import {
  __reiniciarParaPruebas,
  construirPedidos,
  construirTendencias,
  construirProductos,
  construirVivo,
  sucursalInfo,
} from '../../../lib/sucursales/datos';
import { claveCosto, type DatosCosteo } from '../../../lib/sucursales/costeo';
import type { FiltroOrigen } from '../../../lib/sucursales/metricas';
import { enZona, sumarDias } from '../../../lib/sucursales/tiempo';
import { apiFalsa, pedido, type PedidoApi } from '../sucursales-fixtures';

/**
 * Ventas POS con DATOS SINTÉTICOS: el mismo pipeline del servidor corre en el navegador sobre un
 * fetch falso (sin red, sin token, sin Auth). ?sucursales[&estado=error|parcial|vacio]
 */
const cfg = configDe(612)!;
const estado = new URLSearchParams(window.location.search).get('estado');

// Costeo SINTÉTICO (costos inventados). Tres recetas con tamaño verificado, una Único y una sin verificar;
// GHC queda sin enlace. ?costeo=0 simula un usuario sin permiso de costos (la respuesta no trae costeo).
const ID = {
  tw: 'a96339d6-80e7-440b-a33b-bca51440d8e6',
  il: 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8',
  mil: '9756eec9-1f09-45ee-a45b-21ac8c54bb22',
  bro: 'b0000000-0000-4000-8000-000000000001',
  pum: 'b0000000-0000-4000-8000-000000000002',
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
              [ID.pum, 'Chica', 3000],
            ] as const
          ).map(([r, t, c]) => [claveCosto(r, t), { costoCent: c, usaInactivo: false }]),
        ),
        unicas: new Set([ID.bro]),
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
      const rappi = !app && azar() < 0.3;
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
  const m = /^\/api\/sucursales\/(\d+)\/(vivo|tendencias|productos|pedidos)$/.exec(url.pathname);
  if (!m) return fetchNavegador(entrada, init);
  await new Promise((r) => setTimeout(r, 250));
  const q = url.searchParams;
  const origen = (q.get('origen') ?? 'todos') as FiltroOrigen;
  const desde = q.get('desde') ?? hoy;
  const hasta = q.get('hasta') ?? desde;
  const cuerpo =
    m[2] === 'vivo'
      ? await construirVivo(cfg, origen, { forzar: q.get('fresco') === '1' })
      : m[2] === 'tendencias'
        ? await construirTendencias(cfg, Number(q.get('semanas') ?? 4) as 4 | 8 | 12, origen)
        : m[2] === 'productos'
          ? await construirProductos(cfg, desde, hasta, origen, costeo)
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
        descripcion={`Ventas · ${cfg.ciudad} · tienda ${cfg.lookerStoreId} · ID API ${cfg.companyId}`}
      />
      <VentasPos
        sucursal={sucursalInfo(cfg)}
        tabInicial={new URLSearchParams(window.location.search).get('tab') ?? 'vivo'}
        origenInicial="todos"
      />
    </Marco>
  );
}
