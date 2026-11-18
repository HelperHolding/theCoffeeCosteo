import '../../../components/portal/vitrina.css';
import { Suspense } from 'react';
import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { TableroMexico } from '../../../components/bi/tablero-mexico';
import type { RespuestaTablero, RespuestaTendencias, RpcTablero } from '../../../lib/bi/tipos';

/**
 * Tablero BI «The Coffee México» con DATOS SINTÉTICOS (?bi[&vacio=1]): responde /api/bi/tablero y /api/bi/tendencias
 * en el navegador con cifras inventadas, con la misma forma que las RPC. Sin red, sin token y sin Auth.
 */
const parametros = new URLSearchParams(window.location.search);
const vacio = parametros.has('vacio');

// Generador determinista: mismas cifras en cada carga.
let semilla = 7;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;

const TIENDAS = [
  ['Ventura', 'Sucursales Propias', 'Propias'],
  ['Rubén Darío', 'Sucursales Propias', 'Propias'],
  ['Legacy', 'Sucursales Propias', 'Propias'],
  ['Cd. Juárez', 'Franquicia', 'Cd. Juárez'],
  ['Bonampak', 'Franquicia', 'Quintana Roo'],
  ['Tijuana', 'Franquicia', 'Baja California'],
  ['Polanco', 'Franquicia', 'Polanco'],
  ['Plaza Carso', 'Franquicia', 'Polanco'],
  ['Reforma', 'Franquicia', 'CDMX Centro'],
  ['Colima', 'Franquicia', 'Colima'],
] as const;
const tiendas = TIENDAS.map(([nombre, tipo, franquiciatario], i) => ({
  company_id: 900 + i,
  store_id: 300 + i,
  nombre: `The Coffee ${nombre}`,
  franquiciatario,
  tipo,
}));

const hoy = '2026-11-18';
const fechas = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 5 + i));
  return d.toISOString().slice(0, 10);
});
const peso = (dow: number) => [1.25, 0.86, 0.9, 0.93, 1.0, 1.12, 1.3][dow];

