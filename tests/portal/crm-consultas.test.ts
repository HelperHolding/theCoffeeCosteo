import { expect, it } from 'vitest';
import { archivosPorTienda } from '../../lib/crm/consultas';

it('cuenta los archivos de la tienda y los adjuntos de sus notas', () => {
  const n = archivosPorTienda(
    [
      { tienda_id: 't1', nota_id: null },
      { tienda_id: null, nota_id: 'n1' },
      { tienda_id: null, nota_id: 'n2' },
      { tienda_id: null, nota_id: 'n-de-prospecto' },
      { tienda_id: 't2', nota_id: null },
    ],
    [
      { id: 'n1', tienda_id: 't1' },
      { id: 'n2', tienda_id: 't2' },
    ],
  );
  expect(Object.fromEntries(n)).toEqual({ t1: 2, t2: 2 });
});
