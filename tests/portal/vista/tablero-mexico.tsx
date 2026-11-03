import '../../../components/sucursales/tablero-mexico.css';
import '../../../app/(sucursales)/sucursales/vitrina.css';
import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { TableroMexicoVista } from '../../../components/sucursales/tablero-mexico';
import { sucursalesConfiguradas as configuradas, type ConfigSucursal } from '../../../lib/sucursales/config';
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

const fetchNavegador = window.fetch.bind(window);
window.fetch = async (entrada, init) => {
  const url = new URL(String(entrada), window.location.origin);
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
          descripcion={`La venta de las ${sucursalesConfiguradas.length} sucursales, sumada. Se actualiza cada 10 minutos.`}
        />
        <TableroMexicoVista />
      </div>
    </Marco>
  );
}
