// Verificación de SOLO LECTURA del P&L (F5) con datos reales: arma el mes de una sucursal con las mismas funciones de
// la pantalla, usando la llave de servicio en lugar de la sesión. Uso:
//   npx tsx --conditions=react-server scripts/franquiciatarios/pyl-essentia.ts [AAAA-MM] [companyId]
import { leerEnvLocal } from '../zoho/cliente';

const env = await leerEnvLocal();
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;
const { createClient } = await import('@supabase/supabase-js');
const { configDe } = await import('../../lib/sucursales/config');
const { leerPyl } = await import('../../lib/franquiciatarios/pyl-servidor');
const mes = process.argv[2] ?? new Date().toISOString().slice(0, 7);
const cfg = configDe(Number(process.argv[3] ?? 514))!;
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  {
    auth: { persistSession: false },
  },
);
// Antes de aplicar la migración 88 la tabla de fijos no existe: con --zoho se simula con los montos leídos de Zoho
// («Gastos Sucursales» de Essentia, 2026). Nada se escribe.
const ZOHO_ESSENTIA = {
  renta: 38381,
  nomina: 53000,
  energia: 5300,
  servicios: 2000,
  pos: 2000,
  suscripciones: 550,
};
const simular = process.argv.includes('--zoho');
const dbVer = simular
  ? new Proxy(db, {
      get(t, k) {
        if (k !== 'from') return Reflect.get(t, k);
        return (tabla: string) => {
          if (tabla !== 'franq_gastos_fijos') return t.from(tabla);
          const datos = Object.entries(ZOHO_ESSENTIA).map(([concepto, monto], i) => ({
            id: i + 1,
            concepto,
            monto,
            origen: 'zoho',
            nombre: 'Importado de Zoho',
            registrado_en: '2026-11-20',
          }));
          const q = {
            select: () => q,
            eq: () => q,
            then: (ok: (x: unknown) => void) => ok({ data: datos, error: null }),
          };
          return q;
        };
      },
    })
  : db;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = await leerPyl(dbVer as any, cfg, mes);
console.log(
  `${cfg.nombre} · ${p.mes} (${p.desde} a ${p.hasta}) · avance ${Math.round(p.pyl.avanceMes * 100)} %`,
);
for (const l of p.pyl.lineas)
  console.log(
    `  ${l.nombre.padEnd(34)} ${l.real.toLocaleString('es-MX').padStart(12)}  proy ${l.proyeccion.toLocaleString('es-MX').padStart(12)}`,
  );
console.log(
  '  P.E. (venta con IVA):',
  p.pyl.puntoEquilibrio,
  '· margen contribución:',
  p.pyl.margenContribucion?.toFixed(3),
);
console.log('  Venta día/semana/mes:', p.venta, '· metas:', p.metas);
console.log('  Avisos:', p.avisos);
