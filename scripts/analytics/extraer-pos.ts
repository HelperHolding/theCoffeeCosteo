import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { leerPedidos } from '../../lib/sucursales/proveedor';
import { normalizar } from '../../lib/sucursales/normalizar';
import {
  agregarPos,
  CRITERIO_FECHA_POS,
  estadoDia,
  fechasEntre,
  VERSION_POS,
  type LecturaDiaria,
} from '../../lib/analytics/contrato';
import { leerEnvLocal } from '../zoho/cliente';
import type { TiendaAnalytics } from './persistencia';
import { SALIDA_PREDETERMINADA } from './salida';

/**
 * Extrae del POS (solo GET) los agregados diarios de las tiendas incluidas y los deja en un archivo de
 * lecturas listo para `aplicar.ts`. No escribe en ninguna base.
 * - Solo fechas transcurridas; el día abierto sale como provisional; las futuras se listan, no se leen.
 * - Una tienda con lectura incompleta, registros inválidos o pedidos fuera de ventana NO produce lecturas:
 *   queda en "fallidas" (sin lectura), nunca como cero.
 * - createdAt se interpreta como hora local etiquetada con Z (docs/sucursales/03); no se convierte de UTC.
 *
 * Uso: npx tsx --conditions=react-server scripts/analytics/extraer-pos.ts --tiendas <tiendas.json>
 *        --desde 2026-10-26 --hasta 2026-11-01 [--salida <carpeta fuera del repo>]
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  const v = i > 0 ? process.argv[i + 1] : d;
  if (!v) throw new Error(`Falta --${n}`);
  return v;
};
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

const tiendas: TiendaAnalytics[] = JSON.parse(readFileSync(arg('tiendas'), 'utf8')).incluidas;
const ahora = new Date();
const todas = fechasEntre(arg('desde'), arg('hasta'));
const transcurridas = todas.filter((f) => estadoDia(f, ahora) !== 'futuro');
const futuras = todas.filter((f) => estadoDia(f, ahora) === 'futuro');
if (!transcurridas.length) throw new Error('Ninguna fecha transcurrida en la ventana');
const desde = transcurridas[0];
const hasta = transcurridas.at(-1)!;
const cargaId = randomUUID();

const lecturas: LecturaDiaria[] = [];
const fallidas: { company_id: number; errores: string[] }[] = [];
const descuadres: { company_id: number; pedidos: number }[] = [];
let paginas = 0;

async function procesar(t: TiendaAnalytics) {
  const l = await leerPedidos(t.company_id, desde, hasta);
  paginas += l.paginas;
  if (!l.completo) {
    fallidas.push({ company_id: t.company_id, errores: l.errores.map((e) => e.codigo) });
    return;
  }
  const n = normalizar(
    l.registros,
    { companyId: t.company_id, modoTiempo: 'local-etiquetada-z', zona: 'America/Mexico_City' },
    { desde, hasta },
  );
  if (n.invalidos || n.fueraDeVentana) {
    fallidas.push({
      company_id: t.company_id,
      errores: [`invalidos=${n.invalidos}`, `fuera_de_ventana=${n.fueraDeVentana}`],
    });
    return;
  }
  const sinCuadre = n.pedidos.filter((p) => !p.cuadra).length;
  if (sinCuadre) descuadres.push({ company_id: t.company_id, pedidos: sinCuadre });
  const leidoEn = new Date(l.leidoEn).toISOString();
  for (const [fecha, canales] of agregarPos(n.pedidos, transcurridas))
    lecturas.push({
      fuente: 'pos',
      company_id: t.company_id,
      fecha,
      leido_en: leidoEn,
      provisional: estadoDia(fecha, new Date(l.leidoEn)) !== 'cerrado',
      completa: true,
      version_calculo: VERSION_POS,
      criterio_fecha: CRITERIO_FECHA_POS,
      origen: 'api.thecoffee.jp GET /order/company/{id}',
      carga_id: cargaId,
      canales,
    });
}

// Cuatro tiendas a la vez (el proveedor ya limita la concurrencia global a 4).
const cola = [...tiendas];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let t = cola.shift(); t; t = cola.shift()) await procesar(t);
  }),
);

lecturas.sort((a, b) => a.company_id - b.company_id || a.fecha.localeCompare(b.fecha));
const totales: Record<string, Record<string, { venta_cent: number; tickets: number; unidades: number }>> = {};
for (const l of lecturas)
  for (const c of l.canales) {
    const d = ((totales[l.fecha] ??= {})[c.canal] ??= { venta_cent: 0, tickets: 0, unidades: 0 });
    d.venta_cent += c.venta_cent;
    d.tickets += c.tickets;
    d.unidades += c.unidades;
  }
const informe = {
  fuente: 'pos',
  carga_id: cargaId,
  extraido_en: ahora.toISOString(),
  ventana: { pedida: [todas[0], todas.at(-1)], leida: [desde, hasta], futuras },
  provisionales: [...new Set(lecturas.filter((l) => l.provisional).map((l) => l.fecha))],
  cobertura: {
    tiendas_esperadas: tiendas.length,
    tiendas_leidas: new Set(lecturas.map((l) => l.company_id)).size,
    lecturas_esperadas: tiendas.length * transcurridas.length,
    lecturas_obtenidas: lecturas.length,
    fallidas,
  },
  descuadres,
  paginas_pos: paginas,
  totales_por_fecha_y_canal: totales,
};
const salida = arg('salida', SALIDA_PREDETERMINADA);
mkdirSync(salida, { recursive: true });
const archivo = join(salida, `lecturas-pos-${ahora.toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(archivo, JSON.stringify({ informe, lecturas }, null, 1) + '\n');
console.log(JSON.stringify(informe.cobertura), 'páginas', paginas, 'descuadres', descuadres.length);
for (const [f, c] of Object.entries(totales))
  console.log(
    f,
    Object.entries(c)
      .map(([k, v]) => `${k}:${v.tickets}t/${(v.venta_cent / 100).toFixed(2)}/${v.unidades}u`)
      .join(' '),
  );
console.log(`Lecturas → ${archivo}`);
