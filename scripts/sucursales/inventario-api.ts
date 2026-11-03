import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { dependenciasReales, leerCatalogo, leerPedidos } from '../../lib/sucursales/proveedor';

/**
 * Inventario de las sucursales de la API The Coffee (solo GET y SELECT), para darlas de alta por lotes:
 * - cada sucursal de /company/list/all, si ya está configurada en el portal;
 * - su tienda del CRM por número Jestor (= lookerStoreId): nombre, ciudad, dirección, apertura, archivada;
 * - actividad de los últimos `--dias` días cerrados: pedidos, venta bruta, pedidos con pago RAPPI y último pedido;
 * - tiendas de Rappi del portal ya dadas de alta y usuarios con acceso.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/inventario-api.ts --hasta 2026-11-02 --dias 7 [--salida x.json]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const hasta = opcion('--hasta')!;
const dias = Number(opcion('--dias') ?? 7);
const salida = opcion('--salida');
if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '')) throw new Error('Falta --hasta AAAA-MM-DD');
const d = new Date(`${hasta}T12:00:00Z`);
d.setUTCDate(d.getUTCDate() - (dias - 1));
const desde = d.toISOString().slice(0, 10);

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = new pg.Client({ connectionString: env.get('DATABASE_URL') });
await db.connect();
await db.query('begin transaction read only');
const crm = (
  await db.query<{
    jestor: number;
    nombre: string;
    ciudad: string | null;
    direccion: string | null;
    apertura: string | null;
    archivada: boolean;
  }>(
    `select numero_tienda_jestor jestor, nombre, ciudad, direccion, fecha_apertura::text apertura,
       archivado_en is not null archivada
     from crm_tiendas where numero_tienda_jestor is not null`,
  )
).rows;
const rappi = (
  await db.query<{ company_id: number; n: number }>(
    `select company_id, count(*)::int n from rappi_tiendas where activa group by 1`,
  )
).rows;
const accesos = (
  await db.query<{ company_id: number; n: number }>(
    `select company_id, count(*)::int n from perfil_sucursales group by 1`,
  )
).rows;
await db.query('rollback');
await db.end();

const catalogo = await leerCatalogo(dependenciasReales);
if (!catalogo.ok) throw new Error(`No se pudo leer /company/list/all: ${catalogo.error.codigo}`);
const filas = [];
const lista = catalogo.sucursales;
for (let i = 0; i < lista.length; i += 4) {
  filas.push(
    ...(await Promise.all(
      lista.slice(i, i + 4).map(async (s) => {
        const r = await leerPedidos(s.id, desde, hasta, dependenciasReales);
        const ps = r.registros;
        const ultimo = ps
          .map((p) => String(p.createdAt ?? ''))
          .sort()
          .at(-1);
        const enCrm = crm.filter((c) => c.jestor === s.lookerStoreId);
        const cfg = sucursalesConfiguradas.find((c) => c.companyId === s.id);
        return {
          companyId: s.id,
          api: s.name,
          lookerStoreId: s.lookerStoreId,
          configurada: cfg ? `${cfg.nombre} (${cfg.ciudad})` : null,
          crm: enCrm.map((c) => ({
            nombre: c.nombre,
            ciudad: c.ciudad,
            direccion: c.direccion,
            apertura: c.apertura,
            archivada: c.archivada,
          })),
          lectura: r.errores.length ? r.errores.map((e) => e.codigo).join(',') : 'ok',
          pedidos: ps.length,
          ventaBruta: Math.round(ps.reduce((a, p) => a + Number(p.grossAmount ?? 0), 0)),
          pedidosRappi: ps.filter((p) => p.paymentMethod === 'RAPPI').length,
          ultimoPedido: ultimo ?? null,
          tiendasRappi: rappi.find((x) => x.company_id === s.id)?.n ?? 0,
          usuarios: accesos.find((x) => x.company_id === s.id)?.n ?? 0,
        };
      }),
    )),
  );
  console.error(`${Math.min(i + 4, lista.length)} de ${lista.length}`);
}
const informe = { desde, hasta, sucursales: filas };
if (salida) writeFileSync(salida, JSON.stringify(informe, null, 1));
else console.log(JSON.stringify(informe, null, 1));
