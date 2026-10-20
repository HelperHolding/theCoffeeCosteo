import { expect, it } from 'vitest';
import { textoBusqueda } from '../../components/crm/listas';

it('limpia el texto de búsqueda para el filtro or de PostgREST', () => {
  expect(textoBusqueda('a,b(c)*d%e\\f"g')).toBe('a b c  d e f g');
  expect(textoBusqueda('  Querétaro  ')).toBe('Querétaro');
  expect(textoBusqueda(undefined)).toBe('');
  expect(textoBusqueda('x'.repeat(100))).toHaveLength(80);
});
