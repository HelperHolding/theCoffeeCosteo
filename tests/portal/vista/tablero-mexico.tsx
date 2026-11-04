import '../../../components/sucursales/tablero-mexico.css';
import '../../../app/(sucursales)/sucursales/vitrina.css';
import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { VistasMexico } from '../../../components/sucursales/vistas-mexico';
import { sucursalesConfiguradas as configuradas, type ConfigSucursal } from '../../../lib/sucursales/config';
import { armarConsumoNacional, type RpcConsumoNacional } from '../../../lib/sucursales/consumo-nacional';
import { diaLunes } from '../../../lib/sucursales/metricas';
import type { Origen, PedidoNormal } from '../../../lib/sucursales/normalizar';
import {
  armarHoy,
  armarPeriodo,
  resumirDia,
  type FilaResumen,
  type RpcHoy,
  type RpcPeriodo,
} from '../../../lib/sucursales/resumen';
import { enZona, sumarDias } from '../../../lib/sucursales/tiempo';

/**
 * Tablero de México con DATOS SINTÉTICOS (?tablero-mexico[&semanas=4|8|12][&vacio=1]): resúmenes armados con
 * resumirDia y sumados como las RPC de la migración 37, en el navegador. Sin red, sin token y sin Auth.
 */
const parametros = new URLSearchParams(window.location.search);
// &completo=1: además, sucursales SINTÉTICAS en las ciudades de los lotes 2 a 6 (doc 15), para ver el mapa lleno.
const CIUDADES_LOTES = [
  'Toluca',
  'Metepec',
  'Pachuca',
  'Puebla',
  'Querétaro',
  'León',
  'San Miguel de Allende',
  'Aguascalientes',
  'Zacatecas',
  'San Luis Potosí',
  'Colima',
  'Puerto Vallarta',
  'Veracruz',
  'Oaxaca',
  'Tuxtla Gutiérrez',
  'Durango',
  'Torreón',
  'Tijuana',
  'Hermosillo',
  'Mérida',
  'Tulum',
  'Monterrey',
  'Morelia',
];
const sucursalesConfiguradas: ConfigSucursal[] =
  parametros.get('completo') === '1'
    ? [
        ...configuradas,
        ...CIUDADES_LOTES.map((ciudad, i) => ({
          ...configuradas[3],
          companyId: 9001 + i,
          lookerStoreId: 9001 + i,
          nombre: `${ciudad} (sintética)`,
          ciudad,
          rappiPortal: i % 3 === 0,
        })),
      ]
    : configuradas;
const vacio = parametros.get('vacio') === '1';
let semilla = 7;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
const MENU: [string, string, number][] = [
  ['5IL', 'Iced Latte', 8900],
  ['1AM', 'Americano', 6200],
  ['4TW', 'True White', 7900],
  ['6CM', 'Chai Latte', 8500],
  ['3FOOD3', 'Pain au Chocolat', 5500],
  ['CROJAM', 'Croissant jamón y queso', 9900],
  ['PUMIL', 'Pumpkin Iced Latte', 10600],
  ['MATIL', 'Matcha Iced Latte', 9800],
];
let id = 1;
function diaSintetico(companyId: number, fecha: string, hasta: number, rappi: boolean): PedidoNormal[] {
  const fuerza = 0.6 + ((companyId * 37) % 100) / 100;
  const n = Math.round((55 + 40 * azar()) * fuerza);
  const ps: PedidoNormal[] = [];
  for (let i = 0; i < n; i++) {
    const segundo = Math.round((7 + 14 * Math.pow(azar(), 0.9)) * 3600);
    if (segundo > hasta) continue;
    const r = azar();
    const origen: Origen = rappi && r < 0.18 ? 'rappi' : r > 0.9 ? 'app' : 'mostrador';
    const [codigo, nombre, precio] = MENU[Math.floor(azar() * MENU.length)];
    ps.push({
      id: id++,
      fecha,
      segundo,
      hora: '',
      origen,
      ventaCent: precio,
      netoCent: null,
      descuentoCent: 0,
      metodo: origen === 'rappi' ? 'RAPPI' : 'CARTAO',
      tipo: 'EMV',
      lineas: [{ codigo, nombre, importeCent: precio, descuentoPct: 0, customs: [] }],
      numeroPedidoRappi: null,
      cuadra: true,
    });
  }
  return ps;
}

