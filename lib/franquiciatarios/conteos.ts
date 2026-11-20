// Conteos de insumos críticos (migración 83): armado puro del historial que ve la gerencia.
import type { FranqConteo, FranqInsumo, MomentoConteo } from './tipos';

export const MOMENTOS: { clave: MomentoConteo; nombre: string }[] = [
  { clave: 'apertura', nombre: 'Apertura' },
  { clave: 'medio', nombre: 'Medio turno' },
];
export const DIAS_HISTORIAL = 7;

export interface ColumnaConteo {
  dia: string;
  momento: MomentoConteo;
  nombre: string | null;
  registrado_en: string | null;
}
export interface FilaHistorial {
  insumo: Pick<FranqInsumo, 'id' | 'nombre' | 'unidad' | 'activo'>;
  /** Cantidad vigente por columna (null = no se contó). */
  cantidades: (number | null)[];
}

/**
 * Historial de conteos: una columna por día y momento con algún conteo (más reciente primero) y una fila por insumo
 * de la lista (activos primero, en su orden). Vale el conteo vigente: el que ningún recuento corrigió.
 */
export function armarHistorial(
  insumos: FranqInsumo[],
  conteos: FranqConteo[],
): { columnas: ColumnaConteo[]; filas: FilaHistorial[] } {
  const corregidos = new Set(conteos.map((c) => c.corrige_id).filter((x) => x !== null));
  const vigentes = conteos.filter((c) => !corregidos.has(c.id));
  const clave = (dia: string, momento: string) => `${dia}|${momento}`;
  const porColumna = new Map<string, ColumnaConteo>();
  for (const c of vigentes) {
    const k = clave(c.dia, c.momento);
    const previa = porColumna.get(k);
    if (!previa || (previa.registrado_en ?? '') < c.registrado_en)
      porColumna.set(k, { dia: c.dia, momento: c.momento, nombre: c.nombre, registrado_en: c.registrado_en });
  }
  const orden: Record<MomentoConteo, number> = { apertura: 0, medio: 1 };
  const columnas = [...porColumna.values()].sort(
    (a, b) => b.dia.localeCompare(a.dia) || orden[b.momento] - orden[a.momento],
  );
  const valor = new Map(
    vigentes.map((c) => [`${c.insumo_id}|${clave(c.dia, c.momento)}`, Number(c.cantidad)]),
  );
  const filas = [...insumos]
    .sort(
      (a, b) => Number(b.activo) - Number(a.activo) || a.orden - b.orden || a.nombre.localeCompare(b.nombre),
    )
    .filter((i) => i.activo || columnas.some((col) => valor.has(`${i.id}|${clave(col.dia, col.momento)}`)))
    .map((i) => ({
      insumo: { id: i.id, nombre: i.nombre, unidad: i.unidad, activo: i.activo },
      cantidades: columnas.map((col) => valor.get(`${i.id}|${clave(col.dia, col.momento)}`) ?? null),
    }));
  return { columnas, filas };
}