function tablero(): RpcTablero {
  const porFecha = fechas.map((f) => {
    const dow = new Date(`${f}T12:00:00Z`).getUTCDay();
    const tickets = Math.round(4300 * peso(dow) * (0.92 + azar() * 0.16));
    return { fecha: f, tickets, venta_cent: Math.round(tickets * (13800 + azar() * 900)) };
  });
  const venta = porFecha.reduce((s, f) => s + f.venta_cent, 0);
  const tickets = porFecha.reduce((s, f) => s + f.tickets, 0);
  const porDia = Array.from({ length: 7 }, (_, dow) => {
    const fs = porFecha.filter((f) => new Date(`${f.fecha}T12:00:00Z`).getUTCDay() === dow);
    return {
      dow,
      venta_cent: fs.reduce((s, f) => s + f.venta_cent, 0),
      tickets: fs.reduce((s, f) => s + f.tickets, 0),
    };
  });
  const curvaHora = [
    0, 0, 0, 0, 0, 0, 0.2, 1.8, 3.4, 3.1, 2.4, 2.1, 2.3, 2.5, 2.2, 2.0, 2.1, 2.4, 2.8, 3.0, 2.3, 1.2, 0.4, 0,
  ];
  const sumaHora = curvaHora.reduce((a, b) => a + b, 0);
  const porHora = curvaHora
    .map((p, hora) => ({
      hora,
      venta_cent: Math.round((venta * p) / sumaHora),
      tickets: Math.round((tickets * p) / sumaHora),
    }))
    .filter((h) => h.tickets > 0);
  const pagos: [string, number][] = [
    ['TABLET - CARD', 0.66],
    ['CONTINGENCY - MONEY', 0.13],
    ['RAPPI', 0.1],
    ['APP - CARD', 0.05],
    ['RAPPI TURBO', 0.03],
    ['CONTINGENCY - CARD', 0.02],
    ['APP - WALLET', 0.01],
  ];
  const repartoTienda = tiendas.map(() => 0.5 + azar());
  const sumaTiendas = repartoTienda.reduce((a, b) => a + b, 0);
  const masters: [string, number][] = [
    ['Bebidas Calientes', 0.3],
    ['Bebida Fría', 0.29],
    ['Seasonal', 0.11],
    ['Panadería Dulce', 0.09],
    ['Sandwiches', 0.05],
    ['Fraps', 0.04],
    ['Combo con Sandwich', 0.03],
    ['Gelato Frappé', 0.025],
    ['Merch', 0.021],
    ['Panadería Salada', 0.011],
    ['Fresh Soda', 0.01],
    ['Bebidas Cerradas', 0.009],
    ['Desayunos', 0.004],
    ['Sin clasificar', 0.002],
  ];
  const productos = [
    ['TRU', 'True White'],
    ['ICE', 'Iced Latte'],
    ['PSL', 'Pumpkin Spice Latte'],
    ['AME', 'Americano'],
    ['CAP', 'Cappuccino'],
    ['MAT', 'Matcha Iced Latte'],
    ['CRO', 'Croissant Traditional'],
    ['GEL', 'Gelato Frappé Coffee'],
    ['MIS', 'Iced Latte + Ham & Cheese Sandwich'],
    ['COO', 'Cookie Traditional'],
    ['FRE', 'Fresh Soda Maracuyá'],
    ['BAN', 'Banana Cake'],
  ];
  return {
    cargas: {
      esperados: tiendas.length * fechas.length,
      con_carga: tiendas.length * fechas.length - 3,
      incompletos: 1,
    },
    kpis: {
      venta_cent: venta,
      venta_bruta_cent: Math.round(venta * 1.004),
      tickets,
      lineas: Math.round(tickets * 1.51),
      unidades: Math.round(tickets * 1.64),
    },
    por_grupo: [
      ['Bebida', 0.72],
      ['Comida', 0.19],
      ['Combo', 0.05],
      ['Merch', 0.03],
      ['Otros', 0.01],
    ].map(([grupo, p]) => ({ grupo: grupo as string, venta_cent: Math.round(venta * (p as number)) })),
    por_cafe: [
      { cafe: 'Sí', venta_cent: Math.round(venta * 0.62) },
      { cafe: 'No', venta_cent: Math.round(venta * 0.38) },
    ],
    por_master: masters.map(([categoria, p]) => ({ categoria, venta_cent: Math.round(venta * p) })),
    por_fecha: porFecha,
    por_dia: porDia,
    por_hora: porHora,
    por_pago: pagos.map(([etiqueta, p]) => ({
      etiqueta,
      venta_cent: Math.round(venta * p),
      tickets: Math.round(tickets * p),
    })),
    por_pago_tienda: tiendas.flatMap((t, i) =>
      pagos.map(([etiqueta, p]) => ({
        etiqueta,
        company_id: t.company_id,
        venta_cent: Math.round(((venta * repartoTienda[i]) / sumaTiendas) * p * (0.6 + azar() * 0.8)),
      })),
    ),
    por_tienda_dia: tiendas.flatMap((t, i) =>
      porDia.map((d) => ({
        company_id: t.company_id,
        dow: d.dow,
        venta_cent: Math.round((d.venta_cent * repartoTienda[i]) / sumaTiendas),
        tickets: Math.round((d.tickets * repartoTienda[i]) / sumaTiendas),
      })),
    ),
    promociones: tiendas.flatMap((t, i) => [
      {
        company_id: t.company_id,
        promocion: 'Promoción alimentos y bebidas',
        unidades: Math.round(40 + azar() * 160),
        venta_cent: Math.round(((venta * repartoTienda[i]) / sumaTiendas) * (0.015 + azar() * 0.06)),
      },
      {
        company_id: t.company_id,
        promocion: 'Promoción café',
        unidades: Math.round(azar() * 6),
        venta_cent: Math.round(((venta * repartoTienda[i]) / sumaTiendas) * azar() * 0.012),
      },
      {
        company_id: t.company_id,
        promocion: 'Producto regular',
        unidades: Math.round(5000 + azar() * 4000),
        venta_cent: Math.round(((venta * repartoTienda[i]) / sumaTiendas) * 0.93),
      },
    ]),
    ranking: ['2026-11-01', '2026-10-01'].flatMap((mes, k) =>
      productos.map(([codigo, nombre], i) => {
        const u = Math.round((9000 / (i + 1.5)) * (k ? 1.9 : 1) * (0.9 + azar() * 0.2));
        return { codigo, nombre, mes, unidades: u, venta_cent: u * (8500 + i * 500), lineas: u };
      }),
    ),
    fuentes: [
      { fuente: 'pos', canal: 'mostrador', venta_cent: Math.round(venta * 0.85) },
      { fuente: 'pos', canal: 'app', venta_cent: Math.round(venta * 0.06) },
      { fuente: 'pos', canal: 'rappi', venta_cent: Math.round(venta * 0.09) },
    ],
  };
}