const ahora = enZona(new Date(), 'America/Mexico_City');
const hoy = ahora.fecha;
const filas: FilaResumen[] = [];
if (!vacio)
  for (const cfg of sucursalesConfiguradas)
    for (let i = 0; i <= 13 * 7; i++) {
      const fecha = sumarDias(hoy, -i);
      const corte = i === 0 ? ahora.segundo : 86400;
      filas.push(
        resumirDia({
          companyId: cfg.companyId,
          fecha,
          leidoEn: new Date(),
          corteSegundo: corte,
          // Una sucursal con lectura incompleta hoy, para ver el aviso.
          completa: !(i === 0 && cfg.companyId === 518),
          pedidos: diaSintetico(cfg.companyId, fecha, corte, !!cfg.rappiPortal),
        }),
      );
    }

/** Lo mismo que sucursales_tablero_hoy. */
function rpcHoy(): RpcHoy {
  return {
    ultimo_corte: vacio ? null : new Date(Date.now() - 4 * 60_000).toISOString(),
    dias: filas
      .filter((f) => f.fecha === hoy || f.fecha === sumarDias(hoy, -7))
      .map((f) => ({ ...f, hoy: f.fecha === hoy })),
  };
}

/** Lo mismo que sucursales_tablero_periodo. */
function rpcPeriodo(desde: string, hasta: string): RpcPeriodo {
  const en = filas.filter((f) => f.fecha >= desde && f.fecha <= hasta);
  const semanas = new Map<string, RpcPeriodo['semanas'][number]>();
  const dias = new Map<string, RpcPeriodo['dias'][number]>();
  const prods = new Map<string, RpcPeriodo['productos'][number]>();
  const sucursalesDe = new Map<string, Set<number>>();
  for (const f of en) {
    const semana = sumarDias(f.fecha, -diaLunes(f.fecha));
    for (const [o, t] of Object.entries(f.origenes) as [
      Origen,
      NonNullable<FilaResumen['origenes'][Origen]>,
    ][]) {
      const k = `${f.company_id}|${semana}|${o}`;
      const s = semanas.get(k) ?? {
        company_id: f.company_id,
        semana,
        origen: o,
        pedidos: 0,
        venta_cent: 0,
        descuento_cent: 0,
        lineas: 0,
        dias: 0,
      };
      s.pedidos += t.pedidos;
      s.venta_cent += t.venta_cent;
      s.lineas += t.lineas;
      s.dias++;
      semanas.set(k, s);
      const d = dias.get(`${f.fecha}|${o}`) ?? { fecha: f.fecha, origen: o, pedidos: 0, venta_cent: 0 };
      d.pedidos += t.pedidos;
      d.venta_cent += t.venta_cent;
      dias.set(`${f.fecha}|${o}`, d);
    }
    for (const [clave, codigo, nombre, por] of f.productos) {
      (sucursalesDe.get(clave) ?? sucursalesDe.set(clave, new Set()).get(clave)!).add(f.company_id);
      for (const [o, [lineas, importe]] of Object.entries(por) as [Origen, [number, number]][]) {
        const p = prods.get(`${clave}|${o}`) ?? {
          clave,
          codigo,
          nombre,
          origen: o,
          lineas: 0,
          importe_cent: 0,
          sucursales: 0,
        };
        p.lineas += lineas;
        p.importe_cent += importe;
        prods.set(`${clave}|${o}`, p);
      }
    }
  }
  return {
    dias_leidos: en.length,
    incompletos: en.filter((f) => !f.completa).length,
    semanas: [...semanas.values()],
    dias: [...dias.values()],
    productos: [...prods.values()].map((p) => ({ ...p, sucursales: sucursalesDe.get(p.clave)!.size })),
  };
}

