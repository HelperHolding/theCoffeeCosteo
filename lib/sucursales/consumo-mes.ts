// lib/sucursales/consumo-mes.ts
import type { ConfigSucursal } from './config';
import { consumir, type DatosConsumo } from './consumo';
import type { FuenteRappi, LecturaNormal } from './datos';
import type { CatalogoNombres } from './metricas';
import type { Origen, PedidoNormal } from './normalizar';
import { diasEntre, enZona, sumarDias } from './tiempo';

/**
 * Consumo nacional por mes (docs/sucursales/17): el consumo de UN mes cerrado de UNA sucursal, separado por origen,
 * con el MISMO cálculo que la sección Consumo (consumir). Puro: no lee la API ni la base.
 * Cada origen se calcula con sus pedidos y, como evidencia de identidad, con TODOS los del mes (igual que la página),
 * así que la suma de los orígenes es el consumo con «todos».
 */
export type CoberturaMes = {
  lineas: number;
  incluidas: number;
  generico: number;
  sinCodigo: number;
  sinEnlace: number;
};
export type SinRecetaMes = { nombre: string; unidades: number; sinCodigo: boolean };
export interface RenglonConsumoMes {
  origen: Origen;
  insumo_id: string;
  insumo: string;
  unidad: string;
  categoria: string;
  cantidad: number;
}
export interface FilaConsumoMes {
  mes: string;
  companyId: number;
  completa: boolean;
  recetasLeidasEn: string;
  cobertura: Partial<Record<Origen, CoberturaMes>>;
  sinReceta: Partial<Record<Origen, SinRecetaMes[]>>;
  insumos: RenglonConsumoMes[];
}

const ORIGENES: Origen[] = ['mostrador', 'app', 'rappi', 'desconocido'];
const ZONA_MEXICO = 'America/Mexico_City';

export function leerMes(texto: string): { mes: string; desde: string; hasta: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texto);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  const desde = `${m[1]}-${m[2]}-01`;
  const siguiente = +m[2] === 12 ? `${+m[1] + 1}-01-01` : `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-01`;
  return { mes: desde, desde, hasta: sumarDias(siguiente, -1) };
}

/** Un mes ('AAAA-MM-01') está cerrado si es anterior al mes actual en la Ciudad de México. */
/** Las sucursales de --companias (todas las configuradas sin ids); si ninguna coincide es un error, no un mes vacío. */
export function elegirSucursales(ids: number[], configuradas: ConfigSucursal[]): ConfigSucursal[] {
  const elegidas = ids.length ? configuradas.filter((s) => ids.includes(s.companyId)) : configuradas;
  if (!elegidas.length) throw new Error('Ninguna sucursal configurada coincide con --companias');
  return elegidas;
}

export function mesCerrado(mes: string, ahora: Date = new Date()): boolean {
  return mes.slice(0, 7) < enZona(ahora, ZONA_MEXICO).fecha.slice(0, 7);
}

export function consumoMesSucursal(a: {
  mes: string;
  companyId: number;
  lectura: LecturaNormal;
  datos: DatosConsumo;
  catalogo?: CatalogoNombres;
  piloto: boolean;
}): FilaConsumoMes {
  const todos = a.lectura.pedidos;
  const fechas = Array.from(
    { length: diasEntre(a.lectura.desde, a.lectura.hasta) + 1 },
    (_, i) => sumarDias(a.lectura.desde, i),
  );
  const fila: FilaConsumoMes = {
    mes: a.mes,
    companyId: a.companyId,
    completa: a.lectura.estado === 'completa',
    recetasLeidasEn: a.datos.leidoEn,
    cobertura: {},
    sinReceta: {},
    insumos: [],
  };
  for (const origen of ORIGENES) {
    const ps: PedidoNormal[] = todos.filter((p) => p.origen === origen);
    if (!ps.length) continue;
    const r = consumir(ps, a.datos, todos, a.catalogo, fechas, a.piloto);
    const c = r.cobertura;
    fila.cobertura[origen] = {
      lineas: c.lineas,
      incluidas: c.incluidas,
      generico: c.generico,
      sinCodigo: c.sinCodigo,
      sinEnlace: c.sinEnlace,
    };
    fila.sinReceta[origen] = r.sinReceta.map((s) => ({ nombre: s.nombre, unidades: s.unidades, sinCodigo: s.sinCodigo }));
    for (const i of r.insumos)
      if (i.cantidad > 0)
        fila.insumos.push({
          origen,
          insumo_id: i.insumoId,
          insumo: i.insumo,
          unidad: i.unidad,
          categoria: i.categoria,
          cantidad: i.cantidad,
        });
  }
  fila.insumos.sort((x, y) => x.insumo_id.localeCompare(y.insumo_id) || x.origen.localeCompare(y.origen));
  return fila;
}

/**
 * Rappi del portal leído DÍA POR DÍA: la API de Supabase corta las respuestas en 1,000 filas y un mes de una sucursal
 * puede pasarlas. Si un día no se lee, el periodo es null y la lectura queda parcial (conRappi), nunca incompleta en
 * silencio.
 */
export function rappiPorDias(fuente: FuenteRappi | undefined): FuenteRappi | undefined {
  if (!fuente) return undefined;
  return async (desde, hasta) => {
    const todos: PedidoNormal[] = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      const r = await fuente(f, f);
      if (!r) return null;
      todos.push(...r);
    }
    return todos;
  };
}
