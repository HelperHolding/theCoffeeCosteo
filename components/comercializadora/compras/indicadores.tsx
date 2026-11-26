// components/comercializadora/compras/indicadores.tsx
import { AlertTriangle, Clock, ListTodo, PackageCheck, Percent, ShoppingBag, Timer, Trophy, Truck } from 'lucide-react';
import { Kpi } from '@/components/portal/piezas';
import { pesos } from '@/lib/comercializadora/formato';
import type { Semaforo, TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const TONO: Record<Semaforo, 'ok' | 'bajo' | 'pierde'> = { ok: 'ok', cerca: 'bajo', fuera: 'pierde' };

export function IndicadoresCompras({ t, faltan }: { t: TableroCompras; faltan: number | null }) {
  const { k, kAnt } = t;
  const ant = `Anterior (${t.anterior.etiqueta}):`;
  return (
    <section aria-label="Indicadores" className="mb-6 grid gap-3 *:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
      <Kpi etiqueta="Venta" icono={ShoppingBag} valor={pesos(k.venta)} nota={`${ant} ${pesos(kAnt.venta)}`} />
      <Kpi etiqueta="Compras recibidas" icono={PackageCheck} valor={pesos(k.compras)} nota={`${ant} ${pesos(kAnt.compras)}`} />
      <Kpi etiqueta="Compras / venta · meta 45–55%" icono={Percent} valor={pct(k.ratio)} tono={k.semaforo ? TONO[k.semaforo] : 'neutro'} nota={`${ant} ${pct(kAnt.ratio)}`} />
      <Kpi etiqueta="OCs que llegaron" icono={Truck} valor={k.llegaron.n} nota={`${k.llegaron.mismas} elaboradas en el periodo · ${k.llegaron.antes} antes · ${ant} ${kAnt.llegaron.n}`} />
      <Kpi etiqueta="Entregas a tiempo" icono={Clock} valor={pct(k.entregas.pct)} nota={`${k.entregas.aTiempo} a tiempo · ${k.entregas.tarde} tarde · ${k.entregas.sinFecha} sin fecha · ${ant} ${pct(kAnt.entregas.pct)}`} />
      <Kpi etiqueta="Lead time promedio" icono={Timer} valor={k.lead == null ? '—' : `${k.lead} días`} nota={`De la emisión de la OC a su primera recepción · ${ant} ${kAnt.lead == null ? '—' : `${kAnt.lead} días`}`} />
      <Kpi etiqueta="Mayor compra del periodo" icono={Trophy} valor={k.mayor ? pesos(k.mayor.monto) : '—'} nota={k.mayor ? k.mayor.proveedor : 'Sin compras recibidas'} />
      <Kpi etiqueta="OCs vencidas sin recibir" icono={AlertTriangle} valor={t.vencidas.n} tono={t.vencidas.n ? 'pierde' : 'neutro'} nota={`${pesos(t.vencidas.monto)} con arribo esperado ya pasado`} />
      <Kpi etiqueta="Faltan por comprar" icono={ListTodo} valor={faltan == null ? '—' : pesos(faltan)} nota={faltan == null ? 'No se pudo calcular el plan' : 'Lo que el plan de abastos pide esta semana'} />
    </section>
  );
}
