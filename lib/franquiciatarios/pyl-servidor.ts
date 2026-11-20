import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { ConfigSucursal } from '../sucursales/config';
import { conRappi, hoyLocal, leerDias } from '../sucursales/datos';
import { clienteServicio } from '../sucursales/corte-servidor';
import { resumen } from '../sucursales/metricas';
import { sumarDias } from './dia';
import { fuentesFranq } from './ventas';
import { leerPedidosSucursal } from './pedidos-servidor';
import { armarPedidos } from './pedidos';
import { gastosVigentes } from './caja';
import { armarPyl, fijosVigentes, lunesDe, metasDe, type FijoVigente, type Metas, type Pyl } from './pyl';
import type { FranqGasto } from './tipos';

type Db = Awaited<ReturnType<typeof servidor>>;

export interface PylMes {
  mes: string; // AAAA-MM
  desde: string;
  hasta: string;
  pyl: Pyl;
  fijos: FijoVigente[];
  metas: Metas;
  venta: { dia: number; semana: number; mes: number };
  hoy: string;
  /** Avisos de fuentes incompletas (POS parcial, sin compras, sin metas…). */
  avisos: string[];
}

const diasDelMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

/**
 * P&L del mes de una sucursal para la gerencia (la página ya autorizó con contextoGestor). Ventas con las mismas
 * funciones que Sucursales; compras con el candado de apertura; caja chica y fijos por RLS de gerencia; metas,
 * parámetros (IVA, comisión Rappi) con la llave de servicio solo para esta sucursal.
 */
export async function leerPyl(db: Db, cfg: ConfigSucursal, mes: string): Promise<PylMes> {
  const hoy = hoyLocal(cfg).fecha;
  const desde = `${mes}-01`;
  const finMes = sumarDias(`${mes}-01`, diasDelMes(mes) - 1);
  const hasta = finMes < hoy ? finMes : hoy;
  const enCurso = hoy >= desde && hoy <= finMes;
  const lunes = lunesDe(enCurso ? hoy : finMes);
  const leerDesde = lunes < desde ? lunes : desde;
  const avisos: string[] = [];
  const servicio = clienteServicio();

  const [fuentes, compras, gastos, fijos, params, metas] = await Promise.all([
    fuentesFranq(cfg),
    leerPedidosSucursal(cfg, new Date(), {
      desde: `${desde}T06:00:00Z`,
      hasta: `${sumarDias(finMes, 1)}T06:00:00Z`,
    }),
    db.from('franq_gastos').select('*').eq('company_id', cfg.companyId).gte('dia', desde).lte('dia', finMes),
    db.from('franq_gastos_fijos').select('*').eq('company_id', cfg.companyId).eq('mes', desde),
    servicio
      ? Promise.all([
          servicio.from('parametros').select('iva').limit(1).maybeSingle(),
          servicio.from('canales').select('nombre,comision_pct').eq('nombre', 'Rappi').maybeSingle(),
        ])
      : Promise.resolve(null),
    servicio
      ? Promise.all([
          servicio
            .from('bi_metas')
            .select('venta_cent')
            .eq('company_id', cfg.companyId)
            .eq('mes', desde)
            .maybeSingle(),
          servicio
            .from('bi_metas_diarias')
            .select('fecha,venta_cent,tickets')
            .eq('company_id', cfg.companyId)
            .gte('fecha', leerDesde)
            .lte('fecha', sumarDias(lunes, 6)),
        ])
      : Promise.resolve(null),
  ]);
  if (gastos.error || fijos.error) throw new Error('No se pudieron leer los gastos. Intenta de nuevo.');

  const lectura = await conRappi(await leerDias(cfg, leerDesde, hasta), fuentes.rappi);
  if (lectura.estado !== 'completa') avisos.push('Las ventas del POS de algún día llegaron incompletas.');
  const delMes = lectura.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const r = resumen(delMes);
  const ventaRappiCent = delMes.filter((p) => p.origen === 'rappi').reduce((s, p) => s + p.ventaCent, 0);
  // Comisión de cobro del POS (tarjeta y app): venta − neto de la API. El saldo de la app ya no es venta (su venta es el
  // neto), así que no deja diferencia ni se confunde con comisión. Rappi del portal no trae neto: va por su %.
  const comisionPosCent = delMes
    .filter((p) => p.origen !== 'rappi' && p.netoCent !== null)
    .reduce((s, p) => s + Math.max(0, p.ventaCent - p.netoCent!), 0);

  let comprasMonto = 0;
  if (compras.ok)
    comprasMonto = armarPedidos(compras.filas, [], { conMontos: true })
      .filter((p) => !p.estado.startsWith('cancela'))
      .reduce((s, p) => s + (p.total ?? 0), 0);
  else avisos.push(`Compras: ${compras.error}`);

  const iva = Number(params?.[0].data?.iva ?? 0.16);
  const comisionRappi = Number(params?.[1].data?.comision_pct ?? 0.18);
  const vigentesFijos = fijosVigentes(fijos.data ?? []);
  if (vigentesFijos.length === 0)
    avisos.push('Sin gastos fijos del mes: cárgalos de Zoho o captúralos abajo.');

  const metaMes = metas?.[0].data ? Number(metas[0].data.venta_cent) : null;
  const diarias = (metas?.[1].data ?? []).map((d) => ({
    ...d,
    venta_cent: Number(d.venta_cent),
    tickets: Number(d.tickets),
  }));
  if (metaMes === null) avisos.push('Sin meta de venta cargada para este mes (Zoho → BI).');
  const diaRef = enCurso ? hoy : finMes;

  const ventaEn = (a: string, b: string) =>
    lectura.pedidos.filter((p) => p.fecha >= a && p.fecha <= b).reduce((s, p) => s + p.ventaCent, 0) / 100;

  return {
    mes,
    desde,
    hasta,
    hoy,
    fijos: vigentesFijos,
    pyl: armarPyl({
      diasMes: diasDelMes(mes),
      diasTranscurridos: Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1),
      ventaCent: r.ventaCent,
      descuentoCent: r.descuentoCent,
      ventaRappiCent,
      comisionPosCent,
      iva,
      comisionRappi,
      compras: comprasMonto,
      cajaChica: gastosVigentes((gastos.data ?? []) as FranqGasto[]).reduce(
        (s, g) => s + Number(g.monto ?? 0),
        0,
      ),
      fijos: vigentesFijos,
    }),
    metas: metasDe(diaRef, diarias, metaMes),
    venta: { dia: ventaEn(diaRef, diaRef), semana: ventaEn(lunes, diaRef), mes: ventaEn(desde, hasta) },
    avisos,
  };
}