/** Consumo nacional sintético: 20 insumos de 4 categorías, tres meses, una sucursal incompleta. */
const MESES_CONSUMO = ['2026-10-01', '2026-09-01', '2026-08-01'];
const INSUMOS_CONSUMO: [string, string, string, string, number | null, number][] = [
  ['LECHE ENTERA', 'ml', 'PERECEDEROS', 'le', 1000, 42000],
  ['LECHE DESLACTOSADA', 'ml', 'PERECEDEROS', 'ld', 1000, 15000],
  ['LECHE DE AVENA', 'ml', 'PERECEDEROS', 'la', 946, 9000],
  ['CREMA PARA BATIR', 'ml', 'PERECEDEROS', 'cb', 1000, 3200],
  ['CROISSANT CONGELADO', 'pza', 'PERECEDEROS', 'cc', 24, 520],
  ['CAFÉ HOUSE BLEND', 'gr', 'CAFÉ', 'ch', 1000, 18000],
  ['CAFÉ DESCAFEINADO', 'gr', 'CAFÉ', 'cd', 1000, 2200],
  ['CAFÉ ESPECIAL DEL MES', 'gr', 'CAFÉ', 'ce', 500, 3100],
  ['CAFÉ PARA FILTRADO', 'gr', 'CAFÉ', 'cf', 1000, 4800],
  ['VASO 12 OZ', 'pza', 'DESECHABLES', 'v12', 1000, 3400],
  ['VASO 16 OZ', 'pza', 'DESECHABLES', 'v16', 1000, 5200],
  ['TAPA 12 OZ', 'pza', 'DESECHABLES', 't12', 1000, 3400],
  ['TAPA 16 OZ', 'pza', 'DESECHABLES', 't16', 1000, 5200],
  ['POPOTE', 'pza', 'DESECHABLES', 'po', 500, 4100],
  ['SERVILLETA', 'pza', 'DESECHABLES', 'se', 2000, 9800],
  ['JARABE DE VAINILLA', 'ml', 'POLVOS Y JARABES', 'jv', 750, 3900],
  ['JARABE DE CARAMELO', 'ml', 'POLVOS Y JARABES', 'jc', 750, 2800],
  ['POLVO DE MATCHA', 'gr', 'POLVOS Y JARABES', 'pm', 500, 1900],
  ['POLVO DE CHAI', 'gr', 'POLVOS Y JARABES', 'pc', 1000, 3600],
  ['CACAO EN POLVO', 'gr', 'POLVOS Y JARABES', 'ca', null, 1500],
];
const PESOS_CONSUMO = new Map(sucursalesConfiguradas.map((c, i) => [c.companyId, 0.6 + ((i * 37) % 100) / 100]));
const sumaPesos = [...PESOS_CONSUMO.values()].reduce((a, b) => a + b, 0);
const factorMes = (mes: string) => (mes === '2026-10-01' ? 1 : mes === '2026-09-01' ? 0.92 : 0.85);
const CUOTA_ORIGEN = { mostrador: 0.72, rappi: 0.2, app: 0.08 } as const;
const ORIGENES_CONSUMO = Object.keys(CUOTA_ORIGEN) as (keyof typeof CUOTA_ORIGEN)[];
function rpcConsumo(mes: string): RpcConsumoNacional {
  const anterior = MESES_CONSUMO[MESES_CONSUMO.indexOf(mes) + 1];
  return {
    meses: MESES_CONSUMO,
    sucursales_anterior: anterior ? sucursalesConfiguradas.length : 0,
    sucursales: sucursalesConfiguradas.map((c, i) => ({
      company_id: c.companyId,
      calculado_en: '2026-11-01T06:00:00Z',
      recetas_leidas_en: '2026-11-01T05:00:00Z',
      completa: c.companyId !== 518,
      cobertura: { mostrador: { lineas: 400 + i * 10, incluidas: 372 + i * 10, generico: 4, sinCodigo: 6, sinEnlace: 18 } },
      sin_receta: {
        mostrador: [
          { nombre: 'Sandwich del día', unidades: 14 + i, sinCodigo: false },
          { nombre: 'Galleta especial', unidades: 6, sinCodigo: true },
        ],
      },
    })),
    insumos: INSUMOS_CONSUMO.flatMap(([insumo, unidad, categoria, clave, presentacion, base]) =>
      ORIGENES_CONSUMO.map((origen) => ({
        insumo_id: clave,
        insumo,
        unidad,
        categoria,
        presentacion,
        origen,
        cantidad: Math.round(base * factorMes(mes) * CUOTA_ORIGEN[origen]),
      })),
    ),
    // Todas las sucursales tienen ambos meses: lo actual comparable es lo actual completo.
    actual_comun: anterior
      ? INSUMOS_CONSUMO.flatMap(([, , , clave, , base]) =>
          ORIGENES_CONSUMO.map((origen) => ({
            insumo_id: clave,
            origen,
            cantidad: Math.round(base * factorMes(mes) * CUOTA_ORIGEN[origen]),
          })),
        )
      : [],
    anterior: anterior
      ? INSUMOS_CONSUMO.flatMap(([, , , clave, , base]) =>
          ORIGENES_CONSUMO.map((origen) => ({
            insumo_id: clave,
            origen,
            cantidad: Math.round(base * factorMes(anterior) * CUOTA_ORIGEN[origen] * (clave === 'ce' ? 1.4 : 1)),
          })),
        )
      : [],
  };
}

