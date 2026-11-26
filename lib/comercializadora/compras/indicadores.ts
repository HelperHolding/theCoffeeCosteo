// lib/comercializadora/compras/indicadores.ts
import { pesos } from '@/lib/comercializadora/formato';
import type { Semaforo, TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

export type TonoIndicador = 'ok' | 'bajo' | 'pierde' | 'neutro';
export type TarjetaIndicador = {
  clave: 'venta' | 'compras' | 'ratio' | 'llegaron' | 'entregas' | 'lead' | 'mayor' | 'vencidas' | 'faltan';
  etiqueta: string; valor: string; nota: string; tono: TonoIndicador;
};

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const dias = (x: number | null) => (x == null ? '—' : `${x} días`);
const TONO: Record<Semaforo, TonoIndicador> = { ok: 'ok', cerca: 'bajo', fuera: 'pierde' };

/** Los 9 indicadores del tablero (spec §3) como texto: los pinta la pantalla y la descarga. */
export function tarjetasIndicadores(t: TableroCompras, faltan: number | null): TarjetaIndicador[] {
  const { k, kAnt } = t;
  const ant = `Anterior (${t.anterior.etiqueta}):`;
  return [
    { clave: 'venta', etiqueta: 'Venta', valor: pesos(k.venta), nota: `${ant} ${pesos(kAnt.venta)}`, tono: 'neutro' },
    { clave: 'compras', etiqueta: 'Compras recibidas', valor: pesos(k.compras), nota: `${ant} ${pesos(kAnt.compras)}`, tono: 'neutro' },
    { clave: 'ratio', etiqueta: 'Compras / venta · meta 45–55%', valor: pct(k.ratio), nota: `${ant} ${pct(kAnt.ratio)}`, tono: k.semaforo ? TONO[k.semaforo] : 'neutro' },
    { clave: 'llegaron', etiqueta: 'OCs que llegaron', valor: String(k.llegaron.n), nota: `${k.llegaron.mismas} elaboradas en el periodo · ${k.llegaron.antes} antes · ${ant} ${kAnt.llegaron.n}`, tono: 'neutro' },
    { clave: 'entregas', etiqueta: 'Entregas a tiempo', valor: pct(k.entregas.pct), nota: `${k.entregas.aTiempo} a tiempo · ${k.entregas.tarde} tarde · ${k.entregas.sinFecha} sin fecha · ${ant} ${pct(kAnt.entregas.pct)}`, tono: 'neutro' },
    { clave: 'lead', etiqueta: 'Lead time promedio', valor: dias(k.lead), nota: `De la emisión de la OC a su primera recepción · ${ant} ${dias(kAnt.lead)}`, tono: 'neutro' },
    { clave: 'mayor', etiqueta: 'Mayor compra del periodo', valor: k.mayor ? pesos(k.mayor.monto) : '—', nota: k.mayor ? k.mayor.proveedor : 'Sin compras recibidas', tono: 'neutro' },
    { clave: 'vencidas', etiqueta: 'OCs vencidas sin recibir', valor: String(t.vencidas.n), nota: `${pesos(t.vencidas.monto)} con arribo esperado ya pasado`, tono: t.vencidas.n ? 'pierde' : 'neutro' },
    { clave: 'faltan', etiqueta: 'Faltan por comprar', valor: faltan == null ? '—' : pesos(faltan), nota: faltan == null ? 'No se pudo calcular el plan' : 'Lo que el plan de abastos pide esta semana', tono: 'neutro' },
  ];
}
