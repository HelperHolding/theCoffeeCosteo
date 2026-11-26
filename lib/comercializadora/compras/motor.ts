// lib/comercializadora/compras/motor.ts — aparte de datos.ts para que la lectura no cargue el motor.
import 'server-only';
import { cafeOrdenesMotor, importacionesMotor, motorPlan, planLocalMotor } from '@/lib/comercializadora/motor';
import { planSemCalc, planSemW, type FuentesPlan } from '@/lib/comercializadora/planAbastos';
import type { Sem } from '../../../supabase/functions/_shared/planSem.ts';

/** La semana del motor del Plan de abastos, igual que «Esta semana» (las tres categorías). */
export async function semDelMotor(db: unknown): Promise<{ ok: true; S: Sem; hoyIso: string } | { ok: false; error: string }> {
  try {
    const m = await motorPlan(db as Parameters<typeof motorPlan>[0]);
    if (!m.ok) return { ok: false, error: m.error };
    const c = planLocalMotor(m);
    const f: FuentesPlan = { cafe: null, imp: null };
    const S = planSemCalc(c, { local: true, cafe: true, imp: true }, planSemW(c, 0), {
      cafe: () => (f.cafe = cafeOrdenesMotor(m)),
      imp: () => (f.imp = importacionesMotor(m, null)),
    });
    return { ok: true, S, hoyIso: c.hoyIso };
  } catch {
    return { ok: false, error: 'No se pudo calcular el plan de compra. Intenta de nuevo en unos minutos.' };
  }
}
