import { expect, it } from 'vitest';
import {
  columnas,
  coincide,
  mover,
  posicionEntre,
  resumenPorGrupo,
  sinFiltros,
  type TarjetaTienda,
} from '../../lib/crm/kanban';

const etapas = [
  { id: 'b', nombre: 'Búsqueda', orden: 2, tipo: 'abierta' as const },
  { id: 'a', nombre: 'Firma', orden: 1, tipo: 'abierta' as const },
  { id: 'o', nombre: 'Operando', orden: 3, tipo: 'ganada' as const },
];
const t = (
  id: string,
  etapa: string,
  posicion: number,
  extra: Partial<TarjetaTienda> = {},
): TarjetaTienda => ({
  id,
  nombre: `Tienda ${id}`,
  etapa_id: etapa,
  posicion,
  version: 1,
  franquiciatario: null,
  ciudad: null,
  tipo_franquicia: null,
  fecha_programada_arranque: null,
  revisar: [],
  notas: 0,
  archivos: 0,
  checklist: { hechos: 0, total: 0 },
  actividadesAbiertas: 0,
  ...extra,
});

it('calcula la posición entre vecinos y pide renumerar cuando se agota el espacio', () => {
  expect(posicionEntre()).toBe(1024);
  expect(posicionEntre(1024)).toBe(2048);
  expect(posicionEntre(undefined, 1024)).toBe(512);
  expect(posicionEntre(1024, 2048)).toBe(1536);
  expect(posicionEntre(1, 1 + 1e-9)).toBeNull();
});

it('ordena columnas por orden de etapa y tarjetas por posición', () => {
  const c = columnas(etapas, [t('2', 'a', 2048), t('1', 'a', 1024), t('3', 'o', 10)]);
  expect(c.map((x) => x.etapa.id)).toEqual(['a', 'b', 'o']);
  expect(c[0].tarjetas.map((x) => x.id)).toEqual(['1', '2']);
  expect(resumenPorGrupo(c)).toEqual({ abierta: 2, ganada: 1, lateral: 0, perdida: 0 });
});

it('mueve una tarjeta a otra columna sin tocar el tablero original (rollback posible)', () => {
  const original = columnas(etapas, [t('1', 'a', 1024), t('2', 'b', 1024), t('3', 'b', 2048)]);
  const r = mover(original, '1', 'b', 1)!;
  expect(r.posicion).toBe(1536);
  expect(r.tablero[0].tarjetas).toHaveLength(0);
  expect(r.tablero[1].tarjetas.map((x) => x.id)).toEqual(['2', '1', '3']);
  expect(original[0].tarjetas.map((x) => x.id)).toEqual(['1']);
  expect(mover(original, 'no-existe', 'b', 0)).toBeNull();
});

it('reordena dentro de la misma columna', () => {
  const tablero = columnas(etapas, [t('1', 'a', 1024), t('2', 'a', 2048), t('3', 'a', 3072)]);
  const r = mover(tablero, '3', 'a', 0)!;
  expect(r.tablero[0].tarjetas.map((x) => x.id)).toEqual(['3', '1', '2']);
  expect(r.posicion).toBe(512);
});

it('filtra por texto sin acentos, tipo de franquicia y pendientes de revisar', () => {
  const x = t('1', 'a', 1, {
    nombre: 'Querétaro Centro',
    tipo_franquicia: 'maestra',
    revisar: ['fecha_apertura'],
  });
  expect(coincide(x, { ...sinFiltros, texto: 'queretaro' })).toBe(true);
  expect(coincide(x, { ...sinFiltros, tipo: 'franquiciatario' })).toBe(false);
  expect(coincide(x, { ...sinFiltros, tipo: 'sin' })).toBe(false);
  expect(coincide(t('2', 'a', 1), { ...sinFiltros, tipo: 'sin' })).toBe(true);
  expect(coincide(t('2', 'a', 1), { ...sinFiltros, revisar: true })).toBe(false);
});
