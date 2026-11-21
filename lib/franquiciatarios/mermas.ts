import type { FranqInsumo, FranqMerma, FranqMermaTolerancia, MotivoMerma } from './tipos';

/**
 * Mermas con tolerancia (F6, migración 92). La merma se registra en la unidad de CONTEO del insumo (franq_insumos);
 * el consumo teórico sale en la unidad base de Costeo (gr, ml o pza). La lista sugerida cuenta por paquete cuando la
 * presentación es mayor a 1 («paquete de 1500 gr», la misma regla que franq_sugerir_insumos, migración 83): con esa
 * unidad el factor es la presentación; si la gerencia la cambió a la unidad base, el factor es 1. Un alta manual (sin
 * insumo de Costeo) se registra sin comparar.
 */
export const TOLERANCIA_DEFECTO = 3;

export const MOTIVOS: Record<MotivoMerma, string> = {
  caducidad: 'Caducidad',
  preparacion: 'Error de preparación',
  caida: 'Caída o derrame',
  devolucion: 'Devolución del cliente',
  otro: 'Otro',
};

export const vigentesMerma = (ms: FranqMerma[]) => {
  const corregidas = new Set(ms.map((m) => m.corrige_id).filter((x) => x !== null));
  return ms.filter((m) => !m.anulada && !corregidas.has(m.id));
};

/** Tolerancia vigente por insumo de la lista (el último registro manda). */
export function toleranciasVigentes(ts: FranqMermaTolerancia[]): Map<number, number> {
  const m = new Map<number, { id: number; pct: number }>();
  for (const t of ts) {
    const previa = m.get(t.insumo_id);
    if (!previa || t.id > previa.id) m.set(t.insumo_id, { id: t.id, pct: Number(t.pct) });
  }
  return new Map([...m].map(([k, v]) => [k, v.pct]));
}

/** Datos de Costeo de un insumo, SOLO en el servidor (el costo nunca llega a la cuenta de baristas). */
export interface InsumoCosteo {
  presentacion: number;
  /** Costo por unidad base (gr, ml o pza). */
  costoUnitario: number | null;
}

export interface FilaMerma {
  insumoId: number;
  nombre: string;
  unidad: string;
  /** Merma vigente del día en la unidad de conteo. */
  merma: number;
  registros: number;
  /** Consumo teórico del día en la unidad de conteo; null si el insumo no viene de Costeo o no hay cálculo. */
  teorico: number | null;
  /** merma ÷ teórico; null sin teórico o con teórico en cero. */
  pct: number | null;
  tolerancia: number;
  /** Fuera de tolerancia (con teórico) o merma sin ninguna venta que la explique (teórico en cero). */
  fuera: boolean;
  /** Valor a costo de la merma (solo gestores; null sin costo). */
  valor: number | null;
}

export function compararMermas(a: {
  insumos: Pick<FranqInsumo, 'id' | 'insumo_id' | 'nombre' | 'unidad' | 'activo' | 'orden'>[];
  mermas: FranqMerma[];
  tolerancias: Map<number, number>;
  /** Consumo teórico del día por insumo de Costeo (unidad base); null si no se pudo calcular. */
  consumo: Map<string, number> | null;
  costeo: Map<string, InsumoCosteo>;
}): FilaMerma[] {
  const vig = vigentesMerma(a.mermas);
  return a.insumos
    .filter((i) => i.activo || vig.some((m) => m.insumo_id === i.id))
    .sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre, 'es'))
    .map((i) => {
      const propias = vig.filter((m) => m.insumo_id === i.id);
      const merma = propias.reduce((s, m) => s + Number(m.cantidad), 0);
      const c = i.insumo_id ? a.costeo.get(i.insumo_id) : undefined;
      const factor = c && c.presentacion > 1 && /^paquete/i.test(i.unidad.trim()) ? c.presentacion : 1;
      const base = i.insumo_id && a.consumo ? (a.consumo.get(i.insumo_id) ?? 0) : null;
      const teorico = base === null || !c ? null : base / factor;
      const pct = teorico && teorico > 0 ? merma / teorico : null;
      const tolerancia = a.tolerancias.get(i.id) ?? TOLERANCIA_DEFECTO;
      return {
        insumoId: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        merma,
        registros: propias.length,
        teorico,
        pct,
        tolerancia,
        fuera: merma > 0 && teorico !== null && (pct === null ? true : pct * 100 > tolerancia + 1e-9),
        valor: c && c.costoUnitario !== null ? merma * factor * c.costoUnitario : null,
      };
    });
}
