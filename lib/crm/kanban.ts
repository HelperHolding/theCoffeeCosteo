import type { Etapa, TipoEtapa } from './tipos';

/** Lo mínimo que el tablero necesita de una tienda. */
export interface TarjetaTienda {
  id: string;
  nombre: string;
  etapa_id: string;
  posicion: number;
  version: number;
  franquiciatario: string | null;
  ciudad: string | null;
  tipo_franquicia: 'franquiciatario' | 'maestra' | null;
  fecha_programada_arranque: string | null;
  revisar: string[];
  notas: number;
  archivos: number;
  checklist: { hechos: number; total: number };
  actividadesAbiertas: number;
}

export interface Columna<T extends TarjetaTienda = TarjetaTienda> {
  etapa: Pick<Etapa, 'id' | 'nombre' | 'orden' | 'tipo'>;
  tarjetas: T[];
}

const PASO = 1024;
/** Distancia mínima entre vecinos antes de renumerar la columna (double precision aguanta ~50 bisecciones). */
const MINIMO = 1e-6;

/** Posición para quedar entre `antes` y `despues` (vecinos en la columna destino); null = hay que renumerar. */
export function posicionEntre(antes?: number, despues?: number): number | null {
  if (antes === undefined && despues === undefined) return PASO;
  if (antes === undefined) return despues! / 2 > MINIMO ? despues! / 2 : null;
  if (despues === undefined) return antes + PASO;
  return despues - antes > MINIMO ? (antes + despues) / 2 : null;
}

export function columnas<T extends TarjetaTienda>(
  etapas: Pick<Etapa, 'id' | 'nombre' | 'orden' | 'tipo'>[],
  tiendas: T[],
): Columna<T>[] {
  const porEtapa = new Map<string, T[]>(etapas.map((e) => [e.id, []]));
  for (const t of tiendas) porEtapa.get(t.etapa_id)?.push(t);
  return [...etapas]
    .sort((a, b) => a.orden - b.orden)
    .map((etapa) => ({
      etapa,
      tarjetas: porEtapa
        .get(etapa.id)!
        .sort((a, b) => a.posicion - b.posicion || a.nombre.localeCompare(b.nombre, 'es')),
    }));
}

/** Mueve una tarjeta en memoria (actualización optimista). Devuelve el tablero nuevo y la posición a guardar. */
export function mover<T extends TarjetaTienda>(
  tablero: Columna<T>[],
  tiendaId: string,
  etapaDestino: string,
  indice: number,
): { tablero: Columna<T>[]; posicion: number | null } | null {
  const origen = tablero.find((c) => c.tarjetas.some((t) => t.id === tiendaId));
  const destino = tablero.find((c) => c.etapa.id === etapaDestino);
  if (!origen || !destino) return null;
  const tarjeta = origen.tarjetas.find((t) => t.id === tiendaId)!;
  const restantes = destino.tarjetas.filter((t) => t.id !== tiendaId);
  const i = Math.max(0, Math.min(indice, restantes.length));
  const posicion = posicionEntre(restantes[i - 1]?.posicion, restantes[i]?.posicion);
  const movida = { ...tarjeta, etapa_id: etapaDestino, posicion: posicion ?? tarjeta.posicion };
  const nuevoDestino = [...restantes.slice(0, i), movida, ...restantes.slice(i)];
  return {
    posicion,
    tablero: tablero.map((c) =>
      c.etapa.id === etapaDestino
        ? { ...c, tarjetas: nuevoDestino }
        : c === origen
          ? { ...c, tarjetas: c.tarjetas.filter((t) => t.id !== tiendaId) }
          : c,
    ),
  };
}

export interface Filtros {
  texto: string;
  tipo: '' | 'franquiciatario' | 'maestra' | 'sin';
  revisar: boolean;
}
export const sinFiltros: Filtros = { texto: '', tipo: '', revisar: false };

const normal = (s: string) =>
  s
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
export function coincide(t: TarjetaTienda, f: Filtros): boolean {
  const q = normal(f.texto.trim());
  if (q && ![t.nombre, t.franquiciatario, t.ciudad].some((v) => v && normal(v).includes(q))) return false;
  if (f.tipo === 'sin' ? t.tipo_franquicia !== null : f.tipo && t.tipo_franquicia !== f.tipo) return false;
  if (f.revisar && t.revisar.length === 0) return false;
  return true;
}

/** Grupos de etapas para los indicadores del tablero. */
export const GRUPOS: Record<TipoEtapa, string> = {
  abierta: 'En proceso',
  ganada: 'Operando',
  lateral: 'En pausa',
  perdida: 'Cerradas',
};
export function resumenPorGrupo(tablero: Columna[]): Record<TipoEtapa, number> {
  const r: Record<TipoEtapa, number> = { abierta: 0, ganada: 0, lateral: 0, perdida: 0 };
  for (const c of tablero) r[c.etapa.tipo] += c.tarjetas.length;
  return r;
}