function tendencias(): RespuestaTendencias {
  const base = [5.2, 6.1, 7.0, 7.2, 7.4, 7.6, 8.4, 9.1, 9.0, 9.6, 9.8, 10.4];
  const por_mes: { anio: number; mes: number; venta_cent: number }[] = [];
  const por_semana: { anio: number; semana: number; venta_cent: number }[] = [];
  for (const [anio, factor, hasta] of [
    [2024, 0.18, 12],
    [2025, 0.62, 12],
    [2026, 1.55, 11],
  ] as const) {
    for (let mes = 1; mes <= hasta; mes++)
      por_mes.push({
        anio,
        mes,
        venta_cent: Math.round(base[mes - 1] * factor * 1e9 * (0.95 + azar() * 0.1)),
      });
    for (let semana = 1; semana <= (anio === 2026 ? 46 : 52); semana++)
      por_semana.push({
        anio,
        semana,
        venta_cent: Math.round(
          base[Math.min(11, Math.floor((semana - 1) / 4.4))] * factor * 2.3e8 * (0.9 + azar() * 0.2),
        ),
      });
  }
  return { hoy, tendencias: vacio ? null : { por_mes, por_semana } };
}

const respuestaTablero = (): RespuestaTablero => ({
  periodo: { desde: fechas[0], hasta: fechas.at(-1)! },
  hoy,
  tablero: vacio ? null : tablero(),
  opciones: {
    tiendas,
    franquiciatarios: [...new Set(tiendas.map((t) => t.franquiciatario))],
    tipos: ['Franquicia', 'Sucursales Propias'],
    categorias: ['Bebidas Calientes', 'Bebida Fría', 'Seasonal'],
    grupos: ['Bebida', 'Comida', 'Combo', 'Merch'],
    productos: ['True White', 'Iced Latte'],
    pagos: ['TABLET - CARD', 'CONTINGENCY - MONEY', 'RAPPI'],
    semanas: ['W46 2026', 'W45 2026'],
    ultimo_corte: '2026-11-18T17:40:00Z',
    tiendas_sin_rappi: 2,
  },
});

const fetchReal = window.fetch.bind(window);
window.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entrada);
  const json = (cuerpo: unknown) =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.includes('/api/bi/tablero')) return json(respuestaTablero());
  if (url.includes('/api/bi/tendencias')) return json(tendencias());
  return fetchReal(entrada, init);
}) as typeof fetch;

export function VistaBi() {
  return (
    <Marco
      perfil={{ nombre: 'Carlos Valencia', rol: 'admin' }}
      seccion="bi"
      visibles={['costeo', 'sucursales', 'bi']}
    >
      <div className="vitrina space-y-7">
        <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
        <Encabezado area="BI" titulo="The Coffee México" />
        <Suspense fallback={null}>
          <TableroMexico />
        </Suspense>
      </div>
    </Marco>
  );
}