const fetchNavegador = window.fetch.bind(window);
window.fetch = async (entrada, init) => {
  const url = new URL(String(entrada), window.location.origin);
  if (url.pathname === '/api/sucursales/consumo-nacional/desglose') {
    await new Promise((r) => setTimeout(r, 150));
    const insumoId = url.searchParams.get('insumo');
    const mes = `${url.searchParams.get('mes')}-01`;
    const filas = rpcConsumo(mes).insumos.filter((i) => i.insumo_id === insumoId);
    return Response.json({
      mes,
      filas: filas.flatMap((i) =>
        sucursalesConfiguradas.map((c) => ({
          companyId: c.companyId,
          insumoId: i.insumo_id,
          origen: i.origen,
          cantidad: Math.round((Number(i.cantidad) * PESOS_CONSUMO.get(c.companyId)!) / sumaPesos),
        })),
      ),
    });
  }
  if (url.pathname === '/api/sucursales/consumo-nacional') {
    await new Promise((r) => setTimeout(r, 250));
    const generadoEn = new Date().toISOString();
    if (parametros.get('consumo-vacio') === '1') {
      const vacioRpc: RpcConsumoNacional = { meses: [], sucursales: [], insumos: [], anterior: [], actual_comun: [], sucursales_anterior: 0 };
      return Response.json(armarConsumoNacional(vacioRpc, null, sucursalesConfiguradas, generadoEn));
    }
    const pedido = url.searchParams.get('mes');
    const mes = pedido ? `${pedido}-01` : MESES_CONSUMO[0];
    return Response.json(armarConsumoNacional(rpcConsumo(mes), mes, sucursalesConfiguradas, generadoEn));
  }
  if (url.pathname !== '/api/sucursales/tablero') return fetchNavegador(entrada, init);
  await new Promise((r) => setTimeout(r, 250));
  const semanas = Number(url.searchParams.get('semanas') ?? 8);
  const lunes = sumarDias(hoy, -diaLunes(hoy));
  const hasta = sumarDias(lunes, -1);
  const desde = sumarDias(lunes, -7 * semanas);
  return Response.json({
    generadoEn: new Date().toISOString(),
    semanas,
    hoy: armarHoy(rpcHoy(), sucursalesConfiguradas),
    periodo: armarPeriodo(rpcPeriodo(desde, hasta), desde, hasta, sucursalesConfiguradas),
  });
};

export function VistaTableroMexico() {
  return (
    <Marco
      perfil={{ nombre: 'Usuario Prueba', rol: 'admin' }}
      seccion="sucursales"
      visibles={['costeo', 'crm', 'sucursales']}
    >
      <div className="vitrina space-y-7">
        <p className="aviso">
          PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth, sin token y sin conexión a la API
        </p>
        <Encabezado
          area="Sucursales"
          titulo="Tablero de México"
          descripcion={`La venta (se actualiza cada 10 minutos) y el consumo por mes de las ${sucursalesConfiguradas.length} sucursales.`}
        />
        <VistasMexico vistaInicial={parametros.get('vista') === 'consumo' ? 'consumo' : 'ventas'} />
      </div>
    </Marco>
  );
}
