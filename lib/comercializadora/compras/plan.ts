// lib/comercializadora/compras/plan.ts
import { PSEM_CATS, type Sem } from '../../../supabase/functions/_shared/planSem.ts';
import { ctxFila } from '../../../supabase/functions/_shared/planHoy.ts';
import { planKey } from '../../../supabase/functions/_shared/planBuild.ts';
import { type Categoria, categoriaSku } from '../../../supabase/functions/_shared/compras/reglas.ts';
import type { Cat } from '../../../supabase/functions/_shared/compras/tablero.ts';

export type Urgencia = 'Urgente' | 'Pronto' | 'Normal';
export type FilaPlanCompra = {
  urgencia: Urgencia; sku: string; nombre: string; proveedor: string; categoria: Categoria; decision: string;
  inventario: number; faltaSurtir: number; dias: number | null; pedir: [number, number]; costo: [number, number];
  llega: string | null; llegaVencida: boolean;
};
export type PlanCompra = { filas: FilaPlanCompra[]; urgentes: { n: number; monto: number }; pronto: { n: number; monto: number }; faltan: number };

/** Nombre de proveedor comparable entre Zoho y el plan: sin acentos, sin mayúsculas ni espacios en los extremos. */
const clave = (x: string) => planKey(String(x).normalize('NFD').replace(/\p{Diacritic}/gu, ''));

export const urgenciaDe = (dias: number | null): Urgencia => (dias == null ? 'Normal' : dias < 5 ? 'Urgente' : dias < 10 ? 'Pronto' : 'Normal');
const RANGO: Record<Urgencia, number> = { Urgente: 0, Pronto: 1, Normal: 2 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const costoSem = (r: any, k: number, q: number) =>
  Number(r.m?.[k]) > 0 ? Number(r.m[k]) : Number(r.costo) > 0 ? (r.contenedor ? Number(r.costo) : q * Number(r.costo)) : 0;

/** Plan de compra del tablero (spec §3): lo que el motor pide esta semana o la próxima, con urgencia por días que alcanza. */
export function planCompra(S: Sem, f: { categoria: Cat | null; proveedor: string | null }, hoy: string): PlanCompra {
  const filas: FilaPlanCompra[] = [];
  const prov = f.proveedor ? clave(f.proveedor) : null;
  for (const d of PSEM_CATS) {
    for (const g of S.cat[d.id]?.provs ?? []) {
      if (prov && clave(g.nombre) !== prov) continue;
      for (const r of g.rows) {
        const q0 = Number(r.sem?.[0]) || 0, q1 = Number(r.sem?.[1]) || 0;
        if (q0 <= 0 && q1 <= 0) continue;
        const categoria = categoriaSku(r.sku);
        if (f.categoria && categoria !== f.categoria) continue;
        const ctx = ctxFila(r, 0);
        const tienes = Number(ctx?.tienes) || 0;
        const dias = ctx?.diasHoy ?? null;
        const llega: string | null = r.llegaOC ?? null;
        filas.push({
          urgencia: urgenciaDe(dias), sku: String(r.sku), nombre: String(r.nombre ?? r.sku), proveedor: g.nombre, categoria,
          decision: String(r.calc?.accion ?? (q0 > 0 ? 'PEDIR' : 'PRÓXIMA')),
          inventario: Math.max(0, tienes), faltaSurtir: tienes < 0 ? -tienes : 0, dias,
          pedir: [q0, q1], costo: [costoSem(r, 0, q0), costoSem(r, 1, q1)],
          llega, llegaVencida: !!llega && llega < hoy,
        });
      }
    }
  }
  filas.sort((a, b) => RANGO[a.urgencia] - RANGO[b.urgencia] || (a.dias ?? 1e9) - (b.dias ?? 1e9) || a.nombre.localeCompare(b.nombre, 'es'));
  const suma = (u: Urgencia) => {
    const xs = filas.filter((x) => x.urgencia === u);
    return { n: xs.length, monto: xs.reduce((a, x) => a + x.costo[0] + x.costo[1], 0) };
  };
  return { filas, urgentes: suma('Urgente'), pronto: suma('Pronto'), faltan: filas.reduce((a, x) => a + x.costo[0], 0) };
}
