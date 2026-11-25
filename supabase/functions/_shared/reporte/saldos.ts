// supabase/functions/_shared/reporte/saldos.ts
import { type ConfigReporte, en, esPropia, norm, sucursalPropia, titulo, tipoEnvio } from "./config.ts";
import { dif } from "./fechas.ts";
import type { Factura } from "./tipos.ts";

export type SaldoSucursal = { sucursal: string; dentro: number; fueraAnio: number; anteriores: number; facturas: number };
export type SaldosSucursales = { anio: number; total: number; dentro: number; fueraAnio: number; anteriores: number; facturas: number; filas: SaldoSucursal[] };
export type SaldoCliente = { cliente: string; nota: string; masAntigua: string; dias: number; saldo: number; llenado: number };
export type SaldosExternos = {
  filas: SaldoCliente[]; subtotal: number; creditos: SaldoCliente[]; subtotalCreditos: number; total: number;
  interna: SaldoCliente[]; totalInterna: number; excluidos: { cliente: string; saldo: number }[];
};
export type Foto = { externos: number; creditos: number; interna: number };

const pendiente = (f: Factura) => f.saldo > 0 && f.estado !== "void" && f.estado !== "draft";
const suma = (xs: { saldo: number }[]) => xs.reduce((a, x) => a + x.saldo, 0);

export function calcularSaldosSucursales(pendientes: Factura[], cfg: ConfigReporte, corte: string): SaldosSucursales {
  const anio = Number(corte.slice(0, 4));
  const m = new Map<string, SaldoSucursal>();
  for (const f of pendientes) {
    if (!pendiente(f) || !esPropia(f.cliente)) continue;
    const suc = sucursalPropia(f);
    if (en(cfg.excluir_saldos_sucursales, suc) || cfg.excluir_saldos_sucursales.some((x) => norm(f.cliente).endsWith(norm(x)))) continue;
    const r = m.get(norm(suc)) ?? { sucursal: suc, dentro: 0, fueraAnio: 0, anteriores: 0, facturas: 0 };
    const vence = f.vence || f.fecha;
    if (vence >= corte) r.dentro += f.saldo;
    else if (Number(f.fecha.slice(0, 4)) >= anio) r.fueraAnio += f.saldo;
    else r.anteriores += f.saldo;
    r.facturas++;
    m.set(norm(suc), r);
  }
  const filas = [...m.values()].sort((a, b) => b.dentro + b.fueraAnio + b.anteriores - (a.dentro + a.fueraAnio + a.anteriores));
  const dentro = filas.reduce((a, r) => a + r.dentro, 0), fueraAnio = filas.reduce((a, r) => a + r.fueraAnio, 0);
  const anteriores = filas.reduce((a, r) => a + r.anteriores, 0);
  return { anio, total: dentro + fueraAnio + anteriores, dentro, fueraAnio, anteriores, facturas: filas.reduce((a, r) => a + r.facturas, 0), filas };
}

function agrupar(fs: { f: Factura; clave: string; nota: string }[], corte: string): SaldoCliente[] {
  const m = new Map<string, SaldoCliente>();
  for (const { f, clave, nota } of fs) {
    const r = m.get(clave) ?? { cliente: titulo(f.cliente), nota, masAntigua: f.fecha, dias: 0, saldo: 0, llenado: 0 };
    if (f.fecha < r.masAntigua) r.masAntigua = f.fecha;
    r.saldo += f.saldo;
    if (tipoEnvio(f.tipoEnvio) === "Llenado de canal") r.llenado += f.saldo;
    m.set(clave, r);
  }
  return [...m.values()].map((r) => ({ ...r, dias: dif(r.masAntigua, corte) })).sort((a, b) => b.saldo - a.saldo);
}

export function calcularSaldosExternos(pendientes: Factura[], cfg: ConfigReporte, corte: string): SaldosExternos {
  const normales: { f: Factura; clave: string; nota: string }[] = [];
  const creditos: typeof normales = [], interna: typeof normales = [];
  const excl = new Map<string, number>();
  for (const f of pendientes) {
    if (!pendiente(f) || esPropia(f.cliente)) continue;
    if (en(cfg.excluir_saldos, f.cliente)) { excl.set(titulo(f.cliente), (excl.get(titulo(f.cliente)) ?? 0) + f.saldo); continue; }
    if (en(cfg.deuda_interna, f.cliente)) { interna.push({ f, clave: norm(f.cliente), nota: "" }); continue; }
    const c = cfg.creditos_activos.find((c) => norm(c.cliente) === norm(f.cliente) && (!c.sucursal || norm(c.sucursal) === norm(f.sucursal)));
    if (c) creditos.push({ f, clave: `${norm(c.cliente)}|${norm(c.sucursal)}`, nota: [c.sucursal, c.nota].filter(Boolean).join(" · ") });
    else normales.push({ f, clave: norm(f.cliente), nota: "" });
  }
  const filas = agrupar(normales, corte), cr = agrupar(creditos, corte), int = agrupar(interna, corte);
  const subtotal = suma(filas), subtotalCreditos = suma(cr);
  return {
    filas, subtotal, creditos: cr, subtotalCreditos, total: subtotal + subtotalCreditos, interna: int, totalInterna: suma(int),
    excluidos: [...excl].map(([cliente, saldo]) => ({ cliente, saldo })),
  };
}

export const fotoDe = (s: SaldosExternos): Foto => ({ externos: s.total, creditos: s.subtotalCreditos, interna: s.totalInterna });
